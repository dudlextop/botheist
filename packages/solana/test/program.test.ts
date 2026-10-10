import { resolve } from "node:path";
import { createClient, generateKeyPairSigner, lamports, type KeyPairSigner } from "@solana/kit";
import { litesvm } from "@solana/kit-plugin-litesvm";
import { signer } from "@solana/kit-plugin-signer";
import { beforeEach, describe, expect, it } from "vitest";
import { PROGRAM_ID, bytesToHex, findCampaignAddress, findClaimAddress, findVaultAddress, uuidToBytes } from "../src/index";
import { fetchCampaign, fetchClaim, sendAward, sendCreateCampaign, sendRefund } from "../src/server";

const SO = resolve(import.meta.dirname, "../../../target/deploy/botheist.so");
const SOL = 1_000_000_000n;
const CAMPAIGN = "6f9a3c1e-2b4d-4e8f-9a1b-3c5d7e9f0a2b";
const RUN_A = "11111111-2222-4333-8444-555555555555";
const RUN_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

async function setup() {
  const feePayer = await generateKeyPairSigner();
  const client = createClient().use(signer(feePayer)).use(litesvm({ transactionConfig: { version: 1 } }));
  client.svm.addProgramFromFile(PROGRAM_ID, SO);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const clock = client.svm.getClock();
  clock.unixTimestamp = now;
  client.svm.setClock(clock);
  const [organizer, verifier, winner, other] = await Promise.all([1, 2, 3, 4].map(() => generateKeyPairSigner()));
  for (const s of [feePayer, organizer!, verifier!, winner!, other!]) client.svm.airdrop(s.address, lamports(10n * SOL));
  return { client, organizer: organizer!, verifier: verifier!, winner: winner!, other: other!, now };
}

function setTime(client: Awaited<ReturnType<typeof setup>>["client"], ts: bigint) {
  const clock = client.svm.getClock();
  clock.unixTimestamp = ts;
  client.svm.setClock(clock);
  client.svm.expireBlockhash();
}

describe("botheist program via the generated Kit client", () => {
  let env: Awaited<ReturnType<typeof setup>>;
  let campaign: Awaited<ReturnType<typeof findCampaignAddress>>;

  beforeEach(async () => {
    env = await setup();
    const close = new Date(Number(env.now + 3600n) * 1000);
    const deadline = new Date(Number(env.now + 7200n) * 1000);
    const res = await sendCreateCampaign(env.client, env.organizer, {
      campaignUuid: CAMPAIGN,
      verifier: env.verifier.address,
      configHashHex: "ab".repeat(32),
      rewards: [
        { ruleIndex: 0, lamports: SOL / 2n },
        { ruleIndex: 1, lamports: SOL / 4n },
      ],
      submissionsCloseAt: close,
      payoutDeadlineAt: deadline,
    });
    campaign = res.campaign;
    expect(res.campaign).toBe(await findCampaignAddress(env.organizer.address, CAMPAIGN));
    expect(res.vault).toBe(await findVaultAddress(res.campaign));
  });

  it("stores the frozen terms on-chain", async () => {
    const state = await fetchCampaign(env.client, campaign);
    expect(state?.organizer).toBe(env.organizer.address);
    expect(state?.verifier).toBe(env.verifier.address);
    expect(state?.totalFunded).toBe(SOL / 2n + SOL / 4n);
    expect(bytesToHex(state!.configHash)).toBe("ab".repeat(32));
    expect(bytesToHex(state!.campaignId)).toBe(bytesToHex(uuidToBytes(CAMPAIGN)));
  });

  it("pays a finding once and is idempotent on retry", async () => {
    const before = env.client.svm.getBalance(env.winner.address)!;
    const first = await sendAward(env.client, env.verifier, {
      campaign,
      ruleIndex: 0,
      runUuid: RUN_A,
      proofHashHex: "cd".repeat(32),
      winner: env.winner.address,
    });
    expect(first.status).toBe("sent");
    expect(env.client.svm.getBalance(env.winner.address)).toBe(before + SOL / 2n);

    const claim = await fetchClaim(env.client, campaign, 0);
    expect(claim?.winner).toBe(env.winner.address);
    expect(bytesToHex(claim!.proofHash)).toBe("cd".repeat(32));
    expect(await findClaimAddress(campaign, 0)).toBeTruthy();

    // A retry for the same run detects the existing Claim instead of paying again.
    const retry = await sendAward(env.client, env.verifier, {
      campaign,
      ruleIndex: 0,
      runUuid: RUN_A,
      proofHashHex: "cd".repeat(32),
      winner: env.winner.address,
    });
    expect(retry.status).toBe("already_paid_to_this_run");

    // A different run for the same rule is reported as already claimed.
    const late = await sendAward(env.client, env.verifier, {
      campaign,
      ruleIndex: 0,
      runUuid: RUN_B,
      proofHashHex: "ef".repeat(32),
      winner: env.other.address,
    });
    expect(late.status).toBe("claimed_by_other_run");
    expect(env.client.svm.getBalance(env.winner.address)).toBe(before + SOL / 2n);
  });

  it("refuses an award signed by someone other than the verifier", async () => {
    const impostor: KeyPairSigner = await generateKeyPairSigner();
    env.client.svm.airdrop(impostor.address, lamports(SOL));
    await expect(
      sendAward(env.client, impostor, {
        campaign,
        ruleIndex: 1,
        runUuid: RUN_A,
        proofHashHex: "00".repeat(32),
        winner: env.winner.address,
      }),
    ).rejects.toThrow();
    expect(await fetchClaim(env.client, campaign, 1)).toBeNull();
  });

  it("returns the remainder to the organizer only after the deadline", async () => {
    await expect(sendRefund(env.client, env.organizer, campaign)).rejects.toThrow();
    setTime(env.client, env.now + 7201n);
    await sendRefund(env.client, env.organizer, campaign);
    expect(env.client.svm.getBalance(await findVaultAddress(campaign)) ?? 0n).toBe(0n);
    expect((await fetchCampaign(env.client, campaign))?.closed).toBe(true);
  });
});
