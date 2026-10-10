import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import { LogoMark } from "@/components/brand/logo";
import "./globals.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: { default: "BotHeist: outplay the AI, prove the bug, claim the bounty", template: "%s | BotHeist" },
  description:
    "Talk an AI cashier into breaking its own rules. A verifier replays what it actually did, the first confirmed break of each rule is paid from a bounty vault on Solana, and every exploit becomes a regression test.",
};

export const viewport: Viewport = { themeColor: "#ffd400" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Providers>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-border">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-8 text-sm text-muted-foreground md:px-6">
              <Link href="/" className="rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none" aria-label="BotHeist home">
                <LogoMark size={28} tone="mono" className="text-foreground" />
              </Link>
              <p className="max-w-2xl">
                Runs on Solana devnet. Rewards are test SOL with no monetary value. Neon Mart and Milo are fictional.
              </p>
              <nav aria-label="Footer" className="flex gap-4 md:ml-auto">
                <Link href="/play" className="hover:text-foreground">
                  Play
                </Link>
                <Link href="/organizer" className="hover:text-foreground">
                  Run a bounty
                </Link>
                <Link href="/profile" className="hover:text-foreground">
                  Your heists
                </Link>
              </nav>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
