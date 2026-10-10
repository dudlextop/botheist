"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/receipt";
import { END_REASON, shortHash } from "@/lib/format";
import type { DerivedRun } from "@/lib/run-state";
import type { RunView } from "@/lib/types";

export function ResultCard({ view, d, onRetry, retrying }: { view: RunView; d: DerivedRun; onRetry: () => void; retrying: boolean }) {
  const reduce = useReducedMotion();
  if (d.status === "ACTIVE") return null;
  const won = d.status === "WON";
  const confirmed = d.finding.status === "CONFIRMED";
  const rejected = d.finding.status === "REJECTED";
  const isPrize = view.campaign.kind === "PRIZE";
  const glitch = d.status === "MODEL_ERROR" || d.status === "ABORTED";

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      role="status"
      className="mb-4"
    >
      {won && !rejected ? (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-lg bg-ink p-5 text-white md:px-6">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 font-condensed text-3xl font-extrabold">
              {!confirmed && <Loader2 className="size-6 animate-spin" aria-hidden />}
              {confirmed ? "Violation confirmed" : "Rule broken. Verifying the tape…"}
            </h2>
            <p className="mt-1 text-sm text-white/80">{d.finding.summary ?? d.ruleBroken?.summary}</p>
            {confirmed && (
              <p className="mt-1 font-mono text-xs text-white/60">
                proof {shortHash(d.finding.proofHash)}, decisive step {d.finding.decisiveSeq}
              </p>
            )}
          </div>
          {confirmed && (
            <div className="rounded-md bg-tag px-4 py-2 text-tag-foreground">
              {isPrize && d.finding.note !== "bounty_already_claimed" ? (
                <>
                  <p className="text-xs font-semibold">{d.payout.status === "CONFIRMED" ? "Paid to your wallet" : "On its way to your wallet"}</p>
                  <Price lamports={view.mission.rewardLamports} className="text-2xl" />
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold">Added to your score</p>
                  <Price points={view.mission.points} className="text-2xl" />
                </>
              )}
            </div>
          )}
          <div className="flex gap-2">
            {confirmed && d.finding.id && (
              <Button variant="tag" className="h-11 px-5" render={<Link href={`/proof/${d.finding.id}`} />} nativeButton={false}>
                Open proof
              </Button>
            )}
            <Button
              variant="outline"
              className="h-11 border-white/30 bg-transparent px-5 text-white hover:border-white hover:bg-transparent"
              render={<Link href="/play" />}
              nativeButton={false}
            >
              Next mission
            </Button>
          </div>
        </div>
      ) : (
        <div className={glitch ? "flex flex-wrap items-center gap-4 rounded-lg border-2 border-warning bg-paper p-5" : "flex flex-wrap items-center gap-4 rounded-lg bg-paper p-5"}>
          <div className="min-w-0 flex-1">
            <h2 className="font-condensed text-2xl font-extrabold">
              {d.status === "MODEL_ERROR"
                ? "Milo glitched. This attempt doesn't count."
                : d.status === "ABORTED"
                  ? "Attempt stopped"
                  : rejected
                    ? "The verifier didn't confirm it"
                    : "Milo held the line"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {END_REASON[d.endReason ?? ""] ?? d.endReason}
              {d.status !== "MODEL_ERROR" && d.ops.length > 0 && ` after ${d.ops.length} action${d.ops.length === 1 ? "" : "s"}`}. Try a different
              angle in a new attempt.
            </p>
          </div>
          <Button className="h-11 px-5" onClick={onRetry} disabled={retrying}>
            <RotateCcw aria-hidden /> {retrying ? "Starting…" : "New attempt"}
          </Button>
        </div>
      )}
    </motion.div>
  );
}
