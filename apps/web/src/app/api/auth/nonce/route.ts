import { createSignInMessage } from "@botheist/core";
import { body, db, handler, json } from "@/server/http";

export const POST = handler(async (req) => {
  const { wallet } = await body<{ wallet: string }>(req);
  const origin = new URL(req.url).origin;
  return json(await createSignInMessage(db(), String(wallet ?? ""), origin));
});
