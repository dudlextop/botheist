import { AppError, prepareFunding } from "@botheist/core";
import { db, handler, json, publicConfig, requireUser } from "@/server/http";

export const POST = handler(async (_req, ctx: RouteContext<"/api/campaigns/[id]/prepare-funding">) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const verifier = publicConfig().verifier;
  if (!verifier) throw new AppError("NO_VERIFIER", "The payout verifier is not configured on this server", 503);
  return json(await prepareFunding(db(), user.userId, user.wallet, id, verifier));
});
