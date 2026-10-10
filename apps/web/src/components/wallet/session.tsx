"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { getBase58Decoder, getUtf8Encoder } from "@solana/kit";
import { api, ApiError } from "@/lib/api";
import { client } from "./solana-client";

interface Me {
  signedIn: boolean;
  wallet: string | null;
  user: { id: string; wallet: string | null; points: number; role: string } | null;
}

interface SessionValue {
  me: Me | null;
  loading: boolean;
  signingIn: boolean;
  /** Signed in AND the connected wallet is the signed-in wallet. */
  ready: boolean;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  error: string | null;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const connected = useConnectedWallet(client);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>("/api/me"));
    } catch {
      setMe({ signedIn: false, wallet: null, user: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async () => {
    const wallet = connected?.account.address;
    if (!wallet) return false;
    setSigningIn(true);
    setError(null);
    try {
      const { nonce, message } = await api<{ nonce: string; message: string }>("/api/auth/nonce", { method: "POST", json: { wallet } });
      const signature = await client.wallet.signMessage(getUtf8Encoder().encode(message));
      await api("/api/auth/verify", { method: "POST", json: { wallet, nonce, signature: getBase58Decoder().decode(signature) } });
      await refresh();
      return true;
    } catch (err) {
      // A user closing the wallet prompt is not an error worth shouting about.
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
      if (!/reject|cancel|declin/i.test(msg)) setError(msg);
      return false;
    } finally {
      setSigningIn(false);
    }
  }, [connected, refresh]);

  const signOut = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    await refresh();
  }, [refresh]);

  const ready = Boolean(me?.signedIn && connected && me.wallet === connected.account.address);
  const value = useMemo(
    () => ({ me, loading, signingIn, ready, signIn, signOut, refresh, error }),
    [me, loading, signingIn, ready, signIn, signOut, refresh, error],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
