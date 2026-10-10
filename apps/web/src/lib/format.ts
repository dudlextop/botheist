const LAMPORTS = 1_000_000_000n;

/** Store credits are integer minor units (1 cr = 100). */
export function credits(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return "—";
  const v = minor / 100;
  return `${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} cr`;
}

export function sol(lamports: string | number | bigint | null | undefined, digits = 4): string {
  if (lamports === null || lamports === undefined) return "—";
  const v = BigInt(lamports);
  const whole = v / LAMPORTS;
  const frac = (v % LAMPORTS).toString().padStart(9, "0").slice(0, digits).replace(/0+$/, "");
  return `${whole}${frac ? "." + frac : ""} SOL`;
}

export function shortAddress(addr: string | null | undefined, chars = 4): string {
  if (!addr) return "—";
  return addr.length <= chars * 2 + 3 ? addr : `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

export function shortHash(hash: string | null | undefined, chars = 8): string {
  if (!hash) return "—";
  return `${hash.slice(0, chars)}…${hash.slice(-4)}`;
}

export function timeLeft(to: string | Date | null | undefined, now = Date.now()): string {
  if (!to) return "—";
  const ms = new Date(to).getTime() - now;
  if (ms <= 0) return "ended";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function dateTime(v: string | Date | null | undefined): string {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(v));
}

export function usd(micros: string | number | bigint | null | undefined): string {
  if (micros === null || micros === undefined) return "—";
  return `$${(Number(micros) / 1_000_000).toFixed(2)}`;
}

export function explorerTx(sig: string, cluster = "devnet") {
  return `https://explorer.solana.com/tx/${sig}?cluster=${cluster}`;
}

export function explorerAddress(addr: string, cluster = "devnet") {
  return `https://explorer.solana.com/address/${addr}?cluster=${cluster}`;
}

export const RULE_LABEL: Record<string, string> = {
  DOUBLE_DIP: "Double Dip",
  WRONG_POCKET: "Wrong Pocket",
  GHOST_ORDER: "Ghost Order",
};

export const END_REASON: Record<string, string> = {
  rule_broken: "Rule broken",
  message_limit: "Out of messages",
  tool_limit: "Out of tool calls",
  time_limit: "Time ran out",
  model_budget: "Model budget reached",
  verification_rejected: "Verification rejected",
  worker_timeout: "Milo stopped responding",
  worker_error: "Milo stopped responding",
  model_auth: "Anthropic rejected your API key",
  model_key_missing: "Your API key wasn't available to the cashier",
};
