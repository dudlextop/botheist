import { canonicalJson } from "./hash";
import { ENGINE_VERSION, stateHash } from "./operations";
import { checkAllRules, checkRule } from "./rules";
import { executeTool } from "./tools";
import type { OperationRecord, RuleId, StoreState, ToolCall, ToolGuards, ToolOutcome, Violation } from "./types";

export interface ReplayStep {
  seq: number;
  tool: ToolCall["tool"];
  input: Record<string, unknown>;
  outcome: ToolOutcome;
  mutated: boolean;
  stateBeforeHash: string;
  stateAfterHash: string;
  /** Rules broken by the state right after this step. */
  violatedRules: RuleId[];
}

export interface ReplayResult {
  steps: ReplayStep[];
  finalState: StoreState;
  finalStateHash: string;
  violations: Violation[];
}

type CallLike = Pick<OperationRecord, "seq" | "tool" | "input">;

/** Re-execute a sequence of tool calls from the seed state with the given guards. */
export function replay(seedState: StoreState, calls: CallLike[], guards: ToolGuards): ReplayResult {
  let state = seedState;
  const steps: ReplayStep[] = [];
  for (const call of calls) {
    const before = stateHash(state);
    const res = executeTool(state, { tool: call.tool, input: call.input }, guards, call.seq);
    state = res.state;
    const after = res.mutated ? stateHash(state) : before;
    steps.push({
      seq: call.seq,
      tool: call.tool,
      input: call.input,
      outcome: res.outcome,
      mutated: res.mutated,
      stateBeforeHash: before,
      stateAfterHash: after,
      violatedRules: [...new Set(checkAllRules(state).map((v) => v.rule))],
    });
  }
  return { steps, finalState: state, finalStateHash: stateHash(state), violations: checkAllRules(state) };
}

export interface Mismatch {
  seq: number;
  field: "outcome" | "stateBeforeHash" | "stateAfterHash" | "engineVersion" | "order";
  detail: string;
}

export interface FindingVerification {
  /** Every recorded step re-executes to the same outcome and state hashes. */
  consistent: boolean;
  mismatches: Mismatch[];
  /** The selected rule is broken in the final verified state. */
  violated: boolean;
  /** First operation after which the selected rule became broken. */
  decisiveSeq: number | null;
  violation: Violation | null;
  /** Other rules also broken (reported, not rewarded). */
  otherViolations: Violation[];
  seedStateHash: string;
  finalStateHash: string;
}

/**
 * Independent check of a recorded run: replays every recorded operation from the
 * seed with the run's guards, compares each step, then evaluates the chosen rule.
 */
export function verifyFinding(params: {
  seedState: StoreState;
  operations: OperationRecord[];
  guards: ToolGuards;
  rule: RuleId;
}): FindingVerification {
  const { seedState, operations, guards, rule } = params;
  const mismatches: Mismatch[] = [];
  const ordered = [...operations].sort((a, b) => a.seq - b.seq);
  ordered.forEach((op, i) => {
    if (i > 0 && op.seq <= ordered[i - 1]!.seq) mismatches.push({ seq: op.seq, field: "order", detail: "duplicate sequence number" });
    if (op.engineVersion !== ENGINE_VERSION) {
      mismatches.push({ seq: op.seq, field: "engineVersion", detail: `${op.engineVersion} != ${ENGINE_VERSION}` });
    }
  });

  const replayed = replay(seedState, ordered, guards);
  replayed.steps.forEach((step, i) => {
    const rec = ordered[i]!;
    if (step.stateBeforeHash !== rec.stateBeforeHash) {
      mismatches.push({ seq: rec.seq, field: "stateBeforeHash", detail: "state before this step differs" });
    }
    if (step.stateAfterHash !== rec.stateAfterHash) {
      mismatches.push({ seq: rec.seq, field: "stateAfterHash", detail: "state after this step differs" });
    }
    if (canonicalJson(step.outcome) !== canonicalJson(rec.outcome)) {
      mismatches.push({ seq: rec.seq, field: "outcome", detail: "tool result differs from the recorded result" });
    }
  });

  const decisive = replayed.steps.find((s) => s.violatedRules.includes(rule));
  const ruleViolations = checkRule(rule, replayed.finalState);
  const others = replayed.violations.filter((v) => v.rule !== rule);
  return {
    consistent: mismatches.length === 0,
    mismatches,
    violated: ruleViolations.length > 0,
    decisiveSeq: decisive?.seq ?? null,
    violation: ruleViolations[0] ?? null,
    otherViolations: others,
    seedStateHash: stateHash(seedState),
    finalStateHash: replayed.finalStateHash,
  };
}

export interface RegressionReplayResult {
  /** The new version refused at least one previously executed mutation. */
  blocked: boolean;
  blockedAtSeq: number | null;
  blockedError: { code: string; message: string } | null;
  /** Whether the rule is still broken when the same calls run on the new version. */
  stillViolated: boolean;
  steps: ReplayStep[];
}

/**
 * Action replay against a different tool configuration (for example the fixed
 * version). Only the recorded calls are replayed; the model is not involved.
 */
export function regressionReplay(params: {
  seedState: StoreState;
  operations: CallLike[];
  guards: ToolGuards;
  rule: RuleId;
  originalMutatingSeqs: number[];
}): RegressionReplayResult {
  const result = replay(params.seedState, [...params.operations].sort((a, b) => a.seq - b.seq), params.guards);
  const blockedStep = result.steps.find((s) => params.originalMutatingSeqs.includes(s.seq) && !s.outcome.ok);
  return {
    blocked: Boolean(blockedStep),
    blockedAtSeq: blockedStep?.seq ?? null,
    blockedError: blockedStep && !blockedStep.outcome.ok ? blockedStep.outcome.error : null,
    stillViolated: checkRule(params.rule, result.finalState).length > 0,
    steps: result.steps,
  };
}
