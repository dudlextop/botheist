"use client";

import { ClientProvider } from "@solana/react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ModelKeyProvider } from "./model-key";
import { client } from "./wallet/solana-client";
import { SessionProvider } from "./wallet/session";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClientProvider client={client}>
      <SessionProvider>
        <TooltipProvider>
          <ModelKeyProvider>
            {children}
            <Toaster position="bottom-right" />
          </ModelKeyProvider>
        </TooltipProvider>
      </SessionProvider>
    </ClientProvider>
  );
}
