"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ExternalLink, XCircle } from "lucide-react";
import { Price, Receipt, ReceiptRule, Stamp } from "@/components/receipt";
import { cn } from "@/lib/utils";
import { explorerTx } from "@/lib/format";
import type { DerivedRun, OpItem } from "@/lib/run-state";
import { ruleMeter } from "@/lib/run-state";
import type { RunView } from "@/lib/types";

function TapeLine({ op, decisive }: { op: OpItem; decisive: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      className={cn("relative", decisive && "-mx-5 bg-destructive/8 px-5")}
    >
      <div className="py-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className={cn("text-[11px] text-ink/55", !op.ok && "text-warning")}>
            #{op.opSeq} {op.tool}
            {!op.ok && " (refused)"}
          </span>
          {op.amount !== undefined && <span className="font-semibold tabular-nums">-{(op.amount / 100).toFixed(2)}</span>}
        </div>
        <p className="leading-5">{op.text}</p>
        {decisive && <p className="mt-0.5 text-[11px] font-semibold text-destructive">decisive action</p>}
      </div>
    </motion.li>
  );
}

const PAYOUT_STEPS = [
  { key: "broken", label: "Rule broken" },
  { key: "verified", label: "Verified by replay" },
  { key: "sent", label: "Payout sent" },
  { key: "confirmed", label: "Confirmed on Solana" },
];

/** Right column: the register tape. Every action Milo executes prints here. */
export function ConsequencesPanel({ view, d }: { view: RunView; d: DerivedRun }) {
  const meter = ruleMeter(view.mission.rule, view.state, d.refunds);
  const pct = Math.min(meter.progress, 1) * 100;
  const isPrize = view.campaign.kind === "PRIZE";
  const decisiveOp = d.finding.decisiveSeq ?? d.ruleBroken?.opSeq ?? null;
  const tapeRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const step =
    d.payout.status === "CONFIRMED" ? 4 : d.payout.status === "SENT" ? 3 : d.finding.status === "CONFIRMED" ? 2 : d.ruleBroken || d.status === "WON" ? 1 : 0;

  useEffect(() => {
    tapeRef.current?.scrollTo({ top: tapeRef.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [d.ops.length, meter.broken, reduce]);

  return (
    <section aria-labelledby="consequences" className="flex min-h-0 flex-col gap-4">
      <div className="rounded-lg bg-paper p-4 shadow-[0_1px_2px_rgb(25_27_42/0.06)]">
        <div className="flex items-center justify-between gap-2">
          <h2 id="consequences" className="text-sm font-bold">
            The rule
          </h2>
          <span className={cn("rounded-sm px-2 py-0.5 text-xs font-bold", meter.broken ? "bg-destructive text-white" : "bg-ink text-white")}>
            {meter.broken ? "Broken" : "Holding"}
          </span>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-ink/10"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          aria-label={meter.label}
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-300 ease-snap", meter.broken ? "bg-destructive" : "bg-ink")}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 flex justify-between gap-2 text-xs">
          <span className="text-muted-foreground">{meter.label}</span>
          <span className="font-mono font-semibold tabular-nums">{meter.detail}</span>
        </p>
      </div>

      <div ref={tapeRef} className="min-h-48 flex-1 overflow-y-auto pb-2">
        <Receipt edges="bottom" paperClassName="text-[12.5px]">
          <div className="flex justify-between font-semibold">
            <span>NEON MART</span>
            <span>REGISTER TAPE</span>
          </div>
          <p className="text-[11px] text-ink/55">What Milo actually did, in order</p>
          <ReceiptRule className="mb-1" />
          {d.ops.length === 0 ? (
            <p className="py-6 text-center text-xs leading-5 text-ink/60">
              No actions yet.
              <br />
              Milo&apos;s tool calls print here the moment they run.
            </p>
          ) : (
            <ol aria-live="polite" className="divide-y divide-dashed divide-ink/20">
              <AnimatePresence initial={false}>
                {d.ops.map((op) => (
                  <TapeLine key={op.seq} op={op} decisive={decisiveOp === op.opSeq} />
                ))}
              </AnimatePresence>
            </ol>
          )}
          {meter.broken && (
            <div className="flex justify-center pt-4 pb-2">
              <Stamp className="text-[28px]">Rule broken</Stamp>
            </div>
          )}
        </Receipt>
      </div>

      <div className="rounded-lg bg-paper p-4 shadow-[0_1px_2px_rgb(25_27_42/0.06)]">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">{isPrize ? "Bounty" : "Practice reward"}</h3>
          {isPrize ? <Price lamports={view.mission.rewardLamports} className="text-2xl" /> : <Price points={view.mission.points} className="text-xl" />}
        </div>
        <ol className="mt-3 grid grid-cols-1 gap-1.5">
          {(isPrize ? PAYOUT_STEPS : PAYOUT_STEPS.slice(0, 2)).map((s, i) => {
            const done = step > i;
            return (
              <li key={s.key} className="flex items-center gap-2 text-sm">
                <span
                  className={cn("grid size-5 place-items-center rounded-full", done ? "bg-ink text-white" : "border border-dashed border-ink/40")}
                  aria-hidden
                >
                  {done && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className={done ? "font-semibold" : "text-muted-foreground"}>{s.label}</span>
                <span className="sr-only">{done ? "done" : "pending"}</span>
              </li>
            );
          })}
        </ol>
        {d.finding.status === "REJECTED" && (
          <p className="mt-3 flex items-start gap-2 text-xs text-destructive">
            <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Verification rejected: {d.finding.reason}
          </p>
        )}
        {d.finding.note === "bounty_already_claimed" && (
          <p className="mt-3 text-xs font-semibold text-warning">Confirmed, but an earlier finding already claimed this bounty.</p>
        )}
        {d.payout.signature && (
          <a
            href={explorerTx(d.payout.signature, view.cluster)}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-4 hover:no-underline"
          >
            View the payout transaction <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
        {isPrize && <p className="mt-3 text-[11px] text-muted-foreground">Devnet test SOL, no monetary value.</p>}
      </div>
    </section>
  );
}
