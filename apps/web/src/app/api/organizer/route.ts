import { getOrganizerDashboard } from "@botheist/core";
import { db, handler, json, requireUser } from "@/server/http";

export const GET = handler(async () => {
  const user = await requireUser();
  return json({ wallet: user.wallet, campaigns: await getOrganizerDashboard(db(), user.userId) });
});
