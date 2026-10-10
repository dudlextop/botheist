import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { hostname } from "node:os";

loadEnv({ path: resolve(import.meta.dirname, "../../../.env") });

const { claimJob, completeJob, failJob, getDb, reclaimStaleJobs } = await import("@botheist/db");
const core = await import("@botheist/core");

type JobType = Parameters<typeof claimJob>[1][number];
type Job = NonNullable<Awaited<ReturnType<typeof claimJob>>>;

const db = getDb();
const role = (process.argv[2] ?? "all") as "agent" | "payout" | "all";
const workerId = `${hostname()}:${process.pid}:${role}`;
let stopping = false;

function log(msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ t: new Date().toISOString(), worker: role, msg, ...extra }));
}

/** Agent worker: runs cashier turns. Holds no payout key. */
async function handleAgent(job: Job) {
  const { runId, text } = job.payload as { runId: string; text: string };
  const outcome = await core.processAgentTurn(db, runId, text);
  log("agent turn", { runId, outcome });
}

/** Payout worker: verification, rewards and regressions. The only holder of the verifier key. */
const chain = new core.SolanaPayoutChain();
async function handlePayout(job: Job) {
  const p = job.payload as Record<string, string>;
  switch (job.type) {
    case "verify_finding":
      log("verified", { findingId: p.findingId, outcome: await core.verifyFindingJob(db, p.findingId!) });
      return;
    case "send_payout":
      if (!core.config.payoutsEnabled) {
        log("payouts disabled; leaving payout pending", { payoutId: p.payoutId });
        return;
      }
      log("payout sent", { payoutId: p.payoutId, status: await core.sendPayoutJob(db, chain, p.payoutId!) });
      return;
    case "confirm_payout":
      log("payout confirm", { payoutId: p.payoutId, status: await core.confirmPayoutJob(db, chain, p.payoutId!, job.attempts) });
      return;
    case "regression":
      await core.runRegressionJob(db, p.regressionId!);
      log("regression done", { regressionId: p.regressionId });
      return;
  }
}

async function loop(types: JobType[], handler: (job: Job) => Promise<void>, concurrency: number) {
  const lanes = Array.from({ length: concurrency }, async () => {
    while (!stopping) {
      const job = await claimJob(db, types, workerId).catch((err) => {
        log("claim failed", { error: String(err) });
        return null;
      });
      if (!job) {
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
      try {
        await handler(job);
        await completeJob(db, job.id);
      } catch (err) {
        const retry = err instanceof core.RetryLater;
        if (!retry) log("job failed", { id: String(job.id), type: job.type, error: err instanceof Error ? err.message : String(err) });
        await failJob(db, job, err, retry ? 1500 : 3000);
        // A turn that failed outright must not leave the run locked.
        if (job.type === "agent_turn") {
          const { runId } = job.payload as { runId: string };
          await core.finishRun(db, runId, "MODEL_ERROR", "worker_error").catch(() => {});
        }
      }
    }
  });
  await Promise.all(lanes);
}

async function housekeeping() {
  while (!stopping) {
    try {
      const reclaimed = await reclaimStaleJobs(db);
      const expired = await core.expireIdleRuns(db);
      const payouts = role !== "agent" && core.config.payoutsEnabled ? await core.requeueStalledPayouts(db) : 0;
      // Brought API keys never outlive their attempt or check.
      const keysErased = await core.eraseFinishedKeys(db);
      if (reclaimed || expired || payouts || keysErased) log("housekeeping", { reclaimed, expired, payouts, keysErased });
    } catch (err) {
      log("housekeeping failed", { error: String(err) });
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));

await core.ensureTrainingCatalog(db);
log("started", { workerId, cluster: core.config.cluster, payouts: core.config.payoutsEnabled });
const tasks: Promise<void>[] = [housekeeping()];
if (role === "agent" || role === "all") tasks.push(loop(["agent_turn"], handleAgent, 8));
if (role === "payout" || role === "all") {
  tasks.push(loop(["verify_finding", "send_payout", "confirm_payout"], handlePayout, 1));
  tasks.push(loop(["regression"], handlePayout, 2));
}
await Promise.all(tasks);
await db.$disconnect();
log("stopped");
