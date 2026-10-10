import { readFileSync } from "node:fs";
import {
  address,
  createClient,
  createKeyPairSignerFromBytes,
  fetchEncodedAccount,
  type Address,
  type GetAccountInfoApi,
  type Instruction,
  type KeyPairSigner,
  type Rpc,
  type Signature,
  type TransactionSigner,
} from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { signer } from "@solana/kit-plugin-signer";
import {
  decodeCampaign,
  decodeClaim,
  getAwardInstructionAsync,
  getCreateAndFundCampaignInstructionAsync,
  getRefundInstructionAsync,
  type Campaign,
  type Claim,
} from "./generated/index";
import { bytesToHex, findCampaignAddress, findClaimAddress, findVaultAddress, hexToBytes, uuidToBytes } from "./index";

export interface SolanaConfig {
  rpcUrl: string;
  wsUrl?: string;
  /** Transaction version. v1 is the default for new code; 0 for clusters/wallets without v1. */
  txVersion?: 0 | 1;
}

export function solanaConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SolanaConfig {
  return {
    rpcUrl: env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
    wsUrl: env.SOLANA_WS_URL || undefined,
    txVersion: env.SOLANA_TX_VERSION === "0" ? 0 : 1,
  };
}

export async function loadKeypairFile(path: string): Promise<KeyPairSigner> {
  const bytes = Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]);
  return createKeyPairSignerFromBytes(bytes);
}

export function createSigningClient(keypair: KeyPairSigner, cfg: SolanaConfig) {
  return createClient()
    .use(signer(keypair))
    .use(
      solanaRpc({
        rpcUrl: cfg.rpcUrl as `https://${string}`,
        ...(cfg.wsUrl ? { rpcSubscriptionsUrl: cfg.wsUrl as `wss://${string}` } : {}),
        transactionConfig: { version: cfg.txVersion ?? 1 },
      }),
    );
}

export type SigningClient = ReturnType<typeof createSigningClient>;

/** The subset of a Kit client these helpers need (satisfied by RPC and LiteSVM clients). */
export interface ChainClient {
  rpc: Rpc<GetAccountInfoApi>;
  sendTransaction(input: Instruction[]): Promise<{ context: { signature: Signature } }>;
}

export async function fetchClaim(client: Pick<ChainClient, "rpc">, campaign: Address, ruleIndex: number): Promise<Claim | null> {
  const claimAddress = await findClaimAddress(campaign, ruleIndex);
  const account = await fetchEncodedAccount(client.rpc, claimAddress, { commitment: "confirmed" });
  if (!account.exists) return null;
  return decodeClaim(account).data;
}

export async function fetchCampaign(client: Pick<ChainClient, "rpc">, campaign: Address): Promise<Campaign | null> {
  const account = await fetchEncodedAccount(client.rpc, campaign, { commitment: "confirmed" });
  if (!account.exists) return null;
  return decodeCampaign(account).data;
}

export interface AwardRequest {
  campaign: Address;
  ruleIndex: number;
  runUuid: string;
  proofHashHex: string;
  winner: Address;
}

export type AwardResult =
  | { status: "sent"; signature: Signature }
  | { status: "already_paid_to_this_run"; claim: Claim }
  | { status: "claimed_by_other_run"; claim: Claim };

/**
 * Pay one verified finding. Before sending, the on-chain Claim is checked so a
 * retry after a lost response never sends a second payment; the program itself
 * also refuses a second Claim for the same (campaign, rule).
 */
export async function sendAward(client: ChainClient, verifier: TransactionSigner, req: AwardRequest): Promise<AwardResult> {
  const existing = await fetchClaim(client, req.campaign, req.ruleIndex);
  if (existing) {
    const sameRun = bytesToHex(existing.runId) === bytesToHex(uuidToBytes(req.runUuid));
    return sameRun ? { status: "already_paid_to_this_run", claim: existing } : { status: "claimed_by_other_run", claim: existing };
  }
  const ix = await getAwardInstructionAsync({
    verifier,
    campaign: req.campaign,
    claim: await findClaimAddress(req.campaign, req.ruleIndex),
    winner: req.winner,
    ruleId: req.ruleIndex,
    runId: uuidToBytes(req.runUuid),
    proofHash: hexToBytes(req.proofHashHex, 32),
  });
  const result = await client.sendTransaction([ix]);
  return { status: "sent", signature: result.context.signature };
}

export type SignatureState = "unknown" | "processed" | "confirmed" | "finalized" | "failed";

export async function getSignatureState(client: SigningClient, signature: string): Promise<SignatureState> {
  const { value } = await client.rpc.getSignatureStatuses([signature as Signature], { searchTransactionHistory: true }).send();
  const s = value[0];
  if (!s) return "unknown";
  if (s.err) return "failed";
  return (s.confirmationStatus as SignatureState | null) ?? "processed";
}

export interface CreateCampaignRequest {
  campaignUuid: string;
  verifier: Address;
  configHashHex: string;
  rewards: Array<{ ruleIndex: number; lamports: bigint }>;
  submissionsCloseAt: Date;
  payoutDeadlineAt: Date;
}

/** Build the organizer's create-and-fund instruction (signed by a wallet or a local keypair). */
export async function buildCreateCampaignInstruction(organizer: TransactionSigner, req: CreateCampaignRequest) {
  const campaign = await findCampaignAddress(organizer.address, req.campaignUuid);
  const vault = await findVaultAddress(campaign);
  const ix = await getCreateAndFundCampaignInstructionAsync({
    organizer,
    campaign,
    vault,
    campaignId: uuidToBytes(req.campaignUuid),
    verifier: req.verifier,
    configHash: hexToBytes(req.configHashHex, 32),
    rewards: req.rewards.map((r) => ({ ruleId: r.ruleIndex, amount: r.lamports })),
    submissionsCloseAt: BigInt(Math.floor(req.submissionsCloseAt.getTime() / 1000)),
    payoutDeadlineAt: BigInt(Math.floor(req.payoutDeadlineAt.getTime() / 1000)),
  });
  return { ix, campaign, vault };
}

export async function sendCreateCampaign(client: ChainClient, organizer: TransactionSigner, req: CreateCampaignRequest) {
  const { ix, campaign, vault } = await buildCreateCampaignInstruction(organizer, req);
  const result = await client.sendTransaction([ix]);
  return { signature: result.context.signature, campaign, vault };
}

export async function sendRefund(client: ChainClient, organizer: TransactionSigner, campaign: Address) {
  const ix = await getRefundInstructionAsync({ organizer, campaign });
  const result = await client.sendTransaction([ix]);
  return { signature: result.context.signature };
}

export { address };
