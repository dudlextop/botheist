import { getRunView } from "@botheist/core";
import { db, getActor, handler, json } from "@/server/http";

export const GET = handler(async (_req, ctx: RouteContext<"/api/runs/[id]">) => {
  const { id } = await ctx.params;
  return json(await getRunView(db(), id, await getActor()));
});
