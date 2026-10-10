import {
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
  getUtf8Encoder,
  type Address,
} from "@solana/kit";
import { BOTHEIST_PROGRAM_ADDRESS } from "./generated/programs/index";

export * from "./generated/index";

export const PROGRAM_ID: Address = BOTHEIST_PROGRAM_ADDRESS;
export const LAMPORTS_PER_SOL = 1_000_000_000n;

export type Cluster = "devnet" | "localnet" | "mainnet-beta";

const utf8 = getUtf8Encoder();
const addr = getAddressEncoder();

/** UUID (with or without dashes) → 16 raw bytes, used as campaign/run ids on-chain. */
export function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error(`Not a UUID: ${uuid}`);
  return Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16)));
}

export function bytesToHex(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string, length?: number): Uint8Array {
  if (!/^([0-9a-f]{2})*$/i.test(hex)) throw new Error("Invalid hex");
  const out = Uint8Array.from(hex.match(/../g)?.map((b) => parseInt(b, 16)) ?? []);
  if (length !== undefined && out.length !== length) throw new Error(`Expected ${length} bytes, got ${out.length}`);
  return out;
}

export async function findCampaignAddress(organizer: Address, campaignUuid: string, programAddress: Address = PROGRAM_ID) {
  const [pda] = await getProgramDerivedAddress({
    programAddress,
    seeds: [utf8.encode("campaign"), addr.encode(organizer), uuidToBytes(campaignUuid)],
  });
  return pda;
}

export async function findVaultAddress(campaign: Address, programAddress: Address = PROGRAM_ID) {
  const [pda] = await getProgramDerivedAddress({ programAddress, seeds: [utf8.encode("vault"), addr.encode(campaign)] });
  return pda;
}

export async function findClaimAddress(campaign: Address, ruleIndex: number, programAddress: Address = PROGRAM_ID) {
  const [pda] = await getProgramDerivedAddress({
    programAddress,
    seeds: [utf8.encode("claim"), addr.encode(campaign), Uint8Array.of(ruleIndex)],
  });
  return pda;
}

export function explorerTxUrl(signature: string, cluster: Cluster = "devnet") {
  return `https://explorer.solana.com/tx/${signature}${clusterQuery(cluster)}`;
}

export function explorerAddressUrl(account: string, cluster: Cluster = "devnet") {
  return `https://explorer.solana.com/address/${account}${clusterQuery(cluster)}`;
}

function clusterQuery(cluster: Cluster) {
  if (cluster === "mainnet-beta") return "";
  if (cluster === "localnet") return "?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899";
  return `?cluster=${cluster}`;
}

export function formatSol(lamports: bigint | number, digits = 4): string {
  const value = typeof lamports === "bigint" ? lamports : BigInt(Math.round(lamports));
  const whole = value / LAMPORTS_PER_SOL;
  const frac = (value % LAMPORTS_PER_SOL).toString().padStart(9, "0").slice(0, digits).replace(/0+$/, "");
  return `${whole}${frac ? "." + frac : ""} SOL`;
}

export function isAddress(value: string): value is Address {
  try {
    address(value);
    return true;
  } catch {
    return false;
  }
}
