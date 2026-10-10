import { getModel } from "@botheist/agent";
import { jsonSafe, type Db } from "@botheist/db";
import { MISSION_TEMPLATES, RULES, type RuleId, type StoreState } from "@botheist/engine";
import { explorerAddressUrl, explorerTxUrl, type Cluster } from "@botheist/solana";
import { config } from "./config";
import { forbidden, notFound } from "./errors";
import { runLimits, type Actor } from "./runs";
import { ACHIEVEMENTS } from "./verify";

const cluster = () => config.cluster as Cluster;

export type MissionState = "available" | "completed" | "claimed" | "closed";

export async function listChallenges(db: Db, actor: Actor) {
  const campaigns = await db.campaign.findMany({
    // Only campaigns you can play; closed ones live on in proofs and the organizer dashboard.
    where: { status: "ACTIVE" },
    include: { agentVersion: true, missions: { orderBy: { sortOrder: "asc" }, include: { rewardSlot: true } } },
    // Bounties anyone can try without a key come first.
    orderBy: [{ kind: "desc" }, { offlineAllowed: "desc" }, { createdAt: "asc" }],
  });
  const mine = actor.userId || actor.guestKey
    ? await db.run.findMany({
        where: { status: "WON", ...(actor.userId ? { userId: actor.userId } : { guestKey: actor.guestKey! }), finding: { status: "CONFIRMED" } },
        select: { missionId: true },
      })
    : [];
  const done = new Set(mine.map((r) => r.missionId));
  const now = Date.now();
  return jsonSafe(
    campaigns.map((c) => {
      const closed = c.status !== "ACTIVE" || (c.submissionsCloseAt ? c.submissionsCloseAt.getTime() - c.maxDurationSec * 1000 < now : false);
      return {
        id: c.id,
        slug: c.slug,
        title: c.title,
        description: c.description,
        kind: c.kind,
        status: c.status,
        offlineAllowed: c.offlineAllowed,
        submissionsCloseAt: c.submissionsCloseAt,
        payoutDeadlineAt: c.payoutDeadlineAt,
        onchainAddress: c.onchainAddress,
        explorerUrl: c.onchainAddress ? explorerAddressUrl(c.onchainAddress, cluster()) : null,
        limits: { maxMessages: c.maxMessages, maxToolCalls: c.maxToolCalls, maxDurationSec: c.maxDurationSec },
        agent: {
          id: c.agentVersion.id,
          name: c.agentVersion.name,
          label: c.agentVersion.label,
          blurb: c.agentVersion.blurb,
          difficulty: c.agentVersion.difficulty,
          model: c.agentVersion.model,
          modelLabel: modelLabel(c.agentVersion.model),
          configHash: c.agentVersion.configHash,
        },
        missions: c.missions.map((m) => {
          const state: MissionState = done.has(m.id)
            ? "completed"
            : m.rewardSlot?.winnerFindingId
              ? "claimed"
              : closed
                ? "closed"
                : "available";
          return {
            id: m.id,
            rule: m.rule,
            title: m.title,
            objective: m.objective,
            tagline: MISSION_TEMPLATES[m.rule as RuleId].tagline,
            ruleText: RULES[m.rule as RuleId].rule,
            rewardLamports: m.rewardLamports,
            points: m.points,
            state,
          };
        }),
      };
    }),
  );
}

function modelLabel(id: string) {
  try {
    return getModel(id).label;
  } catch {
    return id;
  }
}

export async function getRunView(db: Db, runId: string, actor: Actor) {
  const run = await db.run.findUnique({
    where: { id: runId },
    include: {
      campaign: true,
      mission: true,
      agentVersion: true,
      finding: { include: { payout: true } },
      events: { orderBy: { seq: "asc" } },
    },
  });
  if (!run) throw notFound("Attempt");
  const owner = (run.userId && run.userId === actor.userId) || (!run.userId && run.guestKey && run.guestKey === actor.guestKey);
  const organizer = run.campaign.organizerId && run.campaign.organizerId === actor.userId;
  if (!owner && !organizer) throw forbidden("This attempt belongs to someone else");
  const t = MISSION_TEMPLATES[run.mission.rule as RuleId];
  return jsonSafe({
    id: run.id,
    status: run.status,
    endReason: run.endReason,
    busy: run.busy,
    wallet: run.wallet,
    startedAt: run.startedAt,
    expiresAt: run.expiresAt,
    finishedAt: run.finishedAt,
    playerMessages: run.playerMessages,
    toolCalls: run.toolCalls,
    limits: runLimits(run, run.campaign),
    campaign: { id: run.campaign.id, slug: run.campaign.slug, title: run.campaign.title, kind: run.campaign.kind },
    mission: {
      id: run.mission.id,
      rule: run.mission.rule,
      title: run.mission.title,
      objective: run.mission.objective,
      briefing: t.briefing,
      ruleText: RULES[run.mission.rule as RuleId].rule,
      winCondition: t.winCondition,
      rewardLamports: run.mission.rewardLamports,
      points: run.mission.points,
    },
    agent: {
      name: run.agentVersion.name,
      label: run.agentVersion.label,
      model: run.agentVersion.model,
      modelLabel: modelLabel(run.agentVersion.model),
      difficulty: run.agentVersion.difficulty,
      configHash: run.agentVersion.configHash,
    },
    brain: run.brain,
    seedState: run.seedState as unknown as StoreState,
    state: run.state as unknown as StoreState,
    finding: run.finding ? findingSummary(run.finding) : null,
    events: run.events.map((e) => ({ seq: e.seq, type: e.type, payload: e.payload, at: e.createdAt })),
    lastSeq: run.nextEventSeq - 1,
    cluster: config.cluster,
  });
}

function findingSummary(f: {
  id: string;
  status: string;
  summary: string;
  proofHash: string | null;
  decisiveSeq: number | null;
  paidMinor: number | null;
  refundedMinor: number | null;
  rejectionReason: string | null;
  payout?: { status: string; txSignature: string | null; lamports: bigint; recipient: string } | null;
}) {
  return {
    id: f.id,
    status: f.status,
    summary: f.summary,
    proofHash: f.proofHash,
    decisiveSeq: f.decisiveSeq,
    paid: f.paidMinor,
    refunded: f.refundedMinor,
    rejectionReason: f.rejectionReason,
    payout: f.payout
      ? {
          status: f.payout.status,
          signature: f.payout.txSignature,
          lamports: f.payout.lamports,
          recipient: f.payout.recipient,
          explorerUrl: f.payout.txSignature ? explorerTxUrl(f.payout.txSignature, cluster()) : null,
        }
      : null,
  };
}

export async function getEventsSince(db: Db, runId: string, afterSeq: number) {
  const events = await db.runEvent.findMany({ where: { runId, seq: { gt: afterSeq } }, orderBy: { seq: "asc" }, take: 200 });
  return jsonSafe(events.map((e) => ({ seq: e.seq, type: e.type, payload: e.payload, at: e.createdAt })));
}

export async function getProfile(db: Db, actor: Actor) {
  const user = actor.userId ? await db.user.findUnique({ where: { id: actor.userId }, include: { achievements: true } }) : null;
  const runs = await db.run.findMany({
    where: actor.userId ? { userId: actor.userId } : { guestKey: actor.guestKey ?? "__none__" },
    include: { mission: true, campaign: true, agentVersion: true, finding: { include: { payout: true } } },
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  return jsonSafe({
    user: user ? { id: user.id, wallet: user.wallet, displayName: user.displayName, points: user.points, role: user.role } : null,
    achievements: (user?.achievements ?? []).map((a) => ({ code: a.code, earnedAt: a.earnedAt, ...ACHIEVEMENTS[a.code] })),
    allAchievements: Object.entries(ACHIEVEMENTS).map(([code, a]) => ({ code, ...a })),
    runs: runs.map((r) => ({
      id: r.id,
      status: r.status,
      endReason: r.endReason,
      startedAt: r.startedAt,
      playerMessages: r.playerMessages,
      toolCalls: r.toolCalls,
      mission: { title: r.mission.title, rule: r.mission.rule },
      campaign: { title: r.campaign.title, kind: r.campaign.kind },
      agent: { name: r.agentVersion.name, label: r.agentVersion.label },
      finding: r.finding ? findingSummary(r.finding) : null,
    })),
  });
}

export async function getOrganizerDashboard(db: Db, organizerId: string) {
  const campaigns = await db.campaign.findMany({
    where: { organizerId },
    include: {
      agentVersion: true,
      missions: { orderBy: { sortOrder: "asc" }, include: { rewardSlot: true } },
      _count: { select: { runs: true } },
      findings: { include: { mission: true, payout: true, run: { select: { playerMessages: true, toolCalls: true, wallet: true } } }, orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });
  return jsonSafe(
    campaigns.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      status: c.status,
      configHash: c.configHash,
      onchainAddress: c.onchainAddress,
      explorerUrl: c.onchainAddress ? explorerAddressUrl(c.onchainAddress, cluster()) : null,
      fundTxSignature: c.fundTxSignature,
      fundedLamports: c.fundedLamports,
      submissionsCloseAt: c.submissionsCloseAt,
      payoutDeadlineAt: c.payoutDeadlineAt,
      spentMicros: c.spentMicros,
      totalBudgetMicros: c.totalBudgetMicros,
      runs: c._count.runs,
      agent: { id: c.agentVersion.id, name: c.agentVersion.name, model: c.agentVersion.model, configHash: c.agentVersion.configHash },
      missions: c.missions.map((m) => ({ id: m.id, title: m.title, rule: m.rule, rewardLamports: m.rewardLamports, claimed: Boolean(m.rewardSlot?.winnerFindingId) })),
      findings: c.findings.map((f) => ({
        id: f.id,
        status: f.status,
        rule: f.rule,
        mission: f.mission.title,
        summary: f.summary,
        paid: f.paidMinor,
        refunded: f.refundedMinor,
        decisiveSeq: f.decisiveSeq,
        playerMessages: f.run.playerMessages,
        winner: f.winnerWallet,
        payoutStatus: f.payout?.status ?? null,
        createdAt: f.createdAt,
      })),
    })),
  );
}

export async function getFindingCard(db: Db, findingId: string, actor: Actor) {
  const f = await db.finding.findUnique({
    where: { id: findingId },
    include: {
      campaign: true,
      mission: true,
      payout: true,
      run: { include: { agentVersion: true, events: { orderBy: { seq: "asc" } } } },
      regressions: { include: { targetAgentVersion: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!f) throw notFound("Finding");
  const isOrganizer = f.campaign.organizerId && f.campaign.organizerId === actor.userId;
  const isPlayer = f.run.userId ? f.run.userId === actor.userId : f.run.guestKey === actor.guestKey;
  if (!isOrganizer && !isPlayer) throw forbidden();
  const decisive = f.run.events.find((e) => e.type === "operation" && (e.payload as { record: { seq: number } }).record.seq === f.decisiveSeq);
  return jsonSafe({
    ...findingSummary(f),
    rule: f.rule,
    ruleText: RULES[f.rule as RuleId].rule,
    mission: f.mission.title,
    campaign: { id: f.campaign.id, title: f.campaign.title, kind: f.campaign.kind, organizerId: f.campaign.organizerId },
    agent: { id: f.run.agentVersion.id, name: f.run.agentVersion.name, model: f.run.agentVersion.model, configHash: f.run.agentVersion.configHash },
    brain: f.run.brain,
    decisiveAction: decisive ? (decisive.payload as { text: string }).text : null,
    playerMessages: f.run.playerMessages,
    toolCalls: f.run.toolCalls,
    winner: f.winnerWallet,
    otherViolations: f.otherViolations,
    addedToRegression: f.addedToRegression,
    verifiedAt: f.verifiedAt,
    isOrganizer: Boolean(isOrganizer),
    transcript: f.run.events
      .filter((e) => ["player_message", "agent_message", "operation", "rule_broken"].includes(e.type))
      .map((e) => ({ seq: e.seq, type: e.type, text: (e.payload as { text?: string; summary?: string }).text ?? (e.payload as { summary?: string }).summary ?? "" })),
    regressions: f.regressions.map((r) => ({
      id: r.id,
      mode: r.mode,
      status: r.status,
      repeats: r.repeats,
      brain: r.brain,
      summary: r.summary,
      target: { id: r.targetAgentVersion.id, name: r.targetAgentVersion.name },
      results: r.results,
      createdAt: r.createdAt,
    })),
  });
}

/** Scenario export for the organizer: everything needed to replay the finding elsewhere. */
export async function exportScenario(db: Db, findingId: string, actor: Actor) {
  const card = await getFindingCard(db, findingId, actor);
  if (!card.isOrganizer) throw forbidden("Only the organizer can export scenarios");
  const f = await db.finding.findUniqueOrThrow({ where: { id: findingId }, include: { run: true } });
  const messages = await db.runEvent.findMany({ where: { runId: f.runId, type: "player_message" }, orderBy: { seq: "asc" } });
  return jsonSafe({
    schema: "botheist.scenario/v1",
    findingId,
    rule: f.rule,
    seedState: f.run.seedState,
    playerMessages: messages.map((m) => (m.payload as { text: string }).text),
    proof: f.proof,
    proofHash: f.proofHash,
  });
}

/** Public proof page: the verified record without the player's chat. */
export async function getPublicProof(db: Db, findingId: string) {
  const f = await db.finding.findUnique({ where: { id: findingId }, include: { payout: true, campaign: true, mission: true } });
  if (!f || f.status !== "CONFIRMED") throw notFound("Proof");
  return jsonSafe({
    id: f.id,
    rule: f.rule,
    ruleText: RULES[f.rule as RuleId].rule,
    mission: f.mission.title,
    campaign: { title: f.campaign.title, kind: f.campaign.kind, onchainAddress: f.campaign.onchainAddress },
    summary: f.summary,
    proofHash: f.proofHash,
    proof: f.proof,
    verifiedAt: f.verifiedAt,
    payout: f.payout
      ? {
          status: f.payout.status,
          signature: f.payout.txSignature,
          lamports: f.payout.lamports,
          recipient: f.payout.recipient,
          explorerUrl: f.payout.txSignature ? explorerTxUrl(f.payout.txSignature, cluster()) : null,
          claimExplorerUrl: f.payout.claimAddress ? explorerAddressUrl(f.payout.claimAddress, cluster()) : null,
        }
      : null,
    campaignExplorerUrl: f.campaign.onchainAddress ? explorerAddressUrl(f.campaign.onchainAddress, cluster()) : null,
  });
}

export async function listAgentVersionsFor(db: Db, organizerId: string) {
  const versions = await db.agentVersion.findMany({
    where: { OR: [{ isTraining: true }, { createdById: organizerId }] },
    orderBy: [{ isTraining: "desc" }, { createdAt: "asc" }],
  });
  return versions.map((v) => ({
    id: v.id,
    name: v.name,
    label: v.label,
    model: v.model,
    guards: v.guards,
    configHash: v.configHash,
    parentId: v.parentId,
    isTraining: v.isTraining,
  }));
}
