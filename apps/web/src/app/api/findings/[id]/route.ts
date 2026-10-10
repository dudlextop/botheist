import { getFindingCard } from "@botheist/core";
import { db, getActor, handler, json } from "@/server/http";

export const GET = handler(async (_req, ctx: RouteContext<"/api/findings/[id]">) => {
  const { id } = await ctx.params;
  return json(await getFindingCard(db(), id, await getActor()));
});
