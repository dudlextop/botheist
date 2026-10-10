import { getRunView } from "@botheist/core";
import { db, getActor, handler, json } from "@/server/http";

export const GET = handler(async (_req, ctx: RouteContext<"/api/runs/[id]/result">) => {
  const { id } = await ctx.params;
  const view = await getRunView(db(), id, await getActor());
  return json({ id: view.id, status: view.status, endReason: view.endReason, finding: view.finding });
});
