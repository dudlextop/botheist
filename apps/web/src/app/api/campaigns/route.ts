import { createDraftCampaign, type DraftCampaignInput } from "@botheist/core";
import { body, db, handler, json, requireUser } from "@/server/http";

export const POST = handler(async (req) => {
  const user = await requireUser();
  const campaign = await createDraftCampaign(db(), user.userId, await body<DraftCampaignInput>(req));
  return json({ id: campaign.id, slug: campaign.slug }, { status: 201 });
});
