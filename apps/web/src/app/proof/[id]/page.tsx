"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyText } from "@/components/copy-text";
import { Barcode, Price, Receipt, ReceiptRow, ReceiptRule, Stamp } from "@/components/receipt";
import { api, ApiError } from "@/lib/api";
import { credits, dateTime, shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Operation {
  seq: number;
  tool: string;
  input: Record<string, unknown>;
  outcome: { ok: boolean; data?: unknown; error?: { code: string; message: string } };
  mutated: boolean;
  stateBeforeHash: string;
  stateAfterHash: string;
}

interface Proof {
  id: string;
  rule: string;
  ruleText: string;
  mission: string;
  campaign: { title: string; kind: string; onchainAddress: string | null };
  summary: string;
  proofHash: string;
  verifiedAt: string;
  campaignExplorerUrl: string | null;
  payout: { status: string; signature: string | null; lamports: string; recipient: string; explorerUrl: string | null; claimExplorerUrl?: string | null } | null;
  proof: {
    schema: string;
    runId: string;
    agent: { name: string; model: string; configHash: string; brain?: string };
    engineVersion: string;
    rulesVersion: string;
    winner: string | null;
    seedStateHash: string;
    finalStateHash: string;
    operations: Operation[];
    violation: { decisiveSeq: number; orderId: string; paid: number; refunded: number };
    otherViolations: Array<{ rule: string; summary: string }>;
  };
}

const PAYOUT_LABEL: Record<string, string> = {
  PENDING: "Queued",
  SENDING: "Sending",
  SENT: "Sent",
  CONFIRMED: "Confirmed on Solana",
  FAILED: "Failed",
};

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("py-3", className)}>
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

export default function ProofPage({ params }: PageProps<"/proof/[id]">) {
  const { id } = use(params);
  const [proof, setProof] = useState<Proof | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Proof>(`/api/proof/${id}`)
      .then(setProof)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load this proof"));
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 py-20">
        <h1 className="font-condensed text-3xl font-extrabold">Proof not available</h1>
        <p className="text-sm text-muted-foreground">{error}. Proofs exist only for verified findings.</p>
        <Button className="h-10" render={<Link href="/play" />} nativeButton={false}>
          Back to missions
        </Button>
      </div>
    );
  }
  if (!proof) {
    return (
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:px-6 lg:grid-cols-[1fr_360px]">
        <Skeleton className="h-[640px] rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  const download = () => {
    const blob = new Blob([JSON.stringify(proof.proof, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `botheist-proof-${proof.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const v = proof.proof.violation;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-muted-foreground">
          Verified finding in {proof.mission}, {proof.campaign.title}
        </p>
        <h1 className="mt-2 font-condensed text-4xl leading-[1.05] font-extrabold tracking-tight text-balance md:text-5xl">{proof.summary}</h1>
        <p className="mt-3 text-base text-muted-foreground">
          Milo&apos;s rule: <span className="font-semibold text-foreground">{proof.ruleText}</span>
        </p>
      </header>

      <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="ops">
          <h2 id="ops" className="text-xl font-bold">
            Replayed operations
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            The verifier re-executed every tool call from the starting state and got the same results and state hashes. The chat is not part
            of the proof: only executed actions count.
          </p>
          <Receipt className="mt-5 max-w-2xl">
            <div className="flex justify-between font-semibold">
              <span>NEON MART</span>
              <span>REPLAY</span>
            </div>
            <p className="text-[11px] text-ink/55">
              engine {proof.proof.engineVersion}, rules {proof.proof.rulesVersion}
            </p>
            <ReceiptRow className="mt-2 text-[11px] text-ink/55" label="seed state" value={`${proof.proof.seedStateHash.slice(0, 16)}…`} />
            <ReceiptRule />
            <ol className="divide-y divide-dashed divide-ink/20">
              {proof.proof.operations.map((op) => {
                const decisive = op.seq === v.decisiveSeq;
                return (
                  <li key={op.seq} className={cn("py-3", decisive && "-mx-5 bg-destructive/8 px-5")}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-semibold">
                        #{op.seq} {op.tool}
                      </span>
                      <span className="text-[11px] text-ink/60">
                        {!op.outcome.ok ? `refused: ${op.outcome.error?.code}` : op.mutated ? "state changed" : "read only"}
                      </span>
                    </div>
                    <pre className="mt-1.5 overflow-x-auto text-[12px] leading-5 whitespace-pre-wrap text-ink/80">{JSON.stringify(op.input)}</pre>
                    <p className="mt-1 text-[11px] break-all text-ink/50">
                      {op.stateBeforeHash.slice(0, 12)}… to {op.stateAfterHash.slice(0, 12)}…
                    </p>
                    {decisive && <p className="mt-1 text-[11px] font-semibold text-destructive">decisive action</p>}
                  </li>
                );
              })}
            </ol>
            <ReceiptRule />
            <ReceiptRow label={`ORDER ${v.orderId.toUpperCase()}`} />
            <ReceiptRow label="PAID" value={credits(v.paid)} />
            <ReceiptRow label="REFUNDED" value={credits(v.refunded)} strong />
            <ReceiptRow label="DECISIVE STEP" value={v.decisiveSeq} />
            <div className="flex justify-center py-5">
              <Stamp className="text-[30px]">Rule broken</Stamp>
            </div>
            <ReceiptRow className="text-[11px] text-ink/55" label="final state" value={`${proof.proof.finalStateHash.slice(0, 16)}…`} />
          </Receipt>
          {proof.proof.otherViolations.length > 0 && (
            <p className="mt-4 max-w-2xl text-xs text-muted-foreground">
              Also broken in this attempt, reported but not rewarded: {proof.proof.otherViolations.map((o) => o.summary).join(" ")}
            </p>
          )}
        </section>

        <aside className="rounded-lg bg-paper p-6 shadow-[0_1px_2px_rgb(25_27_42/0.06)] lg:sticky lg:top-24" aria-label="Proof details">
          <Stamp ink className="text-[22px]">
            Verified by replay
          </Stamp>
          <div className="mt-6">
            <Barcode value={proof.proofHash} />
            <p className="mt-2 text-xs font-semibold text-muted-foreground">
              Proof hash, SHA-256{proof.payout ? ", committed on-chain in the Claim account" : ""}
            </p>
            <CopyText value={proof.proofHash} label="proof hash" className="-ml-1.5 text-foreground" />
          </div>
          <dl className="mt-2 divide-y divide-ink/10">
            <Field label="Verified">{dateTime(proof.verifiedAt)}</Field>
            <Field label="Cashier">
              {proof.proof.agent.brain === "PLAYER_KEY" || proof.proof.agent.brain === "SERVER_KEY"
                ? `${proof.proof.agent.name} on ${proof.proof.agent.model}`
                : `${proof.proof.agent.name}, offline stand-in (scripted, no model)`}
              <br />
              <CopyText value={proof.proof.agent.configHash} display={`config ${proof.proof.agent.configHash.slice(0, 12)}…`} label="config hash" className="-ml-1.5" />
            </Field>
            <Field label="Campaign">
              {proof.campaign.title}
              {proof.campaignExplorerUrl && (
                <a
                  href={proof.campaignExplorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 flex items-center gap-1 text-xs font-semibold underline underline-offset-4 hover:no-underline"
                >
                  Vault on Solana Explorer <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
            </Field>
            {proof.payout && (
              <Field label="Bounty">
                <div className="flex items-center justify-between gap-2">
                  <Price lamports={proof.payout.lamports} className="text-2xl" />
                  <span className="rounded-sm bg-ink px-1.5 py-0.5 text-[11px] font-bold text-white">{PAYOUT_LABEL[proof.payout.status] ?? proof.payout.status}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  to <CopyText value={proof.payout.recipient} display={shortAddress(proof.payout.recipient)} label="winner address" />
                </p>
                {proof.payout.explorerUrl && (
                  <a
                    href={proof.payout.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 flex items-center gap-1 text-xs font-semibold underline underline-offset-4 hover:no-underline"
                  >
                    Payout transaction <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
                {proof.payout.claimExplorerUrl && (
                  <a
                    href={proof.payout.claimExplorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 flex items-center gap-1 text-xs font-semibold underline underline-offset-4 hover:no-underline"
                  >
                    Claim account with this proof hash <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
              </Field>
            )}
          </dl>
          <Button variant="outline" className="mt-4 h-11 w-full" onClick={download}>
            <Download aria-hidden /> Download proof JSON
          </Button>
        </aside>
      </div>
    </div>
  );
}
