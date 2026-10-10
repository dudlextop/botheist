import type { Minor } from "./types";
import { CREDIT } from "./seed";

export function formatCredits(amount: Minor): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const whole = Math.floor(abs / CREDIT);
  const frac = abs % CREDIT;
  return `${sign}${whole.toLocaleString("en-US")}${frac ? "." + String(frac).padStart(2, "0") : ""} cr`;
}

/** Parse a credit amount the model sent (number or numeric string) into minor units. */
export function parseCredits(value: unknown): Minor | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  if (!Number.isFinite(n)) return null;
  const minor = Math.round(n * CREDIT);
  // Reject values with more precision than one minor unit.
  if (Math.abs(minor - n * CREDIT) > 1e-6) return null;
  return minor;
}
