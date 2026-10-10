"use client";

import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { PenLine, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/components/wallet/session";
import { client } from "@/components/wallet/solana-client";

/** Organizer pages need a connected, signed-in wallet. */
export function RequireSession({ children, what }: { children: React.ReactNode; what: string }) {
  const { me, loading, signIn, signingIn, error } = useSession();
  const connected = useConnectedWallet(client);
  if (loading) return <Skeleton className="mx-auto mt-10 h-48 max-w-3xl rounded-lg" />;
  // Viewing needs a session; signing transactions additionally needs that wallet connected.
  if (me?.signedIn) {
    const mismatch = connected && connected.account.address !== me.wallet;
    return (
      <>
        {(!connected || mismatch) && (
          <p role="status" className="mx-auto mt-4 max-w-5xl rounded-md border-l-4 border-ink bg-paper px-4 py-2.5 text-sm">
            {mismatch ? "Your wallet is on a different account than the one you signed in with. Switch accounts to sign transactions." : "Connect your wallet to fund or withdraw. You can still browse your campaigns."}
          </p>
        )}
        {children}
      </>
    );
  }
  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-20">
      <h1 className="font-condensed text-3xl font-extrabold">Sign in to {what}</h1>
      <p className="text-sm text-muted-foreground">
        Organizers sign in with a Solana wallet. The same wallet funds campaign vaults on devnet and is the only one that can withdraw what's left
        after the deadline.
      </p>
      {connected ? (
        <Button className="h-10" onClick={() => void signIn()} disabled={signingIn}>
          <PenLine aria-hidden /> {signingIn ? "Check your wallet…" : "Sign in with your wallet"}
        </Button>
      ) : (
        <p className="flex items-center gap-2 text-sm">
          <Wallet className="size-4" aria-hidden /> Connect a wallet using the button in the top right.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
