import { enqueue, type Db, type Prisma } from "@botheist/db";
import {
  buildProofRecord,
  proofHash,
  verifyFinding,
  type RuleId,
  type StoreState,
  type ToolGuards,
} from "@botheist/engine";
import { appendEvent } from "./events";
import { getOperations } from "./runs";

export type VerifyOutcome = "confirmed_paid_slot" | "confirmed_slot_taken" | "confirmed_training" | "rejected" | "skipped";

/**
 * Payout worker step 1: independently re-check a finding by replaying every
 * recorded operation from the seed. Only then is the reward slot claimed.
 */
export async function verifyFindingJob(db: Db, findingId: string, now = new Date()): Promise<VerifyOutcome> {
  const finding = await db.finding.findUnique({
    where: { id: findingId },
    include: { run: { include: { agentVersion: true, user: true } }, mission: true, campaign: true },
  });
  if (!finding || finding.status !== "PENDING") return "skipped";
  const { run, mission, campaign } = finding;

  const operations = await getOperations(db, run.id);
  const verification = verifyFinding({
    seedState: run.seedState as unknown as StoreState,
    operations,
    guards: run.agentVersion.guards as unknown as ToolGuards,
    rule: finding.rule as RuleId,
  });

  if (!verification.consistent || !verification.violated) {
    const reason = !verification.consistent
      ? `Replay mismatch: ${verification.mismatches.map((m) => `step ${m.seq} ${m.field}`).join(", ")}`
      : "The selected rule is not broken in the replayed state";
    await db.$transaction(async (tx) => {
      await tx.finding.update({ where: { id: findingId }, data: { status: "REJECTED", rejectionReason: reason, verifiedAt: now } });
      await tx.run.update({ where: { id: run.id }, data: { status: "LOST", endReason: "verification_rejected" } });
      await appendEvent(tx, run.id, "finding_status", { findingId, status: "REJECTED", reason });
    });
    return "rejected";
  }

  const proof = buildProofRecord({
    runId: run.id,
    campaignId: campaign.id,
    missionId: mission.id,
    rule: finding.rule as RuleId,
    agent: {
      versionId: run.agentVersion.id,
      name: run.agentVersion.name,
      model: run.agentVersion.model,
      configHash: run.agentVersion.configHash,
      brain: run.brain,
    },
    winner: campaign.kind === "PRIZE" ? run.wallet : null,
    operations,
    verification,
    stats: { playerMessages: run.playerMessages, toolCalls: run.toolCalls },
    verifiedAt: now.toISOString(),
  });
  const hash = proofHash(proof);

  return db.$transaction(async (tx) => {
    await tx.finding.update({
      where: { id: findingId },
      data: {
        status: "CONFIRMED",
        proof: proof as unknown as Prisma.InputJsonValue,
        proofHash: hash,
        decisiveSeq: proof.violation.decisiveSeq,
        paidMinor: proof.violation.paid,
        refundedMinor: proof.violation.refunded,
        summary: proof.violation.summary,
        otherViolations: proof.otherViolations as unknown as Prisma.InputJsonValue,
        verifiedAt: now,
      },
    });
    await appendEvent(tx, run.id, "finding_status", {
      findingId,
      status: "CONFIRMED",
      summary: proof.violation.summary,
      proofHash: hash,
      decisiveSeq: proof.violation.decisiveSeq,
    });

    if (campaign.kind !== "PRIZE") {
      if (run.userId) await awardTrainingProgress(tx, run.userId, mission.points, finding.rule as RuleId, run.playerMessages, run.agentVersion.difficulty);
      return "confirmed_training" as const;
    }

    // First confirmed finding per mission wins. The conditional update is the
    // database-level guarantee; the on-chain Claim is the second one.
    const inWindow = !campaign.payoutDeadlineAt || now <= campaign.payoutDeadlineAt;
    const claimed = inWindow
      ? await tx.rewardSlot.updateMany({
          where: { missionId: mission.id, winnerFindingId: null },
          data: { winnerFindingId: findingId, claimedAt: now },
        })
      : { count: 0 };
    if (claimed.count === 0) {
      await appendEvent(tx, run.id, "finding_status", {
        findingId,
        status: "CONFIRMED",
        note: inWindow ? "bounty_already_claimed" : "payout_window_closed",
      });
      return "confirmed_slot_taken" as const;
    }
    const payout = await tx.payout.create({
      data: {
        findingId,
        campaignId: campaign.id,
        recipient: run.wallet!,
        lamports: mission.rewardLamports,
        ruleIndex: mission.ruleIndex,
      },
    });
    await appendEvent(tx, run.id, "payout_status", { payoutId: payout.id, status: "PENDING", lamports: mission.rewardLamports.toString() });
    await enqueue(tx, "send_payout", { payoutId: payout.id }, { dedupeKey: `payout:${payout.id}`, maxAttempts: 8 });
    if (run.userId) await awardTrainingProgress(tx, run.userId, mission.points, finding.rule as RuleId, run.playerMessages, run.agentVersion.difficulty, true);
    return "confirmed_paid_slot" as const;
  });
}

async function awardTrainingProgress(
  tx: Prisma.TransactionClient,
  userId: string,
  points: number,
  rule: RuleId,
  messagesUsed: number,
  difficulty: number,
  bounty = false,
) {
  await tx.user.update({ where: { id: userId }, data: { points: { increment: points } } });
  const codes = ["FIRST_BREAK", `RULE_${rule}`];
  if (messagesUsed <= 3) codes.push("SPEEDRUN");
  if (difficulty >= 3) codes.push("HARDENED_BREAKER");
  if (bounty) codes.push("BOUNTY_HUNTER");
  await tx.achievement.createMany({ data: codes.map((code) => ({ userId, code })), skipDuplicates: true });
}

export const ACHIEVEMENTS: Record<string, { title: string; description: string }> = {
  FIRST_BREAK: { title: "First Crack", description: "Your first verified rule break." },
  RULE_DOUBLE_DIP: { title: "Double Dipper", description: "Got refunded more than you paid." },
  RULE_WRONG_POCKET: { title: "Wrong Pocket", description: "Redirected a refund to someone else." },
  RULE_GHOST_ORDER: { title: "Ghostbuster", description: "Refunded an order nobody paid for." },
  SPEEDRUN: { title: "Speedrun", description: "Broke a rule in three messages or fewer." },
  HARDENED_BREAKER: { title: "Prompt Locksmith", description: "Broke a hardened cashier." },
  BOUNTY_HUNTER: { title: "Bounty Hunter", description: "Won a funded bounty." },
};
