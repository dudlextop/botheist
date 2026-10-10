"use client";

import { useEffect, useState } from "react";
import { useConnect, useConnectedWallet, useDisconnect, useWallets, WalletReadyGate } from "@solana/kit-plugin-wallet/react";
import { Check, Copy, ExternalLink, LogOut, PenLine, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { explorerAddress, shortAddress } from "@/lib/format";
import { client } from "./solana-client";
import { useSession } from "./session";

function Picker() {
  const wallets = useWallets(client);
  const { dispatch: connect, isRunning } = useConnect(client);
  if (wallets.length === 0) {
    return (
      <Button
        className="h-10 px-3 sm:px-4"
        render={<a href="https://phantom.com/download" target="_blank" rel="noreferrer" />}
        nativeButton={false}
      >
        <Wallet aria-hidden /> <span className="sm:hidden">Get a wallet</span>
        <span className="hidden sm:inline">Install a Solana wallet</span>
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button className="h-10 px-4" disabled={isRunning} />}>
        <Wallet aria-hidden /> {isRunning ? "Connecting…" : <><span className="sm:hidden">Connect</span><span className="hidden sm:inline">Connect wallet</span></>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Choose a wallet (devnet)</DropdownMenuLabel>
        {wallets.map((w) => (
          <DropdownMenuItem key={w.name} onClick={() => connect(w)} className="h-10 gap-3">
            {w.icon ? <img src={w.icon} alt="" className="size-5 rounded" /> : <Wallet className="size-5" aria-hidden />}
            {w.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Connected() {
  const connected = useConnectedWallet(client)!;
  const { dispatch: disconnect } = useDisconnect(client);
  const { ready, signIn, signingIn, signOut } = useSession();
  const [copied, setCopied] = useState(false);
  const address = connected.account.address;

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-2">
      {!ready && (
        <Button className="h-10 px-4" onClick={() => void signIn()} disabled={signingIn}>
          <PenLine aria-hidden /> {signingIn ? "Check your wallet…" : "Sign in"}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" className="h-10 gap-2 px-3 font-mono tabular-nums" />}>
          <span className={ready ? "size-2 rounded-full bg-success" : "size-2 rounded-full bg-warning"} aria-hidden />
          {shortAddress(address)}
          <span className="sr-only">{ready ? "signed in" : "connected, not signed in"}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="font-mono text-xs">{shortAddress(address, 8)}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => void copy()} className="h-10 gap-2">
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />} Copy address
          </DropdownMenuItem>
          <DropdownMenuItem
            className="h-10 gap-2"
            onClick={() => window.open(explorerAddress(address), "_blank", "noopener,noreferrer")}
          >
            <ExternalLink aria-hidden /> View on Solana Explorer
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {ready && (
            <DropdownMenuItem className="h-10 gap-2" onClick={() => void signOut()}>
              <LogOut aria-hidden /> Sign out
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="h-10 gap-2"
            onClick={() => {
              void signOut();
              disconnect();
            }}
          >
            <LogOut aria-hidden /> Disconnect wallet
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Inner() {
  const connected = useConnectedWallet(client);
  return connected ? <Connected /> : <Picker />;
}

export function WalletButton() {
  // Wallet discovery only exists in the browser; render after mount to keep hydration stable.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-10 w-36 animate-pulse rounded-lg bg-muted" aria-hidden />;
  return (
    <WalletReadyGate client={client} fallback={<div className="h-10 w-36 animate-pulse rounded-lg bg-muted" aria-hidden />}>
      <Inner />
    </WalletReadyGate>
  );
}
