import { address } from "@solana/kit";
import { bytesToHex } from "@botheist/solana";
import {
  createSigningClient,
  fetchClaim,
  getSignatureState,
  loadKeypairFile,
  sendAward,
  type SigningClient,
} from "@botheist/solana/server";
import type { KeyPairSigner } from "@solana/kit";
import { config } from "./config";
import type { PayoutChain } from "./payouts";

/** Real payout chain: devnet RPC + the verifier keypair held only by the payout worker. */
export class SolanaPayoutChain implements PayoutChain {
  private client: SigningClient | null = null;
  private verifier: KeyPairSigner | null = null;

  private async ready() {
    if (!this.client || !this.verifier) {
      this.verifier = await loadKeypairFile(config.verifierKeypairPath);
      this.client = createSigningClient(this.verifier, { rpcUrl: config.rpcUrl, wsUrl: config.wsUrl, txVersion: config.txVersion });
    }
    return { client: this.client, verifier: this.verifier };
  }

  async send(req: Parameters<PayoutChain["send"]>[0]) {
    const { client, verifier } = await this.ready();
    const res = await sendAward(client, verifier, {
      campaign: address(req.campaignAddress),
      ruleIndex: req.ruleIndex,
      runUuid: req.runId,
      proofHashHex: req.proofHashHex,
      winner: address(req.winner),
    });
    if (res.status === "sent") return { status: "sent" as const, signature: res.signature as string };
    return { status: res.status };
  }

  async signatureState(signature: string) {
    const { client } = await this.ready();
    return getSignatureState(client, signature);
  }

  async claimHolder(campaignAddress: string, ruleIndex: number) {
    const { client } = await this.ready();
    const claim = await fetchClaim(client, address(campaignAddress), ruleIndex);
    return claim ? { runIdHex: bytesToHex(claim.runId) } : null;
  }
}

export async function verifierAddress(): Promise<string> {
  if (config.verifierPubkey) return config.verifierPubkey;
  return (await loadKeypairFile(config.verifierKeypairPath)).address;
}
