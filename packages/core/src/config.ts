import { resolve } from "node:path";
import type { Cluster } from "@botheist/solana";

export interface CoreConfig {
  cluster: Cluster;
  rpcUrl: string;
  wsUrl?: string;
  txVersion: 0 | 1;
  /** Keypair file of the payout verifier. Only the payout worker reads it. */
  verifierKeypairPath: string;
  verifierPubkey: string | null;
  sessionSecret: string;
  /** Secret that seals players' own API keys at rest (defaults to the session secret). */
  keySealSecret: string;
  /** Claude runs on the server's own key when no player key is given. Otherwise Milo is the offline stand-in. */
  serverModelKey: boolean;
  /** Payouts are skipped (recorded as pending) when false, e.g. in tests. */
  payoutsEnabled: boolean;
  repoRoot: string;
}

// import.meta.dirname is unavailable inside bundlers (Next.js); fall back to BOTHEIST_ROOT or the cwd.
const repoRoot =
  process.env.BOTHEIST_ROOT ?? (typeof import.meta.dirname === "string" ? resolve(import.meta.dirname, "../../..") : process.cwd());

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CoreConfig {
  const cluster = (env.SOLANA_CLUSTER as Cluster | undefined) ?? "devnet";
  return {
    cluster,
    rpcUrl: env.SOLANA_RPC_URL ?? (cluster === "localnet" ? "http://127.0.0.1:8899" : "https://api.devnet.solana.com"),
    wsUrl: env.SOLANA_WS_URL || undefined,
    txVersion: env.SOLANA_TX_VERSION === "0" ? 0 : 1,
    verifierKeypairPath: env.VERIFIER_KEYPAIR_PATH ?? resolve(repoRoot, ".keys/verifier.json"),
    verifierPubkey: env.VERIFIER_PUBKEY ?? null,
    sessionSecret: env.SESSION_SECRET ?? "dev-only-secret-change-me-dev-only-secret",
    keySealSecret: env.KEY_SEAL_SECRET ?? env.SESSION_SECRET ?? "dev-only-secret-change-me-dev-only-secret",
    serverModelKey: Boolean(env.ANTHROPIC_API_KEY) && env.BOTHEIST_MOCK_MODELS !== "true",
    payoutsEnabled: env.PAYOUTS_ENABLED !== "false",
    repoRoot,
  };
}

export const config = loadConfig();
