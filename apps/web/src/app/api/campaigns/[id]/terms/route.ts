import { campaignTerms, notFound } from "@botheist/core";
import { db, handler, json } from "@/server/http";

/** Public: anyone can recompute the config hash committed on-chain. */
export const GET = handler(async (_req, ctx: RouteContext<"/api/campaigns/[id]/terms">) => {
  const { id } = await ctx.params;
  const c = await db().campaign.findUnique({ where: { id } });
  if (!c?.configHash || !c.verifierPubkey) throw notFound("Published campaign");
  return json({ configHash: c.configHash, terms: await campaignTerms(db(), id, c.verifierPubkey) });
});
