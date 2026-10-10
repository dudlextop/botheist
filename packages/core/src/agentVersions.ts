import { agentConfigFingerprint, type AgentConfig, type Effort } from "@botheist/agent";
import type { AgentVersion, Db, Prisma, Tx } from "@botheist/db";
import { ENGINE_VERSION, RULES_VERSION, TOOL_SPECS, hashValue, type SeedOptions, type ToolGuards } from "@botheist/engine";

export function agentConfigHash(config: Pick<AgentConfig, "model" | "effort" | "instructions" | "guards">, seedOptions: SeedOptions = {}): string {
  return hashValue({
    ...agentConfigFingerprint(config as AgentConfig, TOOL_SPECS, ENGINE_VERSION, RULES_VERSION),
    seedOptions,
  });
}

export function agentConfigFromRow(row: AgentVersion): AgentConfig {
  return {
    slug: row.slug,
    name: row.name,
    label: row.label,
    difficulty: row.difficulty as AgentConfig["difficulty"],
    model: row.model,
    effort: row.effort as Effort,
    instructions: row.instructions,
    guards: row.guards as unknown as ToolGuards,
    blurb: row.blurb,
  };
}

/**
 * Store an agent configuration. Identical configurations share one row (same
 * config hash); any change produces a new version, never an in-place edit.
 */
export async function upsertAgentVersion(
  db: Db | Tx,
  config: AgentConfig,
  opts: { isTraining?: boolean; createdById?: string | null; parentId?: string | null; seedOptions?: SeedOptions; slug?: string } = {},
): Promise<AgentVersion> {
  const seedOptions = opts.seedOptions ?? {};
  const configHash = agentConfigHash(config, seedOptions);
  const existing = await db.agentVersion.findUnique({ where: { configHash } });
  if (existing) return existing;
  return db.agentVersion.create({
    data: {
      slug: opts.slug ?? `${config.slug}-${configHash.slice(0, 8)}`,
      name: config.name,
      label: config.label,
      blurb: config.blurb,
      difficulty: config.difficulty,
      model: config.model,
      effort: config.effort,
      instructions: config.instructions,
      guards: config.guards as unknown as Prisma.InputJsonValue,
      seedOptions: seedOptions as Prisma.InputJsonValue,
      engineVersion: ENGINE_VERSION,
      rulesVersion: RULES_VERSION,
      configHash,
      isTraining: opts.isTraining ?? false,
      createdById: opts.createdById ?? null,
      parentId: opts.parentId ?? null,
    },
  });
}
