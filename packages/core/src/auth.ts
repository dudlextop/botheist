import type { Db, User } from "@botheist/db";
import { address, getBase58Encoder, getPublicKeyFromAddress, getUtf8Encoder, signatureBytes, verifySignature } from "@solana/kit";
import { SignJWT, jwtVerify } from "jose";
import { isAddress } from "@botheist/solana";
import { config } from "./config";
import { AppError } from "./errors";

const NONCE_TTL_MS = 5 * 60_000;
const SESSION_TTL = "7d";

/** Sign-In With Solana: the server issues a one-time message the wallet signs. */
export async function createSignInMessage(db: Db, wallet: string, origin: string) {
  if (!isAddress(wallet)) throw new AppError("BAD_WALLET", "Invalid wallet address");
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const issuedAt = new Date();
  const host = new URL(origin).host;
  const message = [
    `${host} wants you to sign in with your Solana account:`,
    wallet,
    "",
    "Sign in to BotHeist. This request does not send a transaction and costs nothing.",
    "",
    `URI: ${origin}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
  ].join("\n");
  await db.authNonce.create({ data: { nonce, wallet, message, expiresAt: new Date(issuedAt.getTime() + NONCE_TTL_MS) } });
  return { nonce, message };
}

export async function verifySignIn(db: Db, input: { wallet: string; nonce: string; signature: string }): Promise<User> {
  const record = await db.authNonce.findUnique({ where: { nonce: input.nonce } });
  if (!record || record.wallet !== input.wallet) throw new AppError("BAD_NONCE", "Sign-in request not found", 401);
  if (record.usedAt) throw new AppError("NONCE_USED", "This sign-in request was already used", 401);
  if (record.expiresAt < new Date()) throw new AppError("NONCE_EXPIRED", "Sign-in request expired, try again", 401);

  let sig: Uint8Array;
  try {
    sig = /^[A-Za-z0-9+/=]+$/.test(input.signature) && input.signature.length === 88 && input.signature.endsWith("==")
      ? Uint8Array.from(Buffer.from(input.signature, "base64"))
      : Uint8Array.from(getBase58Encoder().encode(input.signature));
  } catch {
    throw new AppError("BAD_SIGNATURE", "Unreadable signature", 401);
  }
  if (sig.length !== 64) throw new AppError("BAD_SIGNATURE", "Unreadable signature", 401);
  const key = await getPublicKeyFromAddress(address(record.wallet));
  const ok = await verifySignature(key, signatureBytes(sig), getUtf8Encoder().encode(record.message));
  if (!ok) throw new AppError("BAD_SIGNATURE", "Signature does not match the wallet", 401);

  const used = await db.authNonce.updateMany({ where: { nonce: record.nonce, usedAt: null }, data: { usedAt: new Date() } });
  if (used.count === 0) throw new AppError("NONCE_USED", "This sign-in request was already used", 401);
  return db.user.upsert({ where: { wallet: record.wallet }, update: {}, create: { wallet: record.wallet } });
}

const secret = () => new TextEncoder().encode(config.sessionSecret);

export async function createSessionToken(user: Pick<User, "id" | "wallet">): Promise<string> {
  return new SignJWT({ wallet: user.wallet })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secret());
}

export async function readSessionToken(token: string | undefined | null): Promise<{ userId: string; wallet: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.wallet !== "string") return null;
    return { userId: payload.sub, wallet: payload.wallet };
  } catch {
    return null;
  }
}
