"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { credits } from "@/lib/format";
import type { Refund, RunView, StoreState } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Left column: the case file. What to break, what you own, who's who in the store. */
export function SituationPanel({ view, state, refunds, register }: { view: RunView; state: StoreState; refunds: Refund[]; register: number }) {
  const player = Object.values(state.customers).find((c) => c.role === "player");
  return (
    <section aria-labelledby="situation" className="flex min-h-0 flex-col gap-4 overflow-y-auto pb-1">
      <div className="rounded-lg bg-paper p-5 shadow-[0_1px_2px_rgb(25_27_42/0.06)]">
        <h1 id="situation" className="font-display text-5xl">
          {view.mission.title}
        </h1>
        <p className="mt-3 text-sm leading-6">{view.mission.briefing}</p>
        <div className="mt-4 rounded-md border-2 border-ink p-3">
          <p className="text-xs font-semibold text-muted-foreground">Milo&apos;s rule</p>
          <p className="mt-0.5 text-sm leading-snug font-bold">{view.mission.ruleText}</p>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          <span className="font-semibold text-foreground">You win when</span> {view.mission.winCondition.charAt(0).toLowerCase() + view.mission.winCondition.slice(1)}
        </p>
      </div>

      <div className="rounded-lg bg-paper p-5 shadow-[0_1px_2px_rgb(25_27_42/0.06)]">
        <h2 className="text-sm font-bold">Your orders</h2>
        <ul className="mt-3 space-y-3">
          {Object.values(state.orders)
            .filter((o) => o.customerId === player?.id)
            .map((o) => {
              const refunded = refunds.filter((r) => r.orderId === o.id).reduce((s, r) => s + r.amount, 0);
              const over = refunded > o.paidAmount || (refunded > 0 && o.paidAmount === 0);
              return (
                <li key={o.id} className="rounded-md border border-ink/15 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold">{o.id}</span>
                    <span
                      className={cn(
                        "rounded-sm px-1.5 py-0.5 text-[11px] font-bold",
                        o.status === "paid" ? "bg-ink text-white" : "border border-dashed border-ink/50 text-ink",
                      )}
                    >
                      {o.status === "paid" ? "Paid" : "Not paid"}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-0.5 font-mono text-xs text-muted-foreground">
                    {o.items.map((i) => (
                      <li key={i.sku} className="flex justify-between gap-2">
                        <span>{i.name}</span>
                        <span className="tabular-nums">{credits(i.unitPrice * i.qty)}</span>
                      </li>
                    ))}
                  </ul>
                  <dl className="mt-2 grid grid-cols-3 gap-2 border-t border-dashed border-ink/25 pt-2 font-mono text-xs tabular-nums">
                    <div>
                      <dt className="text-muted-foreground">Total</dt>
                      <dd>{credits(o.total)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Paid</dt>
                      <dd>{credits(o.paidAmount)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Refunded</dt>
                      <dd className={cn(over && "font-semibold text-destructive")}>{credits(refunded)}</dd>
                    </div>
                  </dl>
                </li>
              );
            })}
        </ul>
      </div>

      <div className="rounded-lg bg-paper p-5 shadow-[0_1px_2px_rgb(25_27_42/0.06)]">
        <h2 className="text-sm font-bold">Store directory</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Milo refunds by customer ID.</p>
        <ul className="mt-2">
          {Object.values(state.customers).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {c.name}
                {c.role === "alternate" && <span className="ml-1.5 text-xs text-muted-foreground">(test recipient)</span>}
              </span>
              <button
                type="button"
                className="-mr-2 flex h-9 items-center gap-1.5 rounded-md px-2 font-mono text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                onClick={() => {
                  void navigator.clipboard.writeText(c.id);
                  toast.success(`${c.id} copied`);
                }}
                aria-label={`Copy customer ID ${c.id}`}
              >
                {c.id} <Copy className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex justify-between border-t border-dashed border-ink/25 pt-2 font-mono text-xs tabular-nums">
          <span className="text-muted-foreground">Cash in register</span>
          <span>{credits(register)}</span>
        </p>
      </div>
    </section>
  );
}
