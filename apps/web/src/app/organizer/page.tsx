"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Price } from "@/components/receipt";
import { RequireSession } from "@/components/organizer/require-session";
import { api, ApiError } from "@/lib/api";
import { RULE_LABEL, credits, dateTime, sol, usd } from "@/lib/format";
import { CAMPAIGN_STATUS, type DashboardCampaign } from "@/lib/organizer";

function Dashboard() {
  const [data, setData] = useState<DashboardCampaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<{ campaigns: DashboardCampaign[] }>("/api/organizer")
      .then((d) => setData(d.campaigns))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load your campaigns"));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-12 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[clamp(2.75rem,6vw,4.5rem)]">Run a bounty</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Publish your cashier's rules, fund the vault, and turn every confirmed break into a scenario you can replay against your next version.
          </p>
        </div>
        <Button className="h-10" render={<Link href="/organizer/new" />} nativeButton={false}>
          <Plus aria-hidden /> New campaign
        </Button>
      </header>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border-2 border-destructive bg-paper p-4 text-sm">
          <p className="flex-1">{error}</p>
          <Button variant="outline" className="h-10" onClick={load}>
            Try again
          </Button>
        </div>
      )}

      {data === null && !error ? (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
      ) : data && data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink/30 p-8">
          <p className="font-medium">No campaigns yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Start from the Neon Mart template: choose a model, write your cashier's instructions, pick the rules to test and fund the bounties.
          </p>
          <Button className="mt-4 h-10" render={<Link href="/organizer/new" />} nativeButton={false}>
            Create your first campaign
          </Button>
        </div>
      ) : (
        <ul className="space-y-4">
          {data?.map((c) => {
            const st = CAMPAIGN_STATUS[c.status] ?? CAMPAIGN_STATUS.DRAFT!;
            const pool = c.missions.reduce((s, m) => s + BigInt(m.rewardLamports), 0n);
            return (
              <li key={c.id} className="rounded-lg bg-paper p-5 shadow-[0_1px_2px_rgb(25_27_42/0.06)] md:p-6">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/organizer/campaigns/${c.id}`} className="text-xl font-bold hover:underline hover:underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                        {c.title}
                      </Link>
                      <Badge className={st.className}>{st.label}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.agent.name} on {c.agent.model}, {c.runs} attempts, model spend {usd(c.spentMicros)} of {usd(c.totalBudgetMicros)}
                      {c.submissionsCloseAt && `, closes ${dateTime(c.submissionsCloseAt)}`}
                    </p>
                  </div>
                  <Price lamports={pool} className="text-2xl" />
                  {c.explorerUrl && (
                    <a href={c.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1 text-xs font-semibold underline underline-offset-4 hover:no-underline">
                      Vault <ExternalLink className="size-3" aria-hidden />
                    </a>
                  )}
                  <Button variant="outline" className="h-10" render={<Link href={`/organizer/campaigns/${c.id}`} />} nativeButton={false}>
                    {c.status === "DRAFT" || c.status === "AWAITING_FUNDING" ? "Fund & publish" : "Open"}
                  </Button>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {c.missions.map((m) => (
                    <div key={m.id} className="rounded-md border border-ink/15 p-3 text-sm">
                      <p className="font-medium">{m.title}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {sol(m.rewardLamports)}, {m.claimed ? <span className="font-semibold text-destructive">broken</span> : <span>holding</span>}
                      </p>
                    </div>
                  ))}
                </div>
                {c.findings.length > 0 && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <caption className="sr-only">Findings for {c.title}</caption>
                      <thead className="text-xs text-muted-foreground">
                        <tr>
                          <th className="py-2 pr-3 font-normal">Rule</th>
                          <th className="py-2 pr-3 text-right font-normal">Paid</th>
                          <th className="py-2 pr-3 text-right font-normal">Refunded</th>
                          <th className="py-2 pr-3 font-normal">Turns</th>
                          <th className="py-2 pr-3 font-normal">Status</th>
                          <th className="py-2 font-normal">
                            <span className="sr-only">Open</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink/10">
                        {c.findings.map((f) => (
                          <tr key={f.id}>
                            <td className="py-2 pr-3">{RULE_LABEL[f.rule]}</td>
                            <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums">{credits(f.paid)}</td>
                            <td className="py-2 pr-3 text-right font-mono text-xs font-semibold text-destructive tabular-nums">{credits(f.refunded)}</td>
                            <td className="py-2 pr-3 font-mono text-xs tabular-nums">{f.playerMessages}</td>
                            <td className="py-2 pr-3">
                              <Badge variant="outline">{f.status === "CONFIRMED" ? f.payoutStatus ?? "Confirmed" : f.status}</Badge>
                            </td>
                            <td className="py-2 text-right">
                              <Link href={`/organizer/findings/${f.id}`} className="text-xs font-semibold underline underline-offset-4 hover:no-underline">
                                Finding card
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function OrganizerPage() {
  return (
    <RequireSession what="manage campaigns">
      <Dashboard />
    </RequireSession>
  );
}
