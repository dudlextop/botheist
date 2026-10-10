import {
  buildSystemPrompt,
  cashierTools,
  providerFor,
  runAgentTurn,
  type MessageParam,
  type ModelProvider,
} from "@botheist/agent";
import { enqueue, type Db, type ModelBrain, type Prisma, type RegressionMode } from "@botheist/db";
import {
  RULES,
  applyToolCall,
  checkRule,
  regressionReplay,
  type RuleId,
  type StoreState,
  type ToolGuards,
} from "@botheist/engine";
import { agentConfigFromRow } from "./agentVersions";
import { AppError, forbidden, notFound } from "./errors";
import { defaultBrain, getOperations } from "./runs";
import { normalizeApiKey, openSecret, sealSecret } from "./secrets";

export const MAX_RERUNS = 5;
const RERUN_BUDGET_MICROS = 2_000_000; // $2 per regression request

export async function requestRegression(
  db: Db,
  organizerId: string,
  input: { findingId: string; targetAgentVersionId: string; mode: RegressionMode; repeats?: number; apiKey?: unknown },
) {
  // Only agent reruns call the model; an action replay never needs a key.
  const apiKey = input.mode === "AGENT_RERUN" ? normalizeApiKey(input.apiKey) : null;
  const brain: ModelBrain = apiKey ? "PLAYER_KEY" : defaultBrain();
  const finding = await db.finding.findUnique({ where: { id: input.findingId }, include: { campaign: true } });
  if (!finding) throw notFound("Finding");
  if (finding.campaign.organizerId !== organizerId) throw forbidden("Only the campaign organizer can run regressions");
  if (finding.status !== "CONFIRMED") throw new AppError("NOT_CONFIRMED", "Only confirmed findings can be replayed");
  const target = await db.agentVersion.findUnique({ where: { id: input.targetAgentVersionId } });
  if (!target) throw notFound("Agent version");
  const repeats = input.mode === "AGENT_RERUN" ? Math.min(Math.max(input.repeats ?? 3, 1), MAX_RERUNS) : 1;
  const regression = await db.$transaction(async (tx) => {
    const r = await tx.regressionRun.create({
      data: { findingId: finding.id, targetAgentVersionId: target.id, mode: input.mode, repeats, brain, apiKeySealed: apiKey ? sealSecret(apiKey) : null },
    });
    await tx.finding.update({ where: { id: finding.id }, data: { addedToRegression: true } });
    await enqueue(tx, "regression", { regressionId: r.id }, { dedupeKey: `regression:${r.id}`, maxAttempts: 2 });
    return r;
  });
  return regression;
}

export async function runRegressionJob(db: Db, regressionId: string, opts: { provider?: ModelProvider } = {}) {
  const reg = await db.regressionRun.findUnique({
    where: { id: regressionId },
    include: { finding: { include: { run: true } }, targetAgentVersion: true },
  });
  if (!reg || reg.status === "DONE") return;
  await db.regressionRun.update({ where: { id: regressionId }, data: { status: "RUNNING" } });

  const rule = reg.finding.rule as RuleId;
  const seedState = reg.finding.run.seedState as unknown as StoreState;
  const guards = reg.targetAgentVersion.guards as unknown as ToolGuards;
  const ops = await getOperations(db, reg.finding.runId);

  let results: Record<string, unknown>;
  let summary: string;
  let cost = 0;

  if (reg.mode === "ACTION_REPLAY") {
    const r = regressionReplay({
      seedState,
      operations: ops,
      guards,
      rule,
      originalMutatingSeqs: ops.filter((o) => o.mutated).map((o) => o.seq),
    });
    results = { ...r };
    summary = r.blocked
      ? `Blocked at step ${r.blockedAtSeq}: ${r.blockedError?.message}. The saved sequence no longer breaks "${RULES[rule].title}".`
      : r.stillViolated
        ? `Still vulnerable: replaying the saved actions on ${reg.targetAgentVersion.name} breaks "${RULES[rule].title}" again.`
        : `Not reproduced: the saved actions run on ${reg.targetAgentVersion.name} without breaking the rule.`;
  } else {
    const config = agentConfigFromRow(reg.targetAgentVersion);
    const playerMessages = (
      await db.runEvent.findMany({ where: { runId: reg.finding.runId, type: "player_message" }, orderBy: { seq: "asc" } })
    ).map((e) => (e.payload as { text: string }).text);
    let apiKey: string | null = null;
    try {
      apiKey = reg.apiKeySealed ? openSecret(reg.apiKeySealed) : null;
    } catch {
      apiKey = null;
    }
    const provider = opts.provider ?? providerFor(config.model, { apiKey, offline: reg.brain === "OFFLINE", level: config.difficulty });
    const who = reg.brain === "OFFLINE" ? `offline ${reg.targetAgentVersion.name}` : reg.targetAgentVersion.name;
    const reruns: Array<{ violated: boolean; atMessage: number | null; toolCalls: number; error?: string }> = [];

    for (let i = 0; i < reg.repeats; i++) {
      let state = seedState;
      let history: MessageParam[] = [];
      let violatedAt: number | null = null;
      let toolCalls = 0;
      let error: string | undefined;
      for (const [m, text] of playerMessages.entries()) {
        if (cost >= RERUN_BUDGET_MICROS) {
          error = "regression budget reached";
          break;
        }
        let opSeq = toolCalls;
        const turn = await runAgentTurn(
          {
            provider,
            model: config.model,
            effort: config.effort,
            system: buildSystemPrompt(config, seedState),
            tools: cashierTools(),
            history,
            playerMessage: text,
            remainingToolCalls: 20 - toolCalls,
            remainingBudgetMicros: RERUN_BUDGET_MICROS - cost,
          },
          {
            async executeTool(call) {
              opSeq += 1;
              const applied = applyToolCall(state, { tool: call.name, input: call.input }, guards, opSeq, new Date().toISOString());
              state = applied.state;
              const o = applied.record.outcome;
              const broken = applied.record.mutated && checkRule(rule, state).length > 0;
              return { content: JSON.stringify(o.ok ? o.data : o.error), isError: !o.ok, stopRun: broken };
            },
          },
        );
        cost += turn.costMicros;
        toolCalls += turn.toolCalls;
        history = [...history, ...turn.appended];
        if (turn.outcome === "model_error") {
          error = turn.error;
          break;
        }
        if (turn.outcome === "run_stopped") {
          violatedAt = m + 1;
          break;
        }
      }
      reruns.push({ violated: violatedAt !== null, atMessage: violatedAt, toolCalls, ...(error ? { error } : {}) });
    }
    const hits = reruns.filter((r) => r.violated).length;
    const completed = reruns.filter((r) => !r.error).length;
    results = { reruns, playerMessages: playerMessages.length };
    summary =
      hits > 0
        ? `Violation reproduced in ${hits} of ${reg.repeats} reruns of the same messages on ${who}.`
        : `No violation observed in ${completed} rerun${completed === 1 ? "" : "s"} of the same messages on ${who}. This does not prove the agent is safe against other attempts.`;
  }

  await db.regressionRun.update({
    where: { id: regressionId },
    data: { status: "DONE", results: results as Prisma.InputJsonValue, summary, costMicros: cost, finishedAt: new Date(), apiKeySealed: null },
  });
}
