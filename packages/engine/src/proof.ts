import { hashValue } from "./hash";
import { ENGINE_VERSION } from "./operations";
import { RULES, RULES_VERSION } from "./rules";
import type { OperationRecord, RuleId, StoreState, ToolGuards, Violation } from "./types";
import { verifyFinding, type FindingVerification } from "./verifier";

/** v2 adds the seed state and tool guards, so anyone can replay a proof from the record alone. */
export const PROOF_SCHEMA = "botheist.proof/v2";

export interface ProofRecord {
  schema: typeof PROOF_SCHEMA;
  runId: string;
  campaignId: string;
  missionId: string;
  rule: RuleId;
  ruleIndex: number;
  /**
   * brain: who ran the cashier (OFFLINE = the scripted stand-in, not a model).
   * servedBy: the models that actually answered, which can differ from `model` after a server-side fallback.
   */
  agent: { versionId: string; name: string; model: string; configHash: string; brain?: string; servedBy?: string[] };
  engineVersion: string;
  rulesVersion: string;
  /** Wallet bound to the run before it started; null for training runs. */
  winner: string | null;
  seedStateHash: string;
  finalStateHash: string;
  /** The attempt's starting store and the agent version's tool guards: everything a replay needs. */
  seedState: StoreState;
  guards: ToolGuards;
  operations: OperationRecord[];
  violation: {
    decisiveSeq: number;
    orderId: string;
    paid: number;
    refunded: number;
    summary: string;
    refundIds: string[];
  };
  otherViolations: Array<Pick<Violation, "rule" | "orderId" | "summary">>;
  stats: { playerMessages: number; toolCalls: number };
  verifiedAt: string;
}

export function buildProofRecord(params: {
  runId: string;
  campaignId: string;
  missionId: string;
  rule: RuleId;
  agent: ProofRecord["agent"];
  winner: string | null;
  seedState: StoreState;
  guards: ToolGuards;
  operations: OperationRecord[];
  verification: FindingVerification;
  stats: ProofRecord["stats"];
  verifiedAt: string;
}): ProofRecord {
  const v = params.verification;
  if (!v.consistent) throw new Error("Cannot build a proof from an inconsistent replay");
  if (!v.violated || !v.violation || v.decisiveSeq === null) throw new Error("Cannot build a proof without a violation");
  return {
    schema: PROOF_SCHEMA,
    runId: params.runId,
    campaignId: params.campaignId,
    missionId: params.missionId,
    rule: params.rule,
    ruleIndex: RULES[params.rule].onchainIndex,
    agent: params.agent,
    engineVersion: ENGINE_VERSION,
    rulesVersion: RULES_VERSION,
    winner: params.winner,
    seedStateHash: v.seedStateHash,
    finalStateHash: v.finalStateHash,
    seedState: params.seedState,
    guards: params.guards,
    operations: [...params.operations].sort((a, b) => a.seq - b.seq),
    violation: {
      decisiveSeq: v.decisiveSeq,
      orderId: v.violation.orderId,
      paid: v.violation.paid,
      refunded: v.violation.refunded,
      summary: v.violation.summary,
      refundIds: v.violation.refundIds,
    },
    otherViolations: v.otherViolations.map((o) => ({ rule: o.rule, orderId: o.orderId, summary: o.summary })),
    stats: params.stats,
    verifiedAt: params.verifiedAt,
  };
}

/** SHA-256 of the canonical proof JSON; this value is committed in the on-chain Claim. */
export function proofHash(record: ProofRecord): string {
  return hashValue(record);
}

export interface ProofCheck {
  ok: boolean;
  label: string;
}

/**
 * Re-verify a proof record on its own: replay every operation from the
 * record's seed state with its guards, and check that the replay reproduces
 * each recorded outcome and state hash, the final state and the violation.
 * Needs no server, database or chain access.
 */
export function replayProofRecord(record: ProofRecord): ProofCheck[] {
  const v = verifyFinding({ seedState: record.seedState, operations: record.operations, guards: record.guards, rule: record.rule });
  return [
    { ok: v.seedStateHash === record.seedStateHash, label: "seed state in the record hashes to the recorded seed state hash" },
    {
      ok: v.consistent,
      label: v.consistent
        ? `all ${record.operations.length} operations replay to the recorded outcomes and state hashes`
        : `replay differs: ${v.mismatches.map((m) => `step ${m.seq} ${m.field}`).join(", ")}`,
    },
    { ok: v.finalStateHash === record.finalStateHash, label: "replayed final state hash equals the recorded one" },
    {
      ok: v.violated && v.decisiveSeq === record.violation.decisiveSeq,
      label: `the replay breaks ${record.rule} first at step ${v.decisiveSeq ?? "none"} (recorded: ${record.violation.decisiveSeq})`,
    },
  ];
}
