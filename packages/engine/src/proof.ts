import { hashValue } from "./hash";
import { ENGINE_VERSION } from "./operations";
import { RULES, RULES_VERSION } from "./rules";
import type { OperationRecord, RuleId, Violation } from "./types";
import type { FindingVerification } from "./verifier";

export const PROOF_SCHEMA = "botheist.proof/v1";

export interface ProofRecord {
  schema: typeof PROOF_SCHEMA;
  runId: string;
  campaignId: string;
  missionId: string;
  rule: RuleId;
  ruleIndex: number;
  /** brain: who actually ran the cashier (OFFLINE = the scripted stand-in, not a model). */
  agent: { versionId: string; name: string; model: string; configHash: string; brain?: string };
  engineVersion: string;
  rulesVersion: string;
  /** Wallet bound to the run before it started; null for training runs. */
  winner: string | null;
  seedStateHash: string;
  finalStateHash: string;
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
