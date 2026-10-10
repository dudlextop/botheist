/**
 * Check a paid BotHeist finding against Solana:
 *   1. recompute the proof record's SHA-256 locally,
 *   2. replay every operation from the seed state stored in the record (proof v2)
 *      and require the same outcomes, state hashes and violation,
 *   3. read the Claim and Campaign accounts on Solana and compare the committed
 *      proof hash, run id, winner and the amount fixed in the campaign terms.
 *
 * What remains trusted: that the recorded operations are the ones the agent
 * executed. The campaign's verifier key attests to that when it signs `award`.
 *
 *   pnpm --filter @botheist/worker verify:proof -- <proof page URL | finding id> [baseUrl] [rpcUrl]
 */
import { address, createSolanaRpc } from "@solana/kit";
import { RULES, proofHash, replayProofRecord, type ProofRecord, type RuleId } from "@botheist/engine";
import { bytesToHex, findClaimAddress, uuidToBytes } from "@botheist/solana";
import { fetchCampaign, fetchClaim } from "@botheist/solana/server";

const args = process.argv.slice(2).filter((a) => a !== "--");
const target = args[0];
if (!target) throw new Error("usage: verify:proof <proof page URL | finding id> [baseUrl] [rpcUrl]");
const fromUrl = target.match(/^(https?:\/\/[^/]+)\/proof\/([0-9a-f-]{36})/);
const base = fromUrl?.[1] ?? args[1] ?? "http://localhost:3000";
const id = fromUrl?.[2] ?? target;
const rpcUrl = args[2] ?? process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

interface PublicProof {
  rule: RuleId;
  proofHash: string;
  campaign: { title: string; onchainAddress: string | null };
  proof: ProofRecord;
}

let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

const res = await fetch(`${base}/api/proof/${id}`);
if (!res.ok) throw new Error(`Couldn't load proof ${id} from ${base}: ${res.status}`);
const p = (await res.json()) as PublicProof;
console.log(`Proof ${id}: ${p.campaign.title}, rule ${p.rule}, schema ${p.proof.schema}\n`);

// 1. The hash of the record we were given.
const recomputed = proofHash(p.proof);
check(recomputed === p.proofHash, "SHA-256 of the canonical proof record matches the published proof hash", recomputed.slice(0, 16) + "…");

// 2. The record replays on its own.
if (p.proof.seedState && p.proof.guards) {
  for (const c of replayProofRecord(p.proof)) check(c.ok, c.label);
} else {
  // botheist.proof/v1 records carry only hashes: check that the state-hash chain is unbroken.
  let prev = p.proof.seedStateHash;
  const chained = p.proof.operations.every((op) => {
    const ok = op.stateBeforeHash === prev;
    prev = op.stateAfterHash;
    return ok;
  });
  check(chained && prev === p.proof.finalStateHash, `${p.proof.operations.length} operations form one unbroken state-hash chain (v1 record: no seed state to replay)`);
}

// 3. What Solana committed for this (campaign, rule).
if (!p.campaign.onchainAddress) {
  console.log("\nPractice finding: nothing on-chain to compare (only bounty findings are paid on Solana).");
} else {
  const campaign = address(p.campaign.onchainAddress);
  const ruleIndex = RULES[p.rule].onchainIndex;
  const rpc = createSolanaRpc(rpcUrl) as unknown as Parameters<typeof fetchClaim>[0]["rpc"];
  const claimAddress = await findClaimAddress(campaign, ruleIndex);
  console.log(`\nClaim ${claimAddress} and campaign ${campaign} on ${rpcUrl}`);
  const [claim, onchainCampaign] = await Promise.all([fetchClaim({ rpc }, campaign, ruleIndex), fetchCampaign({ rpc }, campaign)]);
  if (!claim) {
    check(false, "Claim account exists on-chain");
  } else {
    check(bytesToHex(claim.proofHash) === recomputed, "on-chain proof hash equals the recomputed hash");
    check(bytesToHex(claim.runId) === bytesToHex(uuidToBytes(p.proof.runId)), "on-chain run id equals the proof's run");
    if (p.proof.winner) check(claim.winner === p.proof.winner, "on-chain winner equals the winner in the proof", claim.winner);
    const reward = onchainCampaign?.rewards.slice(0, onchainCampaign.rewardCount).find((r) => r.ruleId === ruleIndex);
    check(
      Boolean(reward) && claim.amount === reward!.amount && reward!.claimed,
      "paid amount equals the reward fixed in the on-chain campaign, now marked claimed",
      `${Number(claim.amount) / 1e9} SOL`,
    );
  }
}

console.log(failures === 0 ? "\nVerified." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
