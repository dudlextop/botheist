import { checkApiKey } from "@botheist/agent";
import { AppError, normalizeApiKey } from "@botheist/core";
import { headers } from "next/headers";
import { body, handler, json } from "@/server/http";

// Small per-address limit so this endpoint can't be used to test keys in bulk.
const WINDOW_MS = 60_000;
const MAX_CHECKS = 8;
const recent = new Map<string, number[]>();

/** Verify a Claude API key with a free call. The key is not stored or logged. */
export const POST = handler(async (req) => {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_CHECKS) throw new AppError("RATE_LIMITED", "Too many key checks. Wait a minute and try again.", 429);
  recent.set(ip, [...hits, now]);

  const { apiKey } = await body<{ apiKey?: string }>(req);
  const key = normalizeApiKey(apiKey);
  if (!key) throw new AppError("BAD_API_KEY", "Paste a Claude API key first");
  const result = await checkApiKey(key);
  if (result.ok) return json({ ok: true });
  if (result.reason === "rejected") throw new AppError("KEY_REJECTED", "Anthropic rejected this key. Check that it's active and copied in full.", 400);
  throw new AppError("KEY_UNREACHABLE", "Couldn't reach Anthropic to check the key. Try again in a moment.", 502);
});
