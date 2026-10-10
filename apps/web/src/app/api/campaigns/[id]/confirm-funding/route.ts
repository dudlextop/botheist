import { confirmFunding } from "@botheist/core";
import { body, db, handler, json, requireUser } from "@/server/http";

export const POST = handler(async (req, ctx: RouteContext<"/api/campaigns/[id]/confirm-funding">) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const { signature } = await body<{ signature: string }>(req);
  const campaign = await confirmFunding(db(), user.userId, id, String(signature ?? ""));
  return json({ id: campaign.id, status: campaign.status });
});
