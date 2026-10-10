import {
  buildSystemPrompt,
  cashierTools,
  getModel,
  providerFor,
  runAgentTurn,
  type MessageParam,
  type ModelProvider,
  type TurnOutcome,
} from "@botheist/agent";
import { enqueue, Prisma, type Db, type ModelBrain, type Run, type RunStatus, type Tx } from "@botheist/db";
import {
  applyToolCall,
  checkRule,
  createSeedState,
  formatCredits,
  type OperationRecord,
  type RuleId,
  type SeedOptions,
  type StoreState,
  type ToolGuards,
} from "@botheist/engine";
import { agentConfigFromRow } from "./agentVersions";
import { config as coreConfig } from "./config";
import { normalizeApiKey, openSecret, sealSecret } from "./secrets";
import { AppError, conflict, forbidden, notFound } from "./errors";
import { appendEvent } from "./events";

export interface Actor {
  userId?: string | null;
  wallet?: string | null;
  guestKey?: string | null;
}

export const MAX_MESSAGE_LENGTH = 1000;
const GUEST_RUNS_PER_HOUR = 6;
const GUEST_MAX_MESSAGES = 8;

// ------------------------------------------------------------------ start

/** Who runs Milo when the player brings no key: Claude on the server's key, or the offline stand-in. */
export function defaultBrain(): ModelBrain {
  return coreConfig.serverModelKey ? "SERVER_KEY" : "OFFLINE";
}

export async function startRun(db: Db, actor: Actor, input: { campaignId: string; missionId: string; apiKey?: unknown }): Promise<Run> {
  const apiKey = normalizeApiKey(input.apiKey);
  const brain: ModelBrain = apiKey ? "PLAYER_KEY" : defaultBrain();
  const campaign = await db.campaign.findUnique({
    where: { id: input.campaignId },
    include: { agentVersion: true, missions: { include: { rewardSlot: true } } },
  });
  if (!campaign) throw notFound("Campaign");
  const mission = campaign.missions.find((m) => m.id === input.missionId);
  if (!mission) throw notFound("Mission");
  if (campaign.status !== "ACTIVE") throw new AppError("CAMPAIGN_NOT_ACTIVE", "This campaign is not accepting attempts");
  // A player's own key spends the player's money, not the campaign's model budget.
  if (brain !== "PLAYER_KEY" && campaign.spentMicros >= campaign.totalBudgetMicros) {
    throw new AppError("CAMPAIGN_BUDGET_SPENT", "This campaign has used its model budget");
  }

  const now = new Date();
  const isPrize = campaign.kind === "PRIZE";
  if (isPrize) {
    if (!actor.userId || !actor.wallet) throw new AppError("WALLET_REQUIRED", "Connect and sign in with a wallet to play for a bounty", 401);
    if (campaign.startsAt && now < campaign.startsAt) throw new AppError("NOT_STARTED", "This campaign has not started yet");
    // Stop new attempts early enough that the longest attempt still ends before submissions close.
    const lastStart = campaign.submissionsCloseAt
      ? new Date(campaign.submissionsCloseAt.getTime() - campaign.maxDurationSec * 1000)
      : null;
    if (lastStart && now > lastStart) throw new AppError("SUBMISSIONS_CLOSED", "Submissions for this campaign are closed");
    if (mission.rewardSlot?.winnerFindingId) {
      throw new AppError("BOUNTY_CLAIMED", "This mission's bounty was already claimed by an earlier confirmed finding");
    }
    // An organizer who picked the offline bot as the model needs no key; otherwise offline play must be allowed.
    const offlineModel = getModel(campaign.agentVersion.model).provider === "mock";
    if (brain === "OFFLINE" && !campaign.offlineAllowed && !offlineModel) {
      throw new AppError("MODEL_KEY_REQUIRED", "This bounty is played against the real Claude model. Add your Claude API key to play for it.");
    }
  } else if (!actor.userId) {
    if (!actor.guestKey) throw new AppError("NO_SESSION", "Missing guest session", 401);
    const recent = await db.run.count({ where: { guestKey: actor.guestKey, startedAt: { gt: new Date(now.getTime() - 3600_000) } } });
    if (recent >= GUEST_RUNS_PER_HOUR) {
      throw new AppError("GUEST_LIMIT", "Guest practice is limited to a few attempts per hour. Sign in with a wallet to keep playing.", 429);
    }
  }

  const user = actor.userId ? await db.user.findUnique({ where: { id: actor.userId } }) : null;
  const seedOptions = (campaign.agentVersion.seedOptions ?? {}) as SeedOptions;
  const seed = createSeedState({ ...seedOptions, playerName: user?.displayName ?? "You" });

  try {
    return await db.$transaction(async (tx) => {
      const run = await tx.run.create({
        data: {
          campaignId: campaign.id,
          missionId: mission.id,
          agentVersionId: campaign.agentVersionId,
          userId: actor.userId ?? null,
          guestKey: actor.userId ? null : (actor.guestKey ?? null),
          wallet: isPrize ? actor.wallet! : (actor.wallet ?? null),
          seedState: seed as unknown as Prisma.InputJsonValue,
          state: seed as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(now.getTime() + campaign.maxDurationSec * 1000),
          brain,
          apiKeySealed: apiKey ? sealSecret(apiKey) : null,
        },
      });
      await appendEvent(tx, run.id, "run_started", {
        mission: { id: mission.id, rule: mission.rule, title: mission.title, objective: mission.objective },
        agent: { name: campaign.agentVersion.name, label: campaign.agentVersion.label, model: campaign.agentVersion.model },
        limits: limitsFor(campaign, actor),
        expiresAt: run.expiresAt.toISOString(),
        brain,
      });
      return run;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const active = await db.run.findFirst({
        where: { status: "ACTIVE", ...(actor.wallet ? { wallet: actor.wallet } : { guestKey: actor.guestKey ?? undefined }) },
        select: { id: true },
      });
      throw conflict("ACTIVE_RUN_EXISTS", "You already have an attempt in progress. Finish it first.", { runId: active?.id });
    }
    throw err;
  }
}

function limitsFor(campaign: { maxMessages: number; maxToolCalls: number; maxDurationSec: number; kind: string }, actor: Actor) {
  const guest = campaign.kind === "TRAINING" && !actor.userId;
  return {
    maxMessages: guest ? Math.min(campaign.maxMessages, GUEST_MAX_MESSAGES) : campaign.maxMessages,
    maxToolCalls: campaign.maxToolCalls,
    maxDurationSec: campaign.maxDurationSec,
  };
}

export function runLimits(run: Pick<Run, "userId">, campaign: { maxMessages: number; maxToolCalls: number; maxDurationSec: number; kind: string }) {
  return limitsFor(campaign, { userId: run.userId });
}

export function assertOwner(run: Pick<Run, "userId" | "guestKey">, actor: Actor) {
  const ok = (run.userId && run.userId === actor.userId) || (!run.userId && run.guestKey && run.guestKey === actor.guestKey);
  if (!ok) throw forbidden("This attempt belongs to someone else");
}

// ---------------------------------------------------------------- messages

/**
 * Accept a player message. Re-sending the same clientMsgId returns the original
 * event instead of queuing a second agent turn.
 */
export async function postPlayerMessage(
  db: Db,
  actor: Actor,
  input: { runId: string; text: string; clientMsgId: string },
): Promise<{ seq: number; duplicate: boolean }> {
  const text = input.text.trim();
  if (!text) throw new AppError("EMPTY_MESSAGE", "Write something to Milo first");
  if (text.length > MAX_MESSAGE_LENGTH) throw new AppError("MESSAGE_TOO_LONG", `Messages are limited to ${MAX_MESSAGE_LENGTH} characters`);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(input.clientMsgId)) throw new AppError("BAD_CLIENT_ID", "Invalid message id");

  const run = await db.run.findUnique({ where: { id: input.runId }, include: { campaign: true } });
  if (!run) throw notFound("Attempt");
  assertOwner(run, actor);

  const existing = await db.runEvent.findUnique({ where: { runId_clientMsgId: { runId: run.id, clientMsgId: input.clientMsgId } } });
  if (existing) return { seq: existing.seq, duplicate: true };

  if (run.status !== "ACTIVE") throw new AppError("RUN_FINISHED", "This attempt is over");
  if (run.expiresAt < new Date()) throw new AppError("RUN_EXPIRED", "Time is up for this attempt");
  const limits = runLimits(run, run.campaign);

  try {
    return await db.$transaction(async (tx) => {
      // Claim the turn: only one agent turn per run at a time, and never past the message limit.
      const claimed = await tx.run.updateMany({
        where: { id: run.id, status: "ACTIVE", busy: false, playerMessages: { lt: limits.maxMessages } },
        data: { busy: true, playerMessages: { increment: 1 } },
      });
      if (claimed.count === 0) {
        const fresh = await tx.run.findUniqueOrThrow({ where: { id: run.id } });
        if (fresh.busy) throw conflict("AGENT_BUSY", "Milo is still answering your last message");
        if (fresh.playerMessages >= limits.maxMessages) throw new AppError("MESSAGE_LIMIT", "No messages left in this attempt");
        throw new AppError("RUN_FINISHED", "This attempt is over");
      }
      const seq = await appendEvent(tx, run.id, "player_message", { text, clientMsgId: input.clientMsgId }, input.clientMsgId);
      await enqueue(tx, "agent_turn", { runId: run.id, text, eventSeq: seq }, { dedupeKey: `turn:${run.id}:${seq}`, maxAttempts: 1 });
      return { seq, duplicate: false };
    });
  } catch (err) {
    // A concurrent retry with the same clientMsgId lost the unique race: treat it as a duplicate.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const dup = await db.runEvent.findUnique({ where: { runId_clientMsgId: { runId: run.id, clientMsgId: input.clientMsgId } } });
      if (dup) return { seq: dup.seq, duplicate: true };
    }
    throw err;
  }
}

// -------------------------------------------------------------- agent turn

export function describeOperation(record: OperationRecord, state: StoreState): string {
  const input = record.input as Record<string, unknown>;
  const order = String(input.order_id ?? "?");
  if (!record.outcome.ok) {
    const verb = record.tool === "issue_refund" ? "refund" : record.tool === "get_order" ? "order lookup" : "history lookup";
    return `Milo's ${verb} failed: ${record.outcome.error.message}`;
  }
  switch (record.tool) {
    case "get_order":
      return `Milo opened order ${order}`;
    case "get_refund_history":
      return `Milo checked the refund history of ${order}`;
    case "issue_refund": {
      const refund = state.refunds.find((r) => r.opSeq === record.seq);
      const who = refund ? (state.customers[refund.recipientId]?.name ?? refund.recipientId) : "?";
      return `Milo refunded ${refund ? formatCredits(refund.amount) : "?"} to ${who} on ${order}`;
    }
  }
}

export interface TurnOptions {
  /** Override the model provider (tests). */
  provider?: ModelProvider;
  now?: () => Date;
}

/** Agent worker: run one queued player turn to completion. */
export async function processAgentTurn(db: Db, runId: string, playerText: string, opts: TurnOptions = {}): Promise<TurnOutcome | "skipped"> {
  const now = opts.now ?? (() => new Date());
  const run = await db.run.findUnique({ where: { id: runId }, include: { campaign: true, mission: true, agentVersion: true } });
  if (!run) return "skipped";
  if (run.status !== "ACTIVE") {
    await db.run.update({ where: { id: runId }, data: { busy: false } });
    return "skipped";
  }
  if (run.expiresAt < now()) {
    await finishRun(db, run.id, "EXPIRED", "time_limit");
    return "skipped";
  }

  const config = agentConfigFromRow(run.agentVersion);
  const guards = run.agentVersion.guards as unknown as ToolGuards;
  const rule = run.mission.rule as RuleId;
  const limits = runLimits(run, run.campaign);
  const history = (run.conversation ?? []) as unknown as MessageParam[];
  const playerKey = run.brain === "PLAYER_KEY";
  const campaignBudgetLeft = Number(run.campaign.totalBudgetMicros - run.campaign.spentMicros);
  const runBudgetLeft = run.campaign.runBudgetMicros - run.costMicros;
  const budget = Math.max(0, playerKey ? runBudgetLeft : Math.min(runBudgetLeft, campaignBudgetLeft));

  // A run promised the server's Claude key must not silently fall back to offline Milo.
  if (run.brain === "SERVER_KEY" && !coreConfig.serverModelKey) {
    await finishRun(db, run.id, "MODEL_ERROR", "server_key_missing");
    return "skipped";
  }

  let apiKey: string | null = null;
  if (playerKey) {
    try {
      apiKey = run.apiKeySealed ? openSecret(run.apiKeySealed) : null;
    } catch {
      apiKey = null;
    }
    if (!apiKey) {
      await finishRun(db, run.id, "MODEL_ERROR", "model_key_missing");
      return "skipped";
    }
  }

  await db.$transaction((tx) => appendEvent(tx, runId, "agent_typing", {}));

  const result = await runAgentTurn(
    {
      provider: opts.provider ?? providerFor(config.model, { apiKey, offline: run.brain === "OFFLINE", level: config.difficulty }),
      model: config.model,
      effort: config.effort,
      system: buildSystemPrompt(config, run.seedState as unknown as StoreState),
      tools: cashierTools(),
      history,
      playerMessage: playerText,
      remainingToolCalls: Math.max(0, limits.maxToolCalls - run.toolCalls),
      remainingBudgetMicros: budget,
    },
    {
      executeTool: (call) =>
        db.$transaction(async (tx) => {
          const current = await tx.run.findUniqueOrThrow({ where: { id: runId }, select: { state: true, opSeq: true } });
          const seq = current.opSeq + 1;
          const applied = applyToolCall(current.state as unknown as StoreState, { tool: call.name, input: call.input }, guards, seq, now().toISOString());
          await tx.run.update({
            where: { id: runId },
            data: { state: applied.state as unknown as Prisma.InputJsonValue, opSeq: seq, toolCalls: { increment: 1 } },
          });
          await appendEvent(tx, runId, "operation", {
            record: applied.record,
            text: describeOperation(applied.record, applied.state),
            register: applied.state.register.balance,
            refunds: applied.state.refunds,
          });
          const broken = applied.record.mutated ? checkRule(rule, applied.state) : [];
          if (broken.length > 0) {
            await appendEvent(tx, runId, "rule_broken", { rule, summary: broken[0]!.summary, opSeq: seq });
          }
          const outcome = applied.record.outcome;
          return {
            content: JSON.stringify(outcome.ok ? outcome.data : outcome.error),
            isError: !outcome.ok,
            stopRun: broken.length > 0,
          };
        }),
      onAssistantText: async (text) => {
        await db.$transaction((tx) => appendEvent(tx, runId, "agent_message", { text }));
      },
      onModelCall: async ({ costMicros, servedBy }) => {
        // Recorded so the proof can state which model actually answered.
        await db.$transaction((tx) => appendEvent(tx, runId, "model_call", { servedBy, costMicros }));
        if (costMicros <= 0) return;
        await db.$transaction([
          db.run.update({ where: { id: runId }, data: { costMicros: { increment: costMicros } } }),
          ...(playerKey ? [] : [db.campaign.update({ where: { id: run.campaignId }, data: { spentMicros: { increment: BigInt(costMicros) } } })]),
        ]);
      },
    },
  );

  // Conversation is append-only: earlier turns are never rewritten.
  await db.run.update({
    where: { id: runId },
    data: { conversation: [...history, ...result.appended] as unknown as Prisma.InputJsonValue },
  });

  await db.$transaction((tx) => appendEvent(tx, runId, "turn_end", { outcome: result.outcome, toolCalls: result.toolCalls }));
  const after = await db.run.findUniqueOrThrow({ where: { id: runId } });
  switch (result.outcome) {
    case "run_stopped":
      await finishRun(db, runId, "WON", "rule_broken");
      break;
    case "model_error":
      await db.$transaction((tx) => appendEvent(tx, runId, "model_error", { message: "Milo's brain glitched. This attempt does not count as a win or a loss." }));
      await finishRun(db, runId, "MODEL_ERROR", /Model API error (401|403)/.test(result.error ?? "") ? "model_auth" : (result.error ?? "model_error"));
      break;
    case "budget_exhausted":
      await finishRun(db, runId, "ABORTED", "model_budget");
      break;
    case "tool_limit":
      await finishRun(db, runId, "LOST", "tool_limit");
      break;
    case "refusal":
      await db.$transaction((tx) => appendEvent(tx, runId, "agent_refusal", { text: "Milo declined to respond to that." }));
      if (after.playerMessages >= limits.maxMessages) await finishRun(db, runId, "LOST", "message_limit");
      else await db.run.update({ where: { id: runId }, data: { busy: false } });
      break;
    default:
      if (after.playerMessages >= limits.maxMessages) await finishRun(db, runId, "LOST", "message_limit");
      else await db.run.update({ where: { id: runId }, data: { busy: false } });
  }
  return result.outcome;
}

/** End an attempt. A won attempt opens a finding and queues independent verification. */
export async function finishRun(db: Db, runId: string, status: RunStatus, reason: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const done = await tx.run.updateMany({
      where: { id: runId, status: "ACTIVE" },
      // A player's own API key never outlives the attempt.
      data: { status, endReason: reason.slice(0, 500), finishedAt: new Date(), busy: false, apiKeySealed: null },
    });
    if (done.count === 0) return;
    await appendEvent(tx, runId, "run_finished", { status, reason });
    if (status === "WON") await openFinding(tx, runId);
  });
}

async function openFinding(tx: Tx, runId: string) {
  const run = await tx.run.findUniqueOrThrow({ where: { id: runId }, include: { mission: true } });
  const finding = await tx.finding.create({
    data: {
      runId,
      campaignId: run.campaignId,
      missionId: run.missionId,
      rule: run.mission.rule,
      winnerWallet: run.wallet,
      summary: "Waiting for independent verification",
    },
  });
  await appendEvent(tx, runId, "finding_status", { findingId: finding.id, status: "PENDING" });
  await enqueue(tx, "verify_finding", { findingId: finding.id }, { dedupeKey: `verify:${finding.id}` });
}

/** Periodic sweep: erase any brought API key whose attempt or check is no longer running. */
export async function eraseFinishedKeys(db: Db): Promise<number> {
  const runs = await db.run.updateMany({ where: { status: { not: "ACTIVE" }, apiKeySealed: { not: null } }, data: { apiKeySealed: null } });
  const checks = await db.regressionRun.updateMany({
    where: { status: { in: ["DONE", "FAILED"] }, apiKeySealed: { not: null } },
    data: { apiKeySealed: null },
  });
  return runs.count + checks.count;
}

/** Periodic sweep: close attempts whose time ran out while idle. */
export async function expireIdleRuns(db: Db, now = new Date()): Promise<number> {
  const stale = await db.run.findMany({ where: { status: "ACTIVE", busy: false, expiresAt: { lt: now } }, select: { id: true } });
  for (const r of stale) await finishRun(db, r.id, "EXPIRED", "time_limit");
  // A turn stuck "busy" long past expiry (crashed worker) is released as a model error.
  const stuck = await db.run.findMany({
    where: { status: "ACTIVE", busy: true, expiresAt: { lt: new Date(now.getTime() - 120_000) } },
    select: { id: true },
  });
  for (const r of stuck) await finishRun(db, r.id, "MODEL_ERROR", "worker_timeout");
  return stale.length + stuck.length;
}

export async function getOperations(db: Db | Tx, runId: string): Promise<OperationRecord[]> {
  const events = await db.runEvent.findMany({ where: { runId, type: "operation" }, orderBy: { seq: "asc" } });
  return events.map((e) => (e.payload as unknown as { record: OperationRecord }).record);
}
