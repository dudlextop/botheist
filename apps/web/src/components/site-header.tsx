"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Logo } from "./brand/logo";
import { BrainChip } from "./model-key";
import { WalletButton } from "./wallet/wallet-button";

const NAV = [
  { href: "/play", label: "Play" },
  { href: "/organizer", label: "Run a bounty" },
  { href: "/profile", label: "Your heists" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 supports-[backdrop-filter]:bg-background/85 supports-[backdrop-filter]:backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:gap-6 md:px-6">
        <Link href="/" className="rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none" aria-label="BotHeist home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden h-full items-stretch gap-1 sm:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={cn(
                "relative flex items-center px-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset",
                isActive(n.href) && "text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-1 after:bg-tag",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <BrainChip className="hidden md:inline-flex" />
          <Tooltip>
            <TooltipTrigger
              render={<span tabIndex={0} />}
              className="hidden items-center gap-1.5 rounded-sm border border-ink/25 px-2 py-1 text-xs font-semibold md:inline-flex"
            >
              <span className="size-1.5 rounded-full bg-success" aria-hidden />
              Devnet
            </TooltipTrigger>
            <TooltipContent>Bounties are paid in devnet test SOL, which has no monetary value.</TooltipContent>
          </Tooltip>
          <WalletButton />
        </div>
      </div>
      <nav aria-label="Main mobile" className="flex border-t border-border sm:hidden">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={isActive(n.href) ? "page" : undefined}
            className={cn(
              "relative flex h-11 flex-1 items-center justify-center text-sm font-semibold text-muted-foreground",
              isActive(n.href) && "text-foreground after:absolute after:inset-x-4 after:bottom-0 after:h-1 after:bg-tag",
            )}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
