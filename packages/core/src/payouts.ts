import { address } from "@solana/kit";
import { enqueue, type Db } from "@botheist/db";
import { findClaimAddress } from "@botheist/solana";
import type { SignatureState } from "@botheist/solana/server";
import { appendEvent } from "./events";

/** What the payout worker needs from the chain. Swapped for a fake in tests. */
export interface PayoutChain {
  send(req: {
    campaignAddress: string;
    ruleIndex: number;
    runId: string;
    proofHashHex: string;
    winner: string;
  }): Promise<{ status: "sent"; signature: string } | { status: "already_paid_to_this_run" } | { status: "claimed_by_other_run" }>;
  signatureState(signature: string): Promise<SignatureState>;
  claimHolder(campaignAddress: string, ruleIndex: number): Promise<{ runIdHex: string } | null>;
}

export class RetryLater extends Error {}

async function emit(db: Db, payoutId: string, status: string, extra: Record<string, unknown> = {}) {
  const payout = await db.payout.findUniqueOrThrow({ where: { id: payoutId }, include: { finding: true } });
  await db.$transaction((tx) =>
    appendEvent(tx, payout.finding.runId, "payout_status", {
      payoutId,
      status,
      signature: payout.txSignature,
      lamports: payout.lamports.toString(),
      ...extra,
    }),
  );
}

/**
 * Send the reward for a confirmed finding. Safe to retry at any point: the chain
 * helper checks the on-chain Claim first, and the program refuses a second Claim.
 */
export async function sendPayoutJob(db: Db, chain: PayoutChain, payoutId: string): Promise<string> {
  const payout = await db.payout.findUnique({ where: { id: payoutId }, include: { finding: true, campaign: true } });
  if (!payout) return "missing";
  if (payout.status === "CONFIRMED" || payout.status === "SUPERSEDED" || payout.status === "SENT") return payout.status;
  if (!payout.campaign.onchainAddress) throw new Error("Campaign has no on-chain address");
  if (!payout.finding.proofHash) throw new Error("Finding has no proof hash");

  // The Claim PDA is deterministic (campaign, rule): record it so the proof can link to it.
  const claimAddress = payout.claimAddress ?? (await findClaimAddress(address(payout.campaign.onchainAddress), payout.ruleIndex));
  await db.payout.update({ where: { id: payoutId }, data: { status: "SENDING", attempts: { increment: 1 }, claimAddress } });
  await emit(db, payoutId, "SENDING");
  let res;
  try {
    res = await chain.send({
      campaignAddress: payout.campaign.onchainAddress,
      ruleIndex: payout.ruleIndex,
      runId: payout.finding.runId,
      proofHashHex: payout.finding.proofHash,
      winner: payout.recipient,
    });
  } catch (err) {
    // The transaction may or may not have landed; the retry checks the Claim before resending.
    await db.payout.update({ where: { id: payoutId }, data: { lastError: String(err instanceof Error ? err.message : err).slice(0, 1000) } });
    throw err;
  }

  if (res.status === "sent") {
    await db.payout.update({ where: { id: payoutId }, data: { status: "SENT", txSignature: res.signature, sentAt: new Date() } });
    await emit(db, payoutId, "SENT");
    await enqueue(db, "confirm_payout", { payoutId }, { runAt: new Date(Date.now() + 1500), maxAttempts: 20 });
    return "SENT";
  }
  if (res.status === "already_paid_to_this_run") {
    await db.payout.update({ where: { id: payoutId }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
    await emit(db, payoutId, "CONFIRMED");
    return "CONFIRMED";
  }
  await db.payout.update({ where: { id: payoutId }, data: { status: "SUPERSEDED", lastError: "On-chain claim belongs to another run" } });
  await emit(db, payoutId, "SUPERSEDED");
  return "SUPERSEDED";
}

/** Track a sent payout until the network confirms it. */
export async function confirmPayoutJob(db: Db, chain: PayoutChain, payoutId: string, attempt: number): Promise<string> {
  const payout = await db.payout.findUnique({ where: { id: payoutId }, include: { finding: true, campaign: true } });
  if (!payout || payout.status !== "SENT" || !payout.txSignature) return payout?.status ?? "missing";
  const state = await chain.signatureState(payout.txSignature);
  if (state === "confirmed" || state === "finalized") {
    await db.payout.update({ where: { id: payoutId }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
    await emit(db, payoutId, "CONFIRMED");
    return "CONFIRMED";
  }
  if (state === "failed" || (state === "unknown" && attempt >= 10)) {
    // Before deciding to resend, check whether this run already holds the Claim.
    const holder = await chain.claimHolder(payout.campaign.onchainAddress!, payout.ruleIndex);
    const thisRun = payout.finding.runId.replace(/-/g, "");
    if (holder?.runIdHex === thisRun) {
      await db.payout.update({ where: { id: payoutId }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
      await emit(db, payoutId, "CONFIRMED");
      return "CONFIRMED";
    }
    await db.payout.update({ where: { id: payoutId }, data: { status: "PENDING", txSignature: null, lastError: `Transaction ${state}` } });
    await emit(db, payoutId, "PENDING", { note: "resending" });
    await enqueue(db, "send_payout", { payoutId }, { runAt: new Date(Date.now() + 2000), maxAttempts: 8 });
    return "PENDING";
  }
  throw new RetryLater(`Payout ${payoutId} not confirmed yet (${state})`);
}

/**
 * Re-queue payouts left PENDING/SENDING without an active job (worker crash, or
 * payouts were disabled when the finding was confirmed). Safe because every send
 * checks the on-chain Claim first.
 */
export async function requeueStalledPayouts(db: Db, olderThanMs = 30_000): Promise<number> {
  const stalled = await db.payout.findMany({
    where: { status: { in: ["PENDING", "SENDING"] }, updatedAt: { lt: new Date(Date.now() - olderThanMs) } },
    select: { id: true },
  });
  let queued = 0;
  for (const p of stalled) {
    const active = await db.$queryRaw<Array<{ c: bigint }>>`
      SELECT count(*)::bigint AS c FROM "Job"
      WHERE type = 'send_payout' AND status IN ('QUEUED', 'RUNNING') AND payload->>'payoutId' = ${p.id}`;
    if (Number(active[0]?.c ?? 0) === 0) {
      await enqueue(db, "send_payout", { payoutId: p.id }, { maxAttempts: 8 });
      queued += 1;
    }
  }
  return queued;
}
