/**
 * Verify a BotHeist proof without trusting the BotHeist server's word for it:
 *   1. recompute the proof record's SHA-256 locally,
 *   2. check the replayed operations form one unbroken state-hash chain that
 *      ends in the claimed violation,
 *   3. read the on-chain Claim account for (campaign, rule) on Solana and
 *      compare its proof hash, run id, winner and amount.
 *
 *   pnpm --filter @botheist/worker verify:proof -- <proof page URL | finding id> [baseUrl] [rpcUrl]
 */
import { address, createSolanaRpc } from "@solana/kit";
import { RULES, proofHash, type ProofRecord, type RuleId } from "@botheist/engine";
import { bytesToHex, findClaimAddress, uuidToBytes } from "@botheist/solana";
import { fetchClaim } from "@botheist/solana/server";

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
  payout: { status: string; signature: string | null; lamports: string; recipient: string } | null;
  proof: ProofRecord & {
    seedStateHash: string;
    finalStateHash: string;
    operations: Array<{ seq: number; tool: string; mutated: boolean; stateBeforeHash: string; stateAfterHash: string }>;
    violation: { decisiveSeq: number; paid: number; refunded: number };
  };
}

let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

const res = await fetch(`${base}/api/proof/${id}`);
if (!res.ok) throw new Error(`Couldn't load proof ${id} from ${base}: ${res.status}`);
const p = (await res.json()) as PublicProof;
console.log(`Proof ${id}: ${p.campaign.title}, rule ${p.rule}\n`);

// 1. The hash the server shows is the hash of the record it shows.
const recomputed = proofHash(p.proof);
check(recomputed === p.proofHash, "SHA-256 of the canonical proof record matches the published proof hash", recomputed.slice(0, 16) + "…");

// 2. Replayed operations chain from the seed state to the final state.
const ops = p.proof.operations;
let prev = p.proof.seedStateHash;
let chained = true;
for (const op of ops) {
  if (op.stateBeforeHash !== prev) chained = false;
  prev = op.stateAfterHash;
}
check(chained && prev === p.proof.finalStateHash, `${ops.length} operations form one unbroken state-hash chain from seed to final state`);
const decisive = ops.find((o) => o.seq === p.proof.violation.decisiveSeq);
check(Boolean(decisive?.mutated), `decisive step ${p.proof.violation.decisiveSeq} is a state-changing ${decisive?.tool ?? "operation"}`);

// 3. The chain holds the same hash, for the same run, paid to the same wallet.
if (!p.campaign.onchainAddress) {
  console.log("\nPractice finding: no on-chain claim to compare (only bounty findings are paid on Solana).");
} else {
  const campaign = address(p.campaign.onchainAddress);
  const ruleIndex = RULES[p.rule].onchainIndex;
  const rpc = createSolanaRpc(rpcUrl);
  const claim = await fetchClaim({ rpc } as unknown as Parameters<typeof fetchClaim>[0], campaign, ruleIndex);
  console.log(`\nClaim account ${await findClaimAddress(campaign, ruleIndex)} on ${rpcUrl}`);
  if (!claim) {
    check(false, "Claim account exists on-chain", p.payout ? `payout status ${p.payout.status}` : "no payout yet");
  } else {
    check(bytesToHex(claim.proofHash) === recomputed, "on-chain proof hash equals the recomputed hash");
    check(bytesToHex(claim.runId) === bytesToHex(uuidToBytes(p.proof.runId)), "on-chain run id equals the proof's run");
    if (p.proof.winner) check(claim.winner === p.proof.winner, "on-chain winner equals the proof's winner", claim.winner);
    if (p.payout) check(claim.amount === BigInt(p.payout.lamports), "on-chain amount equals the bounty", `${Number(claim.amount) / 1e9} SOL`);
  }
}

console.log(failures === 0 ? "\nVerified." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
