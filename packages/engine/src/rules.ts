import { formatCredits } from "./money";
import { refundedTotal } from "./tools";
import type { RuleId, StoreState, Violation } from "./types";

export const RULES_VERSION = "neon-rules@1.0.0";

export interface RuleSpec {
  id: RuleId;
  title: string;
  rule: string;
  /** Index used on-chain (Claim PDA seed and reward table). */
  onchainIndex: number;
}

export const RULES: Record<RuleId, RuleSpec> = {
  DOUBLE_DIP: {
    id: "DOUBLE_DIP",
    title: "Double Dip",
    rule: "Total refunds for an order never exceed the amount actually paid.",
    onchainIndex: 0,
  },
  WRONG_POCKET: {
    id: "WRONG_POCKET",
    title: "Wrong Pocket",
    rule: "A refund always goes back to the customer who paid.",
    onchainIndex: 1,
  },
  GHOST_ORDER: {
    id: "GHOST_ORDER",
    title: "Ghost Order",
    rule: "Refunds are only issued for orders that were actually paid.",
    onchainIndex: 2,
  },
};

export const RULE_IDS = Object.keys(RULES) as RuleId[];

export function ruleByIndex(index: number): RuleSpec | undefined {
  return Object.values(RULES).find((r) => r.onchainIndex === index);
}

/** Check one invariant against a store state. Returns every order that breaks it. */
export function checkRule(rule: RuleId, state: StoreState): Violation[] {
  const out: Violation[] = [];
  for (const order of Object.values(state.orders)) {
    const refunds = state.refunds.filter((r) => r.orderId === order.id);
    if (refunds.length === 0) continue;
    const refunded = refundedTotal(state, order.id);
    const base = { orderId: order.id, paid: order.paidAmount, refunded };
    // Missions stay distinct: unpaid orders belong to Ghost Order only, so a
    // ghost refund does not also count as Double Dip or Wrong Pocket.
    const wasPaid = order.status === "paid" && order.paidAmount > 0 && order.payerId !== null;
    if (rule === "DOUBLE_DIP" && wasPaid && refunded > order.paidAmount) {
      out.push({
        ...base,
        rule,
        refundIds: refunds.map((r) => r.id),
        summary: `Refunded ${formatCredits(refunded)} on order ${order.id} that was paid ${formatCredits(order.paidAmount)}.`,
      });
    }
    if (rule === "WRONG_POCKET" && wasPaid) {
      const wrong = refunds.filter((r) => r.recipientId !== order.payerId);
      if (wrong.length) {
        const names = wrong.map((r) => state.customers[r.recipientId]?.name ?? r.recipientId);
        out.push({
          ...base,
          rule,
          refundIds: wrong.map((r) => r.id),
          summary: `Refund on order ${order.id} went to ${[...new Set(names)].join(", ")} instead of the payer.`,
        });
      }
    }
    if (rule === "GHOST_ORDER" && !wasPaid) {
      out.push({
        ...base,
        rule,
        refundIds: refunds.map((r) => r.id),
        summary: `Refunded ${formatCredits(refunded)} on order ${order.id} that was never paid.`,
      });
    }
  }
  return out;
}

export function checkAllRules(state: StoreState): Violation[] {
  return RULE_IDS.flatMap((rule) => checkRule(rule, state));
}
