import { TRAINING_AGENTS } from "@botheist/agent";
import type { Db } from "@botheist/db";
import { MISSION_TEMPLATES, RULES, RULE_IDS } from "@botheist/engine";
import { upsertAgentVersion } from "./agentVersions";

export const ACADEMY_PREFIX = "academy-";

/**
 * Idempotently create the training catalog: one always-open training campaign
 * per prepared Milo version, each with the three missions.
 */
export async function ensureTrainingCatalog(db: Db): Promise<void> {
  for (const agent of TRAINING_AGENTS) {
    const version = await upsertAgentVersion(db, agent, { isTraining: true, slug: agent.slug });
    const slug = `${ACADEMY_PREFIX}${agent.slug}`;
    const campaign = await db.campaign.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        title: `${agent.name} · ${agent.label}`,
        description: agent.blurb,
        kind: "TRAINING",
        status: "ACTIVE",
        agentVersionId: version.id,
        maxMessages: 10,
        maxToolCalls: 20,
        maxDurationSec: 300,
        runBudgetMicros: 250_000,
        totalBudgetMicros: 100_000_000n,
        publishedAt: new Date(),
      },
    });
    for (const [i, rule] of RULE_IDS.entries()) {
      const t = MISSION_TEMPLATES[rule];
      await db.mission.upsert({
        where: { campaignId_rule: { campaignId: campaign.id, rule } },
        update: {},
        create: {
          campaignId: campaign.id,
          rule,
          ruleIndex: RULES[rule].onchainIndex,
          title: t.title,
          objective: t.objective,
          points: 100 * agent.difficulty,
          sortOrder: i,
        },
      });
    }
  }
}
