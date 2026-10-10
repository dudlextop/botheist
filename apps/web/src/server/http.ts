import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AppError, ensureTrainingCatalog, readSessionToken, type Actor } from "@botheist/core";
import { getDb, jsonSafe } from "@botheist/db";

export const SESSION_COOKIE = "bh_session";
export const GUEST_COOKIE = "bh_guest";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

declare global {
  // eslint-disable-next-line no-var
  var __botheistCatalog: Promise<void> | undefined;
}

export function db() {
  globalThis.__botheistCatalog ??= ensureTrainingCatalog(getDb()).catch((err) => {
    globalThis.__botheistCatalog = undefined;
    throw err;
  });
  return getDb();
}

export async function ready() {
  db();
  await globalThis.__botheistCatalog;
}

/** Current actor from cookies. Creates a guest key on first visit. */
export async function getActor(): Promise<Actor> {
  const jar = await cookies();
  const session = await readSessionToken(jar.get(SESSION_COOKIE)?.value);
  let guest = jar.get(GUEST_COOKIE)?.value;
  if (!guest || !UUID.test(guest)) {
    guest = crypto.randomUUID();
    jar.set(GUEST_COOKIE, guest, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30, secure: process.env.NODE_ENV === "production" });
  }
  return { userId: session?.userId ?? null, wallet: session?.wallet ?? null, guestKey: guest };
}

export async function requireUser(): Promise<Actor & { userId: string; wallet: string }> {
  const actor = await getActor();
  if (!actor.userId || !actor.wallet) throw new AppError("SIGN_IN_REQUIRED", "Connect your wallet and sign in first", 401);
  return actor as Actor & { userId: string; wallet: string };
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(jsonSafe(data), init);
}

/** Wrap a route handler: expected errors become JSON with their status code. */
export function handler<C>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      await ready();
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof AppError) {
        return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details ?? null } }, { status: err.status });
      }
      console.error(err);
      return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong on our side. Try again." } }, { status: 500 });
    }
  };
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new AppError("BAD_JSON", "Request body must be JSON");
  }
}

export function publicConfig() {
  return {
    cluster: process.env.SOLANA_CLUSTER ?? "devnet",
    rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
    verifier: process.env.VERIFIER_PUBKEY ?? null,
    /** Without a key from the player, Milo runs on the server's key (true) or offline (false). */
    serverModelKey: Boolean(process.env.ANTHROPIC_API_KEY) && process.env.BOTHEIST_MOCK_MODELS !== "true",
  };
}
