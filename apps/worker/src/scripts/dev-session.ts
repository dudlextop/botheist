/**
 * Dev helper: sign in to a running BotHeist server with a local test keypair
 * (Sign-In With Solana) and print the session cookie value.
 *
 *   pnpm --filter @botheist/worker dev-session -- .keys/organizer.json http://localhost:3000
 */
import { resolve } from "node:path";
import { getBase58Decoder, getUtf8Encoder, signBytes } from "@solana/kit";
import { loadKeypairFile } from "@botheist/solana/server";

const args = process.argv.slice(2).filter((a) => a !== "--");
const keyPath = resolve(import.meta.dirname, "../../../..", args[0] ?? ".keys/organizer.json");
const base = args[1] ?? "http://localhost:3000";

const signer = await loadKeypairFile(keyPath);
const nonceRes = await fetch(`${base}/api/auth/nonce`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ wallet: signer.address }),
});
if (!nonceRes.ok) throw new Error(`nonce failed: ${await nonceRes.text()}`);
const { nonce, message } = (await nonceRes.json()) as { nonce: string; message: string };
const signature = await signBytes(signer.keyPair.privateKey, getUtf8Encoder().encode(message));
const verify = await fetch(`${base}/api/auth/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ wallet: signer.address, nonce, signature: getBase58Decoder().decode(signature) }),
});
if (!verify.ok) throw new Error(`verify failed: ${await verify.text()}`);
const cookie = verify.headers.getSetCookie().find((c) => c.startsWith("bh_session="));
console.log(JSON.stringify({ wallet: signer.address, cookie: cookie?.split(";")[0] }));
