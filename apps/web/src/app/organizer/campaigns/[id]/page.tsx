"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { address } from "@solana/kit";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { ExternalLink, Rocket, ShieldCheck, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { getCreateAndFundCampaignInstructionAsync, getRefundInstructionAsync, hexToBytes, uuidToBytes } from "@botheist/solana";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Price } from "@/components/receipt";
import { CopyText } from "@/components/copy-text";
import { RequireSession } from "@/components/organizer/require-session";
import { client } from "@/components/wallet/solana-client";
import { api, ApiError } from "@/lib/api";
import { RULE_LABEL, credits, dateTime, explorerTx, shortAddress, sol, usd } from "@/lib/format";
import { CAMPAIGN_STATUS, type DashboardCampaign } from "@/lib/organizer";

interface FundingParams {
  campaignId: string;
  organizer: string;
  verifier: string;
  configHashHex: string;
  rewards: Array<{ ruleIndex: number; lamports: string }>;
  submissionsCloseAt: string;
  payoutDeadlineAt: string;
  campaignAddress: string;
  vaultAddress: string;
  programId: string;
  cluster: string;
  totalLamports: string;
}

type TxStep = "idle" | "preparing" | "review" | "signing" | "confirming" | "done";

function walletError(err: unknown): string | null {
  const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
  if (/reject|cancel|declin|denied/i.test(msg)) return null; // user closed the wallet prompt
  if (/insufficient|lamports/i.test(msg)) return "Your wallet doesn't have enough devnet SOL for the pool, vault rent and fees.";
  return msg;
}

async function confirmWithRetry(path: string, signature: string) {
  for (let i = 0; i < 15; i++) {
    try {
      return await api<{ status: string }>(path, { method: "POST", json: { signature } });
    } catch (err) {
      if (err instanceof ApiError && (err.code === "NOT_ON_CHAIN" || err.code === "NOT_REFUNDED") && i < 14) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Timed out waiting for the network");
}

function Campaign({ id }: { id: string }) {
  const connected = useConnectedWallet(client);
  const [c, setC] = useState<DashboardCampaign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<TxStep>("idle");
  const [params, setParams] = useState<FundingParams | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [lastSig, setLastSig] = useState<string | null>(null);

  const load = useCallback(() => {
    api<DashboardCampaign>(`/api/campaigns/${id}`)
      .then(setC)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load the campaign"));
  }, [id]);
  useEffect(load, [load]);

  const prepare = async () => {
    setTx("preparing");
    setTxError(null);
    try {
      const p = await api<FundingParams>(`/api/campaigns/${id}/prepare-funding`, { method: "POST" });
      if (connected && p.organizer !== connected.account.address) throw new Error("Switch your wallet to the account you signed in with.");
      setParams(p);
      setTx("review");
    } catch (err) {
      setTxError(walletError(err));
      setTx("idle");
    }
  };

  const fund = async () => {
    if (!params) return;
    setTx("signing");
    setTxError(null);
    try {
      const ix = await getCreateAndFundCampaignInstructionAsync({
        organizer: client.identity,
        campaign: address(params.campaignAddress),
        vault: address(params.vaultAddress),
        campaignId: uuidToBytes(params.campaignId),
        verifier: address(params.verifier),
        configHash: hexToBytes(params.configHashHex, 32),
        rewards: params.rewards.map((r) => ({ ruleId: r.ruleIndex, amount: BigInt(r.lamports) })),
        submissionsCloseAt: BigInt(Math.floor(new Date(params.submissionsCloseAt).getTime() / 1000)),
        payoutDeadlineAt: BigInt(Math.floor(new Date(params.payoutDeadlineAt).getTime() / 1000)),
      });
      const res = await client.sendTransaction([ix]);
      const sig = res.context.signature as string;
      setLastSig(sig);
      setTx("confirming");
      await confirmWithRetry(`/api/campaigns/${id}/confirm-funding`, sig);
      setTx("done");
      toast.success("Campaign is live. The vault is funded.");
      load();
    } catch (err) {
      const msg = walletError(err);
      setTxError(msg);
      setTx(msg ? "review" : "review");
    }
  };

  const withdraw = async () => {
    if (!c?.onchainAddress) return;
    setTxError(null);
    setTx("signing");
    try {
      const ix = await getRefundInstructionAsync({ organizer: client.identity, campaign: address(c.onchainAddress) });
      const res = await client.sendTransaction([ix]);
      const sig = res.context.signature as string;
      setLastSig(sig);
      setTx("confirming");
      await confirmWithRetry(`/api/campaigns/${id}/confirm-refund`, sig);
      setTx("done");
      toast.success("Remaining funds returned to your wallet.");
      load();
    } catch (err) {
      setTxError(walletError(err));
      setTx("idle");
    }
  };

  if (error) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 py-16">
        <h1 className="font-condensed text-3xl font-extrabold">Campaign unavailable</h1>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" className="h-10" render={<Link href="/organizer" />} nativeButton={false}>
          Back to dashboard
        </Button>
      </div>
    );
  }
  if (!c) return <Skeleton className="mx-auto mt-10 h-96 max-w-4xl rounded-lg" />;

  const st = CAMPAIGN_STATUS[c.status] ?? CAMPAIGN_STATUS.DRAFT!;
  const pool = c.missions.reduce((s, m) => s + BigInt(m.rewardLamports), 0n);
  const canFund = c.status === "DRAFT" || c.status === "AWAITING_FUNDING";
  const canWithdraw = c.status === "ACTIVE" && c.payoutDeadlineAt && new Date(c.payoutDeadlineAt).getTime() < Date.now();
  const busy = tx === "preparing" || tx === "signing" || tx === "confirming";

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-12 md:px-6">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link href="/organizer" className="text-xs text-muted-foreground hover:text-foreground">
            All campaigns
          </Link>
          <h1 className="mt-2 font-display text-[clamp(2.25rem,5vw,3.5rem)]">{c.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {c.agent.name} on {c.agent.model}, config {c.agent.configHash.slice(0, 10)}
          </p>
        </div>
        <Badge className={st.className}>{st.label}</Badge>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        {c.missions.map((m) => (
          <div key={m.id} className="rounded-lg bg-paper p-4 shadow-[0_1px_2px_rgb(25_27_42/0.06)]">
            <p className="font-bold">{m.title}</p>
            <Price lamports={m.rewardLamports} className="mt-2 text-2xl" />
            <p className="mt-1 text-xs">{m.claimed ? <span className="font-semibold text-destructive">Broken, bounty claimed</span> : <span className="text-muted-foreground">Holding</span>}</p>
          </div>
        ))}
      </section>

      {canFund && (
        <section aria-labelledby="fund" className="rounded-lg border-2 border-ink bg-paper p-6">
          <h2 id="fund" className="flex items-center gap-2 text-xl font-bold">
            <Rocket className="size-5" aria-hidden /> Fund and publish
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            One transaction creates the on-chain campaign and locks the whole prize pool in its vault. The terms are frozen by hash; players can verify
            them.
          </p>
          {tx === "review" || tx === "signing" || tx === "confirming" ? (
            params && (
              <div className="mt-4 space-y-3">
                <dl className="grid gap-3 rounded-md bg-background p-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">You send to the vault</dt>
                    <dd className="font-mono font-semibold">{sol(params.totalLamports)} + ~0.00089 SOL rent</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Network</dt>
                    <dd className="font-mono font-semibold">Solana {params.cluster} (test SOL)</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Program called</dt>
                    <dd>
                      <CopyText value={params.programId} display={`BotHeist ${shortAddress(params.programId)}`} label="program id" />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Payout verifier</dt>
                    <dd>
                      <CopyText value={params.verifier} display={shortAddress(params.verifier)} label="verifier" />
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Frozen terms hash</dt>
                    <dd>
                      <CopyText value={params.configHashHex} label="terms hash" />
                    </dd>
                  </div>
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    Rewards are paid only by the verifier above, once per rule. You can withdraw what's left only after {dateTime(params.payoutDeadlineAt)}.
                  </p>
                </dl>
                <Button className="h-10" onClick={() => void fund()} disabled={busy || !connected}>
                  {tx === "signing" ? "Approve in your wallet…" : tx === "confirming" ? "Waiting for the network…" : "Sign & fund"}
                </Button>
              </div>
            )
          ) : (
            <Button className="mt-4 h-10" onClick={() => void prepare()} disabled={busy || !connected}>
              {tx === "preparing" ? "Freezing terms…" : "Review funding transaction"}
            </Button>
          )}
          {txError && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {txError}
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="chain" className="rounded-lg bg-paper p-6 shadow-[0_1px_2px_rgb(25_27_42/0.06)]">
        <h2 id="chain" className="flex items-center gap-2 text-lg font-bold">
          <ShieldCheck className="size-5" aria-hidden /> On-chain
        </h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Prize pool</dt>
            <dd className="font-mono">{sol(pool)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Model spend</dt>
            <dd className="font-mono">
              {usd(c.spentMicros)} of {usd(c.totalBudgetMicros)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Campaign account</dt>
            <dd>
              {c.onchainAddress ? (
                <span className="flex items-center gap-2">
                  <CopyText value={c.onchainAddress} display={shortAddress(c.onchainAddress)} label="campaign address" />
                  {c.explorerUrl && (
                    <a href={c.explorerUrl} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-md hover:bg-muted" aria-label="Open campaign on Solana Explorer">
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  )}
                </span>
              ) : (
                "Not funded yet"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Funding transaction</dt>
            <dd>
              {c.fundTxSignature ? (
                <a href={explorerTx(c.fundTxSignature)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs underline underline-offset-4 hover:no-underline">
                  {shortAddress(c.fundTxSignature, 8)} <ExternalLink className="size-3" aria-hidden />
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
          {c.configHash && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">
                Frozen terms hash,{" "}
                <a href={`/api/campaigns/${c.id}/terms`} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4 hover:no-underline">
                  view terms
                </a>
              </dt>
              <dd>
                <CopyText value={c.configHash} label="terms hash" />
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted-foreground">Submissions close</dt>
            <dd>{dateTime(c.submissionsCloseAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Payout deadline</dt>
            <dd>{dateTime(c.payoutDeadlineAt)}</dd>
          </div>
        </dl>
        {lastSig && (
          <a href={explorerTx(lastSig)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-4 hover:no-underline">
            Last transaction {shortAddress(lastSig, 6)} <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
        {canWithdraw && (
          <div className="mt-4 border-t border-border pt-4">
            <Button variant="outline" className="h-10" onClick={() => void withdraw()} disabled={busy || !connected}>
              <Undo2 aria-hidden /> {tx === "signing" ? "Approve in your wallet…" : tx === "confirming" ? "Waiting for the network…" : "Withdraw remaining funds"}
            </Button>
          </div>
        )}
        {c.status === "ACTIVE" && !canWithdraw && <p className="mt-4 text-xs text-muted-foreground">Withdrawal unlocks after the payout deadline.</p>}
      </section>

      <section aria-labelledby="findings" className="rounded-lg bg-paper p-6 shadow-[0_1px_2px_rgb(25_27_42/0.06)]">
        <h2 id="findings" className="text-lg font-bold">Findings</h2>
        {c.findings.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{c.status === "ACTIVE" ? "No rule broken yet. Your cashier is holding." : "Findings appear here once the campaign is live."}</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink/10">
            {c.findings.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {RULE_LABEL[f.rule]}: paid {credits(f.paid)}, refunded <span className="text-destructive">{credits(f.refunded)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {f.playerMessages} player messages, decisive step {f.decisiveSeq}, {dateTime(f.createdAt)}
                  </p>
                </div>
                <Badge variant="outline">{f.payoutStatus ?? f.status}</Badge>
                <Button variant="outline" className="h-10" render={<Link href={`/organizer/findings/${f.id}`} />} nativeButton={false}>
                  Finding card
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function CampaignPage({ params }: PageProps<"/organizer/campaigns/[id]">) {
  const { id } = use(params);
  return (
    <RequireSession what="manage this campaign">
      <Campaign id={id} />
    </RequireSession>
  );
}
