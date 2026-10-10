import { getProfile } from "@botheist/core";
import { db, getActor, handler, json } from "@/server/http";

export const GET = handler(async () => {
  const actor = await getActor();
  return json({ signedIn: Boolean(actor.userId), wallet: actor.wallet, ...(await getProfile(db(), actor)) });
});
