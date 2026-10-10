"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Award, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Price } from "@/components/receipt";
import { useSession } from "@/components/wallet/session";
import { api } from "@/lib/api";
import { END_REASON, dateTime, shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Profile {
  signedIn: boolean;
  user: { wallet: string | null; points: number } | null;
  achievements: Array<{ code: string; title: string; description: string; earnedAt: string }>;
  allAchievements: Array<{ code: string; title: string; description: string }>;
  runs: Array<{
    id: string;
    status: string;
    endReason: string | null;
    startedAt: string;
    playerMessages: number;
    toolCalls: number;
    mission: { title: string };
    campaign: { title: string; kind: string };
    agent: { name: string; label: string };
    finding: { id: string; status: string } | null;
  }>;
}

const STATUS_STYLE: Record<string, string> = {
  WON: "bg-ink text-white",
  ACTIVE: "bg-tag text-tag-foreground",
  LOST: "border border-ink/25 text-muted-foreground",
  EXPIRED: "border border-ink/25 text-muted-foreground",
  MODEL_ERROR: "border border-warning/50 text-warning",
  ABORTED: "border border-warning/50 text-warning",
};

const STATUS_LABEL: Record<string, string> = {
  WON: "Won",
  ACTIVE: "In progress",
  LOST: "Held",
  EXPIRED: "Expired",
  MODEL_ERROR: "Doesn't count",
  ABORTED: "Stopped",
};

export default function ProfilePage() {
  const { ready } = useSession();
  const [p, setP] = useState<Profile | null>(null);
  useEffect(() => {
    api<Profile>("/api/me").then(setP).catch(() => setP(null));
  }, [ready]);

  const earned = new Set(p?.achievements.map((a) => a.code));
  const wins = p?.runs.filter((r) => r.finding?.status === "CONFIRMED").length ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-[clamp(2.75rem,6vw,4.5rem)]">Your heists</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {p?.signedIn ? `Signed in as ${shortAddress(p.user?.wallet)}` : "Playing as a guest. Sign in with a wallet to keep points and win bounties."}
          </p>
        </div>
        <dl className="flex gap-3">
          <div className="rounded-lg bg-tag px-5 py-3 text-tag-foreground">
            <dt className="text-xs font-semibold">Points</dt>
            <dd>
              <Price points={p?.user?.points ?? 0} className="text-3xl" />
            </dd>
          </div>
          <div className="rounded-lg bg-paper px-5 py-3">
            <dt className="text-xs font-semibold text-muted-foreground">Verified breaks</dt>
            <dd className="font-wide text-3xl font-extrabold tabular-nums">{wins}</dd>
          </div>
        </dl>
      </header>

      <section aria-labelledby="ach" className="mt-12">
        <h2 id="ach" className="font-condensed text-3xl font-extrabold tracking-tight">
          Achievements
        </h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(p?.allAchievements ?? []).map((a) => {
            const has = earned.has(a.code);
            return (
              <li
                key={a.code}
                className={cn("rounded-lg p-4", has ? "bg-paper shadow-[0_1px_2px_rgb(25_27_42/0.06)]" : "border border-dashed border-ink/25")}
              >
                <div className="flex items-center gap-2">
                  {has ? (
                    <span className="grid size-7 place-items-center rounded-full bg-tag ring-2 ring-ink" aria-hidden>
                      <Award className="size-4" />
                    </span>
                  ) : (
                    <span className="grid size-7 place-items-center rounded-full border border-dashed border-ink/40" aria-hidden>
                      <Lock className="size-3.5 text-muted-foreground" />
                    </span>
                  )}
                  <p className={cn("font-bold", !has && "text-muted-foreground")}>{a.title}</p>
                  <span className="sr-only">{has ? "earned" : "locked"}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{a.description}</p>
              </li>
            );
          })}
        </ul>
        {!p?.signedIn && <p className="mt-3 text-xs text-muted-foreground">Achievements are saved to your wallet account once you sign in.</p>}
      </section>

      <section aria-labelledby="history" className="mt-12">
        <h2 id="history" className="font-condensed text-3xl font-extrabold tracking-tight">
          History
        </h2>
        {p === null ? (
          <Skeleton className="mt-5 h-40 rounded-lg" />
        ) : p.runs.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-ink/30 p-6 text-sm">
            <p className="font-bold">No attempts yet</p>
            <p className="mt-1 text-muted-foreground">Pick a mission and talk Milo into his first mistake.</p>
            <Button className="mt-4 h-10" render={<Link href="/play" />} nativeButton={false}>
              Choose a mission
            </Button>
          </div>
        ) : (
          <ul className="mt-5 divide-y divide-ink/10 overflow-hidden rounded-lg bg-paper shadow-[0_1px_2px_rgb(25_27_42/0.06)]">
            {p.runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {r.mission.title}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      against {r.agent.name}, {r.campaign.kind === "PRIZE" ? r.campaign.title : r.agent.label}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {dateTime(r.startedAt)}, {r.playerMessages} messages, {r.toolCalls} actions
                    {r.endReason && `. ${END_REASON[r.endReason] ?? r.endReason}`}
                  </p>
                </div>
                <span className={cn("rounded-sm px-2 py-0.5 text-xs font-bold", STATUS_STYLE[r.status])}>
                  {r.status === "WON" && r.finding?.status === "CONFIRMED" ? "Verified" : STATUS_LABEL[r.status] ?? r.status}
                </span>
                {r.finding?.status === "CONFIRMED" ? (
                  <Button variant="outline" className="h-10" render={<Link href={`/proof/${r.finding.id}`} />} nativeButton={false}>
                    Proof
                  </Button>
                ) : (
                  <Button variant="ghost" className="h-10" render={<Link href={`/play/${r.id}`} />} nativeButton={false}>
                    {r.status === "ACTIVE" ? "Resume" : "Open"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
