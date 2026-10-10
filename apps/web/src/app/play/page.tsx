"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, KeyRound, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Milo, type MiloMood } from "@/components/milo";
import { Price } from "@/components/receipt";
import { useKeyDialog } from "@/components/model-key";
import { useSession } from "@/components/wallet/session";
import { api, ApiError } from "@/lib/api";
import { timeLeft } from "@/lib/format";
import { maskKey, saveModelKey, useModelKey } from "@/lib/model-key";
import type { Challenge, MissionState } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATE_LABEL: Record<MissionState, string> = {
  available: "Open",
  completed: "Beaten",
  claimed: "Bounty claimed",
  closed: "Closed",
};

const MOOD_BY_LEVEL: MiloMood[] = ["happy", "happy", "idle", "thinking", "thinking"];

function Difficulty({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold" aria-label={`Difficulty ${level} of 4`}>
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-3 w-1.5 rounded-[1px]", i <= level ? "bg-ink" : "bg-ink/15")} />
        ))}
      </span>
      <span aria-hidden>Level {level}</span>
    </span>
  );
}

type Mission = Challenge["missions"][number];

/** One mission as a ticket you tear off to start. */
function MissionTicket({ c, m, onStart, starting }: { c: Challenge; m: Mission; onStart: () => void; starting: string | null }) {
  const prize = c.kind === "PRIZE";
  const open = m.state === "available" || (!prize && m.state === "completed");
  const label = starting === m.id ? "Starting…" : open ? (m.state === "completed" ? "Replay" : "Start") : STATE_LABEL[m.state];
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={!open || starting !== null}
      aria-label={`${open ? "Start" : STATE_LABEL[m.state]} ${m.title}`}
      className={cn(
        "group relative flex min-h-36 flex-col overflow-hidden rounded-md border border-ink/20 bg-background p-4 text-left transition-[border-color] duration-150 ease-snap",
        "hover:border-ink focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-ink/20",
      )}
    >
      <span className="flex items-center gap-1.5 font-bold">
        {m.title}
        {m.state === "completed" && <Check className="size-4 text-success" aria-label="Beaten" />}
        {(m.state === "claimed" || m.state === "closed") && <Lock className="size-3.5 text-muted-foreground" aria-hidden />}
      </span>
      <span className="mt-1 text-sm leading-snug text-muted-foreground">{m.tagline}</span>
      {/* Tear-off stub: dashed line with a punched notch at each end. */}
      <span className="relative mt-auto flex items-end justify-between gap-2 border-t border-dashed border-ink/30 pt-3 before:absolute before:-top-[8px] before:-left-[25px] before:size-4 before:rounded-full before:border before:border-ink/20 before:bg-paper after:absolute after:-top-[8px] after:-right-[25px] after:size-4 after:rounded-full after:border after:border-ink/20 after:bg-paper">
        {prize ? <Price lamports={m.rewardLamports} className="text-2xl" /> : <Price points={m.points} className="text-xl" />}
        <span
          className={cn(
            "rounded-sm px-2.5 py-1 text-xs font-bold",
            open ? "bg-ink text-white group-hover:bg-ink/85" : "border border-ink/20 text-muted-foreground",
          )}
          aria-hidden
        >
          {label}
        </span>
      </span>
    </button>
  );
}

function BountyCampaign({ c, onStart, starting }: { c: Challenge; onStart: (c: Challenge, missionId: string) => void; starting: string | null }) {
  const pool = c.missions.reduce((s, m) => s + BigInt(m.rewardLamports), 0n);
  return (
    <article className="paper-shadow grid overflow-hidden rounded-lg bg-paper lg:grid-cols-[320px_1fr]">
      <div className="relative bg-tag p-6 text-tag-foreground">
        <p className="text-sm font-semibold">Bounty pool</p>
        <Price lamports={pool} className="mt-1 text-5xl" />
        <h3 className="mt-5 text-xl leading-snug font-bold">{c.title}</h3>
        {c.description && <p className="mt-1 text-sm">{c.description}</p>}
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-ink/70">Closes in</dt>
            <dd className="font-bold">{timeLeft(c.submissionsCloseAt)}</dd>
          </div>
          <div>
            <dt className="text-ink/70">Cashier</dt>
            <dd className="font-bold">{c.agent.modelLabel}</dd>
          </div>
        </dl>
        {c.explorerUrl && (
          <a
            href={c.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-4 hover:no-underline"
          >
            See the vault on Solana Explorer <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </div>
      <div className="p-6">
        <div className="flex items-center gap-3">
          <Milo size={48} mood="idle" label={c.agent.name} />
          <div>
            <p className="font-bold">{c.agent.name}</p>
            <Difficulty level={c.agent.difficulty} />
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {c.missions.map((m) => (
            <MissionTicket key={m.id} c={c} m={m} starting={starting} onStart={() => onStart(c, m.id)} />
          ))}
        </div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          The first confirmed break of each rule wins its bounty. Sign in with a wallet before you start: the reward goes to that wallet.{" "}
          {c.offlineAllowed
            ? "Demo bounty: offline Milo is allowed, so you can play it without an API key."
            : "Played against the real Claude model, so bring your Claude API key."}
        </p>
      </div>
    </article>
  );
}

function AcademyRow({ c, onStart, starting }: { c: Challenge; onStart: (c: Challenge, missionId: string) => void; starting: string | null }) {
  return (
    <li className="grid gap-5 p-6 not-first:border-t not-first:border-dashed not-first:border-ink/25 lg:grid-cols-[300px_1fr]">
      <div className="flex gap-4">
        <Milo size={72} mood={MOOD_BY_LEVEL[c.agent.difficulty] ?? "idle"} label={c.agent.name} />
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-baseline gap-x-2 text-xl font-bold">
            {c.agent.name}
            <span className="text-sm font-semibold text-muted-foreground">{c.agent.label}</span>
          </h3>
          <p className="mt-1 text-sm leading-snug text-muted-foreground">{c.agent.blurb}</p>
          <div className="mt-2">
            <Difficulty level={c.agent.difficulty} />
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {c.missions.map((m) => (
          <MissionTicket key={m.id} c={c} m={m} starting={starting} onStart={() => onStart(c, m.id)} />
        ))}
      </div>
    </li>
  );
}

/** Which brain new attempts get, and the way to change it. */
function BrainBanner({ apiKey, onOpen }: { apiKey: string | null; onOpen: () => void }) {
  const [serverKey, setServerKey] = useState(false);
  useEffect(() => {
    api<{ serverModelKey?: boolean }>("/api/config")
      .then((c) => setServerKey(Boolean(c.serverModelKey)))
      .catch(() => {});
  }, []);
  if (!apiKey && serverKey) return null;
  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg bg-paper p-5 shadow-[0_1px_2px_rgb(25_27_42/0.06)]">
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", apiKey ? "bg-ink text-white" : "border-2 border-dashed border-ink/40")} aria-hidden>
        <KeyRound className="size-5" />
      </span>
      <div className="min-w-60 flex-1">
        {apiKey ? (
          <>
            <p className="font-bold">Milo runs on Claude, with your API key</p>
            <p className="text-sm text-muted-foreground">
              Key <span className="font-mono">{maskKey(apiKey)}</span> is kept in this browser and sent only when you start an attempt.
            </p>
          </>
        ) : (
          <>
            <p className="font-bold">Milo is playing offline</p>
            <p className="text-sm text-muted-foreground">
              A scripted stand-in runs every practice attempt, so you can try everything without an API key. Add your Claude key to play the real
              model.
            </p>
          </>
        )}
      </div>
      <div className="flex gap-2">
        {apiKey && (
          <Button variant="ghost" className="h-10" onClick={() => saveModelKey(null)}>
            Go offline
          </Button>
        )}
        <Button variant={apiKey ? "outline" : "default"} className="h-10 px-4" onClick={onOpen}>
          {apiKey ? "Change key" : "Use my Claude key"}
        </Button>
      </div>
    </div>
  );
}

export default function PlayPage() {
  const router = useRouter();
  const { ready, signIn } = useSession();
  const apiKey = useModelKey();
  const keyDialog = useKeyDialog();
  const [items, setItems] = useState<Challenge[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await api<Challenge[]>("/api/challenges"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load missions");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const start = async (c: Challenge, missionId: string) => {
    if (c.kind === "PRIZE" && !ready) {
      toast.info("Connect your wallet and sign in to play for a bounty. The reward goes to that wallet.");
      return;
    }
    setStarting(missionId);
    try {
      const { runId } = await api<{ runId: string }>("/api/runs", {
        method: "POST",
        json: { campaignId: c.id, missionId, ...(apiKey ? { apiKey } : {}) },
      });
      router.push(`/play/${runId}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "ACTIVE_RUN_EXISTS" && err.details?.runId) {
        toast.info("You have an attempt in progress.", {
          action: { label: "Resume", onClick: () => router.push(`/play/${err.details!.runId}`) },
        });
      } else if (err instanceof ApiError && err.code === "MODEL_KEY_REQUIRED") {
        toast.info(err.message, { action: { label: "Add key", onClick: keyDialog.open } });
      } else if (err instanceof ApiError && err.code === "BAD_API_KEY") {
        toast.error("Your saved Claude key looks malformed. Add it again.", { action: { label: "Add key", onClick: keyDialog.open } });
      } else if (err instanceof ApiError && err.code === "WALLET_REQUIRED") {
        toast.info(err.message, { action: { label: "Sign in", onClick: () => void signIn() } });
      } else {
        toast.error(err instanceof ApiError ? err.message : "Couldn't start the mission");
        if (err instanceof ApiError && err.code === "BOUNTY_CLAIMED") void load();
      }
    } finally {
      setStarting(null);
    }
  };

  const prize = items?.filter((c) => c.kind === "PRIZE") ?? [];
  const training = (items?.filter((c) => c.kind === "TRAINING") ?? []).sort((a, b) => a.agent.difficulty - b.agent.difficulty);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <header>
        <h1 className="font-display text-[clamp(2.75rem,6vw,4.5rem)]">Choose your heist</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          Every mission is one rule Milo must keep. Each attempt gets its own copy of the store, so nothing you do affects other players.
        </p>
      </header>

      <BrainBanner apiKey={apiKey} onOpen={keyDialog.open} />

      {error && (
        <div role="alert" className="mt-8 flex flex-wrap items-center gap-3 rounded-lg border-2 border-destructive bg-paper p-4 text-sm">
          <p className="flex-1 font-semibold">{error}</p>
          <Button variant="outline" className="h-10" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      )}

      <section aria-labelledby="bounties" className="mt-12">
        <h2 id="bounties" className="font-condensed text-3xl font-extrabold tracking-tight">
          Funded bounties
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Paid in devnet test SOL from a vault the organizer funded up front.</p>
        <div className="mt-6 space-y-6">
          {items === null ? (
            <Skeleton className="h-72 rounded-lg" />
          ) : prize.length === 0 ? (
            <div className="rounded-lg border border-dashed border-ink/30 p-6 text-sm">
              <p className="font-bold">No funded bounties at the moment</p>
              <p className="mt-1 text-muted-foreground">Practice below, or fund one for your own agent.</p>
              <Link href="/organizer/new" className="mt-2 inline-block font-semibold underline underline-offset-4 hover:no-underline">
                Create a bounty campaign
              </Link>
            </div>
          ) : (
            prize.map((c) => <BountyCampaign key={c.id} c={c} onStart={(cc, m) => void start(cc, m)} starting={starting} />)
          )}
        </div>
      </section>

      <section aria-labelledby="training" className="mt-16">
        <h2 id="training" className="font-condensed text-3xl font-extrabold tracking-tight">
          Practice: the Milo academy
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Four versions of Milo, from a rookie who wants five-star reviews to one whose refund tool enforces every rule. No wallet needed; sign in
          to keep your points.
        </p>
        {items === null ? (
          <Skeleton className="mt-6 h-[640px] rounded-lg" />
        ) : (
          <ol className="paper-shadow mt-6 overflow-hidden rounded-lg bg-paper">
            {training.map((c) => (
              <AcademyRow key={c.id} c={c} onStart={(cc, m) => void start(cc, m)} starting={starting} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
