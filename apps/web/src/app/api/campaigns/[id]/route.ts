import { getOrganizerDashboard, notFound } from "@botheist/core";
import { db, handler, json, requireUser } from "@/server/http";

export const GET = handler(async (_req, ctx: RouteContext<"/api/campaigns/[id]">) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const campaign = (await getOrganizerDashboard(db(), user.userId)).find((c) => c.id === id);
  if (!campaign) throw notFound("Campaign");
  return json(campaign);
});
