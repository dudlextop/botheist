import { cookies } from "next/headers";
import { SESSION_COOKIE, handler, json } from "@/server/http";

export const POST = handler(async () => {
  (await cookies()).delete(SESSION_COOKIE);
  return json({ ok: true });
});
