import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { config } from "./config";
import { AppError } from "./errors";

/*
 * Players and organizers can bring their own Claude API key. The key travels
 * with the request that starts an attempt (or a regression check), is sealed
 * with AES-256-GCM before it touches the database, is opened only by the agent
 * worker for a model call, and is erased when the attempt ends.
 */

const VERSION = "v1";

function sealKey(secret = config.keySealSecret): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "botheist", "byok-api-key", 32));
}

export function sealSecret(plain: string, secret?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(secret), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function openSecret(sealed: string, secret?: string): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !body) throw new Error("Unsupported sealed value");
  const decipher = createDecipheriv("aes-256-gcm", sealKey(secret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

const KEY_PATTERN = /^sk-ant-[A-Za-z0-9_-]{20,200}$/;

/** Basic shape check; Anthropic validates the key itself on first use. */
export function normalizeApiKey(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") throw new AppError("BAD_API_KEY", "The API key must be a string");
  const key = raw.trim();
  if (!KEY_PATTERN.test(key)) throw new AppError("BAD_API_KEY", "That doesn't look like a Claude API key. Keys start with sk-ant-.");
  return key;
}
