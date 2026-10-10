"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { Download, FlaskConical, GitBranchPlus, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { RequireSession } from "@/components/organizer/require-session";
import { useKeyDialog } from "@/components/model-key";
import { maskKey, useModelKey } from "@/lib/model-key";
import { api, ApiError } from "@/lib/api";
import { RULE_LABEL, credits, dateTime, shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Regression {
  id: string;
  mode: "ACTION_REPLAY" | "AGENT_RERUN";
  status: string;
  repeats: number;
  brain?: string;
  summary: string | null;
  target: { id: string; name: string };
  results: { blocked?: boolean; blockedAtSeq?: number; reruns?: Array<{ violated: boolean; atMessage: number | null; error?: string }> } | null;
  createdAt: string;
}

interface Card {
  id: string;
  status: string;
  summary: string;
  rule: string;
  ruleText: string;
  mission: string;
  paid: number | null;
  refunded: number | null;
  decisiveSeq: number | null;
  decisiveAction: string | null;
  playerMessages: number;
  toolCalls: number;
  winner: string | null;
  proofHash: string | null;
  verifiedAt: string | null;
  isOrganizer: boolean;
  addedToRegression: boolean;
  agent: { id: string; name: string; model: string; configHash: string };
  campaign: { id: string; title: string; kind: string };
  payout: { status: string; signature: string | null } | null;
  transcript: Array<{ seq: number; type: string; text: string }>;
  regressions: Regression[];
}

interface Version {
  id: string;
  name: string;
  label: string;
  model: string;
  guards: { refundCapToPaid: boolean; payerOnly: boolean; paidOrdersOnly: boolean };
  configHash: string;
  parentId: string | null;
  isTraining: boolean;
}

const GUARDS = [
  ["refundCapToPaid", "Refund total capped at amount paid"],
  ["payerOnly", "Refund only to the payer"],
  ["paidOrdersOnly", "Refund only paid orders"],
] as const;

const PAYOUT_LABEL: Record<string, string> = {
  PENDING: "Queued for payout",
  SENDING: "Sending",
  SENT: "Sent, waiting for confirmation",
  CONFIRMED: "Paid, confirmed on Solana",
  FAILED: "Payout failed",
};

function FindingCard({ id }: { id: string }) {
  const apiKey = useModelKey();
  const keyDialog = useKeyDialog();
  const [card, setCard] = useState<Card | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [mode, setMode] = useState<"ACTION_REPLAY" | "AGENT_RERUN">("ACTION_REPLAY");
  const [repeats, setRepeats] = useState(3);
  const [running, setRunning] = useState(false);
  const [fix, setFix] = useState<Version["guards"] | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, v] = await Promise.all([api<Card>(`/api/findings/${id}`), api<Version[]>("/api/agent-versions")]);
      setCard(c);
      setVersions(v);
      setTarget((t) => t || v.find((x) => x.id !== c.agent.id && x.parentId === c.agent.id)?.id || v.find((x) => x.label === "Guarded tools")?.id || "");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load the finding");
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  // Poll while a regression is running.
  const pending = card?.regressions.some((r) => r.status === "QUEUED" || r.status === "RUNNING");
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, [pending, load]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 py-16">
        <h1 className="font-condensed text-3xl font-extrabold">Finding unavailable</h1>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }
  if (!card) return <Skeleton className="mx-auto mt-10 h-96 max-w-5xl rounded-lg" />;

  const run = async () => {
    if (!target) return;
    setRunning(true);
    try {
      await api(`/api/findings/${id}/regressions`, {
        method: "POST",
        json: { targetAgentVersionId: target, mode, repeats, ...(mode === "AGENT_RERUN" && apiKey ? { apiKey } : {}) },
      });
      toast.success("Regression check queued");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't start the check");
    } finally {
      setRunning(false);
    }
  };

  const createFixed = async () => {
    if (!fix) return;
    setCreating(true);
    try {
      const v = await api<{ id: string; name: string }>("/api/agent-versions", {
        method: "POST",
        json: { baseVersionId: card.agent.id, guards: fix, name: `${card.agent.name} (fixed)` },
      });
      toast.success(`Created ${v.name}`);
      setFix(null);
      await load();
      setTarget(v.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't create the version");
    } finally {
      setCreating(false);
    }
  };

  const rows: Array<[string, React.ReactNode]> = [
    ["Rule", <span key="rule"><span className="font-semibold">{RULE_LABEL[card.rule]}:</span> {card.ruleText}</span>],
    ["Paid", <span key="p" className="font-mono">{credits(card.paid)}</span>],
    ["Refunded", <span key="r" className="font-mono text-destructive">{credits(card.refunded)}</span>],
    ["Decisive action", card.decisiveAction ? `${card.decisiveAction} (step ${card.decisiveSeq})` : "—"],
    ["Agent version", `${card.agent.name} on ${card.agent.model}, config ${card.agent.configHash.slice(0, 10)}`],
    ["Player turns", card.playerMessages],
    ["Status", card.status === "CONFIRMED" ? "Confirmed by replay" : card.status],
    ["Bounty", card.payout ? (PAYOUT_LABEL[card.payout.status] ?? card.payout.status) : card.campaign.kind === "PRIZE" ? "Not paid (slot taken or window closed)" : "Practice"],
    ["Winner", card.winner ? shortAddress(card.winner) : "—"],
    ["Verified", dateTime(card.verifiedAt)],
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-12 md:px-6">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link href={`/organizer/campaigns/${card.campaign.id}`} className="text-xs text-muted-foreground hover:text-foreground">
            {card.campaign.title}
          </Link>
          <h1 className="mt-2 font-condensed text-4xl leading-[1.05] font-extrabold tracking-tight text-balance">{card.summary}</h1>
        </div>
        <Button variant="outline" className="h-10" render={<a href={`/api/findings/${id}/export`} download />} nativeButton={false}>
          <Download aria-hidden /> Export scenario
        </Button>
        <Button variant="outline" className="h-10" render={<Link href={`/proof/${id}`} />} nativeButton={false}>
          <ShieldCheck aria-hidden /> Proof
        </Button>
      </header>

      <section aria-labelledby="card" className="rounded-lg bg-paper p-6 shadow-[0_1px_2px_rgb(25_27_42/0.06)]">
        <h2 id="card" className="text-lg font-bold">Finding card</h2>
        <table className="mt-3 w-full text-sm">
          <tbody className="divide-y divide-ink/10">
            {rows.map(([k, v]) => (
              <tr key={k}>
                <th scope="row" className="w-44 py-2 pr-4 text-left font-normal text-muted-foreground">
                  {k}
                </th>
                <td className="py-2">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="regress" className="rounded-lg border-2 border-ink bg-paper p-6">
        <h2 id="regress" className="flex items-center gap-2 text-lg font-bold">
          <FlaskConical className="size-5" aria-hidden /> Add to the next version's checks
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Replay this finding against another agent version. Action replay re-executes the recorded tool calls; a rerun sends the same player messages
          to the new agent and reports what actually happened.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="target">Version to check</Label>
            <select
              id="target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="h-10 w-full rounded-lg border border-ink/25 bg-paper px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <option value="">Choose a version…</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}, {v.label} ({v.model})
                  {v.id === card.agent.id ? " (current)" : ""}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="flex gap-2">
            <legend className="sr-only">Check type</legend>
            {(
              [
                ["ACTION_REPLAY", "Action replay"],
                ["AGENT_RERUN", "Rerun vs AI"],
              ] as const
            ).map(([m, label]) => (
              <label key={m} className={cn("flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50", mode === m ? "border-ink ring-1 ring-ink" : "border-ink/20 hover:border-ink/50")}>
                <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} className="accent-[var(--primary)]" />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="flex items-end gap-2">
            {mode === "AGENT_RERUN" && (
              <div className="space-y-2">
                <Label htmlFor="repeats">Runs</Label>
                <input
                  id="repeats"
                  type="number"
                  min={1}
                  max={5}
                  value={repeats}
                  onChange={(e) => setRepeats(Number(e.target.value))}
                  className="h-10 w-16 rounded-lg border border-ink/25 bg-paper px-2 font-mono text-sm"
                />
              </div>
            )}
            <Button className="h-10" onClick={() => void run()} disabled={!target || running}>
              {running ? "Queuing…" : "Run check"}
            </Button>
          </div>
        </div>
        {mode === "AGENT_RERUN" && (
          <p className="mt-3 text-xs text-muted-foreground">
            {apiKey ? (
              <>
                Reruns call Claude with your key <span className="font-mono">{maskKey(apiKey)}</span>, capped at $2 per check.
              </>
            ) : (
              <>
                Without your Claude key, reruns use offline Milo, so they show the flow rather than the real model.{" "}
                <button type="button" onClick={keyDialog.open} className="font-semibold text-foreground underline underline-offset-2 hover:no-underline">
                  Add your key
                </button>
              </>
            )}
          </p>
        )}

        <div className="mt-4">
          {fix ? (
            <div className="space-y-3 rounded-md bg-background p-4">
              <p className="text-sm font-medium">New version of {card.agent.name}: enforce rules inside the refund tool</p>
              {GUARDS.map(([g, label]) => (
                <div key={g} className="flex items-center justify-between gap-3">
                  <Label htmlFor={`fix-${g}`} className="text-sm font-normal">
                    {label}
                  </Label>
                  <Switch id={`fix-${g}`} checked={fix[g]} onCheckedChange={(v) => setFix({ ...fix, [g]: Boolean(v) })} />
                </div>
              ))}
              <div className="flex gap-2">
                <Button className="h-10" onClick={() => void createFixed()} disabled={creating}>
                  {creating ? "Creating…" : "Create version"}
                </Button>
                <Button variant="ghost" className="h-10" onClick={() => setFix(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="h-10"
              onClick={() =>
                setFix({ ...(versions.find((v) => v.id === card.agent.id)?.guards ?? { refundCapToPaid: false, payerOnly: false, paidOrdersOnly: false }), ...(card.rule === "DOUBLE_DIP" ? { refundCapToPaid: true } : card.rule === "WRONG_POCKET" ? { payerOnly: true } : { paidOrdersOnly: true }) })
              }
            >
              <GitBranchPlus aria-hidden /> Create a fixed version
            </Button>
          )}
        </div>

        {card.regressions.length > 0 && (
          <ul className="mt-5 space-y-3">
            {card.regressions.map((r) => {
              const good = r.mode === "ACTION_REPLAY" ? r.results?.blocked : r.results?.reruns?.every((x) => !x.violated && !x.error);
              return (
                <li key={r.id} className={cn("rounded-md border-2 p-4", r.status !== "DONE" ? "border-ink/15" : good ? "border-success/60" : "border-destructive/60")}>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="outline">{r.mode === "ACTION_REPLAY" ? "Action replay" : `Rerun ×${r.repeats}`}</Badge>
                    <span className="font-medium">{r.target.name}</span>
                    {r.mode === "AGENT_RERUN" && r.brain === "OFFLINE" && (
                      <span className="rounded-sm border border-dashed border-ink/40 px-1.5 text-[11px] font-semibold">offline Milo</span>
                    )}
                    <span className="text-xs text-muted-foreground">{dateTime(r.createdAt)}</span>
                    {r.status !== "DONE" && <Loader2 className="size-4 animate-spin" aria-label="Running" />}
                  </div>
                  <p className="mt-2 text-sm">{r.summary ?? "Running…"}</p>
                  {r.results?.reruns && (
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {r.results.reruns.map((x, i) => `#${i + 1}: ${x.error ? "error" : x.violated ? `broken at msg ${x.atMessage}` : "held"}`).join(", ")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="transcript" className="rounded-lg bg-paper p-6 shadow-[0_1px_2px_rgb(25_27_42/0.06)]">
        <h2 id="transcript" className="text-lg font-bold">How it happened</h2>
        <ol className="mt-4 flex flex-col gap-2 text-sm">
          {card.transcript.map((t) => (
            <li
              key={t.seq}
              className={cn(
                "rounded-lg px-3 py-2",
                t.type === "player_message" && "ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-ink px-4 text-white",
                t.type === "agent_message" && "mr-auto w-fit max-w-[80%] rounded-2xl rounded-bl-sm bg-muted px-4",
                t.type === "operation" && "font-mono text-xs text-muted-foreground",
                t.type === "rule_broken" && "mx-auto w-fit rounded-sm bg-destructive font-semibold text-white",
              )}
            >
              <span className="sr-only">{t.type.replace("_", " ")}: </span>
              {t.text}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export default function FindingPage({ params }: PageProps<"/organizer/findings/[id]">) {
  const { id } = use(params);
  return (
    <RequireSession what="see this finding">
      <FindingCard id={id} />
    </RequireSession>
  );
}
