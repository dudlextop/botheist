import { cookies } from "next/headers";
import { createSessionToken, verifySignIn } from "@botheist/core";
import { SESSION_COOKIE, body, db, handler, json } from "@/server/http";

export const POST = handler(async (req) => {
  const input = await body<{ wallet: string; nonce: string; signature: string }>(req);
  const user = await verifySignIn(db(), { wallet: String(input.wallet), nonce: String(input.nonce), signature: String(input.signature) });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });
  return json({ userId: user.id, wallet: user.wallet });
});
