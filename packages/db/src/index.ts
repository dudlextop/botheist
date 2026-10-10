import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../generated/client";

export * from "../generated/client";
export { Prisma };

declare global {
  // eslint-disable-next-line no-var
  var __botheistPrisma: PrismaClient | undefined;
}

export function createPrisma(url = process.env.DATABASE_URL): PrismaClient {
  if (!url) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

/** One client per process (survives Next.js dev hot reloads). */
export function getDb(): PrismaClient {
  globalThis.__botheistPrisma ??= createPrisma();
  return globalThis.__botheistPrisma;
}

export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------- job queue

export type JobType = "agent_turn" | "verify_finding" | "send_payout" | "confirm_payout" | "regression" | "expire_runs";

export interface JobRow {
  id: bigint;
  type: JobType;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

export async function enqueue(
  db: Db | Tx,
  type: JobType,
  payload: Record<string, unknown>,
  opts: { runAt?: Date; dedupeKey?: string; maxAttempts?: number } = {},
): Promise<void> {
  const data = {
    type,
    payload: payload as Prisma.InputJsonValue,
    runAt: opts.runAt ?? new Date(),
    maxAttempts: opts.maxAttempts ?? 5,
    dedupeKey: opts.dedupeKey ?? null,
  };
  if (opts.dedupeKey) {
    await db.job.upsert({ where: { dedupeKey: opts.dedupeKey }, create: data, update: {} });
  } else {
    await db.job.create({ data });
  }
}

/** Atomically claim the next due job of the given types (safe across many workers). */
export async function claimJob(db: Db, types: JobType[], workerId: string): Promise<JobRow | null> {
  const rows = await db.$queryRaw<JobRow[]>`
    UPDATE "Job" SET status = 'RUNNING', "lockedAt" = now(), "lockedBy" = ${workerId},
      attempts = attempts + 1, "updatedAt" = now()
    WHERE id = (
      SELECT id FROM "Job"
      WHERE status = 'QUEUED' AND "runAt" <= now() AND type = ANY(${types}::text[])
      ORDER BY "runAt", id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, type, payload, attempts, "maxAttempts"`;
  return rows[0] ?? null;
}

export async function completeJob(db: Db, id: bigint): Promise<void> {
  await db.job.update({ where: { id }, data: { status: "DONE", lockedAt: null, lockedBy: null } });
}

/** Retry later with backoff, or mark failed once attempts are used up. */
export async function failJob(db: Db, job: JobRow, error: unknown, retryDelayMs = 2000): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const finalFail = job.attempts >= job.maxAttempts;
  await db.job.update({
    where: { id: job.id },
    data: {
      status: finalFail ? "FAILED" : "QUEUED",
      lastError: message.slice(0, 2000),
      runAt: new Date(Date.now() + retryDelayMs * Math.max(1, job.attempts)),
      lockedAt: null,
      lockedBy: null,
    },
  });
}

/** Return jobs held by a crashed worker to the queue. */
export async function reclaimStaleJobs(db: Db, staleAfterMs = 120_000): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const res = await db.job.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: cutoff } },
    data: { status: "QUEUED", lockedAt: null, lockedBy: null },
  });
  return res.count;
}

/** JSON.stringify replacer that turns BigInt into strings for API responses. */
export function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}
