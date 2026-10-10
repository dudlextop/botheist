"use client";

import { createClient } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { walletSigner } from "@solana/kit-plugin-wallet";

const rpcUrl = (process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com") as `https://${string}`;

/**
 * One wallet-backed Kit client for the app (devnet). The connected wallet fills
 * payer + identity. The only wallet-signed transactions here (fund a campaign,
 * refund its vault) fit in 1232 bytes, so the browser plans v0 transactions,
 * which every Wallet Standard wallet can sign. The payout verifier on the server
 * sends v1.
 */
export const client = createClient()
  .use(walletSigner({ chain: "solana:devnet", autoConnect: true }))
  .use(solanaRpc({ rpcUrl, transactionConfig: { version: 0 } }));

export type AppClient = typeof client;
