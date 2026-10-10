import { startRun } from "@botheist/core";
import { body, db, getActor, handler, json } from "@/server/http";

export const POST = handler(async (req) => {
  const input = await body<{ campaignId: string; missionId: string; apiKey?: string }>(req);
  const run = await startRun(db(), await getActor(), input);
  return json({ runId: run.id }, { status: 201 });
});
