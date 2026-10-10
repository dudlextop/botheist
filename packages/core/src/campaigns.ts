import { MODELS, type AgentConfig, type Effort } from "@botheist/agent";
import type { Db, Prisma } from "@botheist/db";
import { MISSION_TEMPLATES, RULES, hashValue, type RuleId, type ToolGuards } from "@botheist/engine";
import {
  LAMPORTS_PER_SOL,
  PROGRAM_ID,
  bytesToHex,
  findCampaignAddress,
  findVaultAddress,
  isAddress,
} from "@botheist/solana";
import { fetchCampaign } from "@botheist/solana/server";
import { address, createSolanaRpc } from "@solana/kit";
import { upsertAgentVersion } from "./agentVersions";
import { config } from "./config";
import { AppError, forbidden, notFound } from "./errors";

export interface DraftCampaignInput {
  title: string;
  description?: string;
  model: string;
  effort: Effort;
  instructions: string;
  guards: ToolGuards;
  missions: Array<{ rule: RuleId; rewardSol: string }>;
  maxMessages: number;
  maxToolCalls: number;
  maxDurationSec: number;
  runBudgetUsd: number;
  totalBudgetUsd: number;
  submissionsCloseAt: string;
  payoutDeadlineAt: string;
  parentAgentVersionId?: string | null;
  /** Let players without a Claude key play against offline Milo (demo bounties). */
  offlineAllowed?: boolean;
}

const MIN_LEAD_MS = 10 * 60 * 1000;
const MAX_REWARD_LAMPORTS = 5n * LAMPORTS_PER_SOL;

export function solToLamports(sol: string): bigint {
  if (!/^\d+(\.\d{1,9})?$/.test(sol.trim())) throw new AppError("BAD_AMOUNT", `Invalid SOL amount: ${sol}`);
  const [whole, frac = ""] = sol.trim().split(".");
  return BigInt(whole!) * LAMPORTS_PER_SOL + BigInt(frac.padEnd(9, "0"));
}

function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "campaign"
  );
}

function validate(input: DraftCampaignInput, now: Date) {
  const title = input.title.trim();
  if (title.length < 3 || title.length > 80) throw new AppError("BAD_TITLE", "Title must be 3–80 characters");
  if (!MODELS.some((m) => m.id === input.model)) throw new AppError("BAD_MODEL", "Pick a supported model");
  if (!["low", "medium", "high"].includes(input.effort)) throw new AppError("BAD_EFFORT", "Effort must be low, medium or high");
  const instructions = input.instructions.trim();
  if (instructions.length < 20 || instructions.length > 4000) throw new AppError("BAD_INSTRUCTIONS", "Instructions must be 20–4000 characters");
  if (input.missions.length < 1 || input.missions.length > 3) throw new AppError("BAD_MISSIONS", "Choose one to three rules");
  if (new Set(input.missions.map((m) => m.rule)).size !== input.missions.length) throw new AppError("BAD_MISSIONS", "Each rule only once");
  for (const m of input.missions) {
    if (!RULES[m.rule]) throw new AppError("BAD_RULE", `Unknown rule ${m.rule}`);
    const l = solToLamports(m.rewardSol);
    if (l <= 0n || l > MAX_REWARD_LAMPORTS) throw new AppError("BAD_REWARD", "Rewards must be between 0 and 5 SOL");
  }
  const intIn = (v: number, lo: number, hi: number, name: string) => {
    if (!Number.isInteger(v) || v < lo || v > hi) throw new AppError("BAD_LIMIT", `${name} must be ${lo}–${hi}`);
  };
  intIn(input.maxMessages, 1, 30, "Messages per attempt");
  intIn(input.maxToolCalls, 1, 60, "Tool calls per attempt");
  intIn(input.maxDurationSec, 60, 1800, "Attempt duration (s)");
  if (!(input.runBudgetUsd > 0 && input.runBudgetUsd <= 5)) throw new AppError("BAD_BUDGET", "Model budget per attempt must be $0–5");
  if (!(input.totalBudgetUsd >= input.runBudgetUsd && input.totalBudgetUsd <= 1000)) throw new AppError("BAD_BUDGET", "Total model budget must be at least one attempt and at most $1000");
  const close = new Date(input.submissionsCloseAt);
  const deadline = new Date(input.payoutDeadlineAt);
  if (Number.isNaN(close.getTime()) || Number.isNaN(deadline.getTime())) throw new AppError("BAD_SCHEDULE", "Invalid dates");
  if (close.getTime() < now.getTime() + MIN_LEAD_MS) throw new AppError("BAD_SCHEDULE", "Submissions must stay open at least 10 minutes");
  if (deadline.getTime() < close.getTime() + MIN_LEAD_MS) throw new AppError("BAD_SCHEDULE", "Leave at least 10 minutes between closing and the payout deadline");
  return { title, instructions, close, deadline };
}

export async function createDraftCampaign(db: Db, organizerId: string, input: DraftCampaignInput, now = new Date()) {
  const { title, instructions, close, deadline } = validate(input, now);
  const agent: AgentConfig = {
    slug: "milo-custom",
    name: `Milo · ${title}`,
    label: "Custom",
    difficulty: 3,
    model: input.model,
    effort: input.effort,
    instructions,
    guards: {
      refundCapToPaid: Boolean(input.guards.refundCapToPaid),
      payerOnly: Boolean(input.guards.payerOnly),
      paidOrdersOnly: Boolean(input.guards.paidOrdersOnly),
    },
    blurb: input.description?.trim() ?? "",
  };
  return db.$transaction(async (tx) => {
    const version = await upsertAgentVersion(tx, agent, { createdById: organizerId, parentId: input.parentAgentVersionId ?? null });
    const campaign = await tx.campaign.create({
      data: {
        slug: `${slugify(title)}-${crypto.randomUUID().slice(0, 6)}`,
        title,
        description: input.description?.trim() ?? "",
        kind: "PRIZE",
        status: "DRAFT",
        organizerId,
        agentVersionId: version.id,
        offlineAllowed: Boolean(input.offlineAllowed),
        maxMessages: input.maxMessages,
        maxToolCalls: input.maxToolCalls,
        maxDurationSec: input.maxDurationSec,
        runBudgetMicros: Math.round(input.runBudgetUsd * 1_000_000),
        totalBudgetMicros: BigInt(Math.round(input.totalBudgetUsd * 1_000_000)),
        startsAt: now,
        submissionsCloseAt: close,
        payoutDeadlineAt: deadline,
      },
    });
    for (const [i, m] of input.missions.entries()) {
      const t = MISSION_TEMPLATES[m.rule];
      const mission = await tx.mission.create({
        data: {
          campaignId: campaign.id,
          rule: m.rule,
          ruleIndex: RULES[m.rule].onchainIndex,
          title: t.title,
          objective: t.objective,
          rewardLamports: solToLamports(m.rewardSol),
          points: 500,
          sortOrder: i,
        },
      });
      await tx.rewardSlot.create({ data: { missionId: mission.id } });
    }
    await tx.user.update({ where: { id: organizerId }, data: { role: "ORGANIZER" } });
    return campaign;
  });
}

/** The frozen terms of a campaign. Its hash is committed on-chain at funding time. */
export async function campaignTerms(db: Db, campaignId: string, verifier: string) {
  const c = await db.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { missions: { orderBy: { sortOrder: "asc" } }, agentVersion: true },
  });
  return {
    campaignId: c.id,
    agentConfigHash: c.agentVersion.configHash,
    missions: c.missions.map((m) => ({ rule: m.rule, ruleIndex: m.ruleIndex, rewardLamports: m.rewardLamports.toString() })),
    limits: { maxMessages: c.maxMessages, maxToolCalls: c.maxToolCalls, maxDurationSec: c.maxDurationSec, runBudgetMicros: c.runBudgetMicros },
    schedule: { submissionsCloseAt: c.submissionsCloseAt?.toISOString(), payoutDeadlineAt: c.payoutDeadlineAt?.toISOString() },
    // Only present when on, so campaigns funded before this option keep their terms hash.
    ...(c.offlineAllowed ? { offlineCashierAllowed: true } : {}),
    verifier,
    programId: PROGRAM_ID,
    cluster: config.cluster,
  };
}

export interface FundingParams {
  campaignId: string;
  organizer: string;
  verifier: string;
  configHashHex: string;
  rewards: Array<{ ruleIndex: number; lamports: string }>;
  submissionsCloseAt: string;
  payoutDeadlineAt: string;
  campaignAddress: string;
  vaultAddress: string;
  programId: string;
  cluster: string;
  rpcUrl: string;
  totalLamports: string;
}

/** Freeze the draft and return what the organizer's wallet must sign. */
export async function prepareFunding(db: Db, organizerId: string, organizerWallet: string, campaignId: string, verifier: string): Promise<FundingParams> {
  const c = await db.campaign.findUnique({ where: { id: campaignId }, include: { missions: { orderBy: { sortOrder: "asc" } } } });
  if (!c) throw notFound("Campaign");
  if (c.organizerId !== organizerId) throw forbidden();
  if (c.status !== "DRAFT" && c.status !== "AWAITING_FUNDING") throw new AppError("ALREADY_PUBLISHED", "This campaign is already published; create a new version instead");
  if (!isAddress(organizerWallet)) throw new AppError("BAD_WALLET", "Invalid wallet");
  if (c.submissionsCloseAt && c.submissionsCloseAt.getTime() < Date.now() + 5 * 60_000) {
    throw new AppError("BAD_SCHEDULE", "Submissions close too soon; create a new draft with a later schedule");
  }
  const terms = await campaignTerms(db, campaignId, verifier);
  const configHashHex = hashValue(terms);
  const campaignAddress = await findCampaignAddress(address(organizerWallet), c.id);
  const vaultAddress = await findVaultAddress(campaignAddress);
  await db.campaign.update({
    where: { id: c.id },
    data: {
      status: "AWAITING_FUNDING",
      configHash: configHashHex,
      cluster: config.cluster,
      programId: PROGRAM_ID,
      verifierPubkey: verifier,
      onchainAddress: campaignAddress,
      vaultAddress,
    },
  });
  const total = c.missions.reduce((s, m) => s + m.rewardLamports, 0n);
  return {
    campaignId: c.id,
    organizer: organizerWallet,
    verifier,
    configHashHex,
    rewards: c.missions.map((m) => ({ ruleIndex: m.ruleIndex, lamports: m.rewardLamports.toString() })),
    submissionsCloseAt: c.submissionsCloseAt!.toISOString(),
    payoutDeadlineAt: c.payoutDeadlineAt!.toISOString(),
    campaignAddress,
    vaultAddress,
    programId: PROGRAM_ID,
    cluster: config.cluster,
    rpcUrl: config.rpcUrl,
    totalLamports: total.toString(),
  };
}

function readRpc() {
  return { rpc: createSolanaRpc(config.rpcUrl) };
}

/**
 * Activate a campaign only after its on-chain account matches the frozen terms:
 * organizer, verifier, config hash, rewards and schedule.
 */
export async function confirmFunding(db: Db, organizerId: string, campaignId: string, signature: string, chainRead = readRpc) {
  const c = await db.campaign.findUnique({ where: { id: campaignId }, include: { missions: true, organizer: true } });
  if (!c) throw notFound("Campaign");
  if (c.organizerId !== organizerId) throw forbidden();
  if (c.status === "ACTIVE") return c;
  if (c.status !== "AWAITING_FUNDING" || !c.onchainAddress || !c.configHash) throw new AppError("NOT_PREPARED", "Prepare funding first");
  const onchain = await fetchCampaign(chainRead(), address(c.onchainAddress));
  if (!onchain) throw new AppError("NOT_ON_CHAIN", "The campaign account was not found on-chain yet. Try again in a few seconds.", 409);
  const problems: string[] = [];
  if (onchain.organizer !== c.organizer?.wallet) problems.push("organizer");
  if (onchain.verifier !== c.verifierPubkey) problems.push("verifier");
  if (bytesToHex(onchain.configHash) !== c.configHash) problems.push("config hash");
  if (bytesToHex(onchain.campaignId) !== c.id.replace(/-/g, "")) problems.push("campaign id");
  const expected = c.missions.map((m) => `${m.ruleIndex}:${m.rewardLamports}`).sort().join(",");
  const actual = onchain.rewards
    .slice(0, onchain.rewardCount)
    .map((r) => `${r.ruleId}:${r.amount}`)
    .sort()
    .join(",");
  if (expected !== actual) problems.push("rewards");
  if (Number(onchain.submissionsCloseAt) !== Math.floor(c.submissionsCloseAt!.getTime() / 1000)) problems.push("submissions close");
  if (Number(onchain.payoutDeadlineAt) !== Math.floor(c.payoutDeadlineAt!.getTime() / 1000)) problems.push("payout deadline");
  if (problems.length) throw new AppError("TERMS_MISMATCH", `On-chain campaign does not match the frozen terms: ${problems.join(", ")}`);
  return db.campaign.update({
    where: { id: c.id },
    data: { status: "ACTIVE", fundTxSignature: signature, fundedLamports: onchain.totalFunded, publishedAt: new Date() },
  });
}

export async function confirmRefund(db: Db, organizerId: string, campaignId: string, signature: string, chainRead = readRpc) {
  const c = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!c) throw notFound("Campaign");
  if (c.organizerId !== organizerId) throw forbidden();
  if (!c.onchainAddress) throw new AppError("NOT_ON_CHAIN", "Campaign was never funded");
  const onchain = await fetchCampaign(chainRead(), address(c.onchainAddress));
  if (!onchain?.closed) throw new AppError("NOT_REFUNDED", "The vault has not been refunded on-chain yet", 409);
  return db.campaign.update({ where: { id: c.id }, data: { status: "REFUNDED", refundTxSignature: signature } });
}

/** A changed configuration is always a new agent version linked to its parent. */
export async function createAgentVersion(
  db: Db,
  organizerId: string,
  input: { baseVersionId: string; name?: string; model?: string; effort?: Effort; instructions?: string; guards?: ToolGuards },
) {
  const base = await db.agentVersion.findUnique({ where: { id: input.baseVersionId } });
  if (!base) throw notFound("Agent version");
  if (input.model && !MODELS.some((m) => m.id === input.model)) throw new AppError("BAD_MODEL", "Pick a supported model");
  const config: AgentConfig = {
    slug: "milo-custom",
    name: input.name?.trim() || `${base.name} (fixed)`,
    label: "Custom",
    difficulty: base.difficulty as AgentConfig["difficulty"],
    model: input.model ?? base.model,
    effort: input.effort ?? (base.effort as Effort),
    instructions: input.instructions?.trim() || base.instructions,
    guards: input.guards ?? (base.guards as unknown as ToolGuards),
    blurb: base.blurb,
  };
  return upsertAgentVersion(db, config, { createdById: organizerId, parentId: base.id, seedOptions: base.seedOptions as Prisma.JsonObject });
}
