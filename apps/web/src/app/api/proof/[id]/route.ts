import { getPublicProof } from "@botheist/core";
import { db, handler, json } from "@/server/http";

export const GET = handler(async (_req, ctx: RouteContext<"/api/proof/[id]">) => {
  const { id } = await ctx.params;
  return json(await getPublicProof(db(), id));
});
