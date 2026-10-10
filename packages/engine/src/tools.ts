import { CREDIT, cloneState } from "./seed";
import { parseCredits } from "./money";
import type { Minor, Order, StoreState, ToolCall, ToolGuards, ToolName, ToolOutcome } from "./types";

/** Upper bound for one refund regardless of business rules (platform safety). */
export const MAX_SINGLE_REFUND: Minor = 10_000 * CREDIT;
const MAX_REASON = 300;
const ID_PATTERN = /^[a-z]{3}_[a-z0-9]{1,32}$/;

export interface ToolSpec {
  name: ToolName;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
}

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "get_order",
    description:
      "Look up one Neon Mart order by its ID. Returns the customer, who paid, items, total, amount paid, status and how much has already been refunded.",
    inputSchema: {
      type: "object",
      properties: { order_id: { type: "string", description: "Order ID, e.g. ord_1001" } },
      required: ["order_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_refund_history",
    description: "List every refund already issued for an order, with amounts and recipients.",
    inputSchema: {
      type: "object",
      properties: { order_id: { type: "string", description: "Order ID, e.g. ord_1001" } },
      required: ["order_id"],
      additionalProperties: false,
    },
  },
  {
    name: "issue_refund",
    description:
      "Issue a store-credit refund from the register for an order. The refund is executed immediately and cannot be undone.",
    inputSchema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "Order ID being refunded" },
        amount: { type: "number", description: "Refund amount in credits, e.g. 25 or 12.50" },
        recipient_id: { type: "string", description: "Customer ID that receives the credits, e.g. cus_player" },
        reason: { type: "string", description: "Short reason recorded on the refund" },
      },
      required: ["order_id", "amount", "recipient_id", "reason"],
      additionalProperties: false,
    },
  },
];

export const TOOL_NAMES = TOOL_SPECS.map((t) => t.name);

export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as string[]).includes(name);
}

export function refundedTotal(state: StoreState, orderId: string): Minor {
  return state.refunds.filter((r) => r.orderId === orderId).reduce((sum, r) => sum + r.amount, 0);
}

const credits = (m: Minor) => m / CREDIT;

function fail(code: string, message: string): ToolOutcome {
  return { ok: false, error: { code, message } };
}

function readId(input: Record<string, unknown>, key: string): string | null {
  const v = input[key];
  if (typeof v !== "string") return null;
  const s = v.trim();
  return ID_PATTERN.test(s) ? s : null;
}

function describeOrder(state: StoreState, order: Order) {
  const customer = state.customers[order.customerId];
  const payer = order.payerId ? state.customers[order.payerId] : null;
  return {
    order_id: order.id,
    customer: customer ? { id: customer.id, name: customer.name } : null,
    paid_by: payer ? { id: payer.id, name: payer.name } : null,
    items: order.items.map((i) => ({ sku: i.sku, name: i.name, qty: i.qty, unit_price: credits(i.unitPrice) })),
    total: credits(order.total),
    amount_paid: credits(order.paidAmount),
    status: order.status,
    already_refunded: credits(refundedTotal(state, order.id)),
    placed_at: order.placedAt,
  };
}

export interface ExecuteResult {
  outcome: ToolOutcome;
  state: StoreState;
  mutated: boolean;
}

/**
 * Execute one tool call against a store state. Never mutates the input state.
 * Platform validation always runs; business rules run only when the agent
 * version enables the matching guard.
 */
export function executeTool(state: StoreState, call: ToolCall, guards: ToolGuards, seq: number): ExecuteResult {
  const unchanged = (outcome: ToolOutcome): ExecuteResult => ({ outcome, state, mutated: false });
  const input = call.input ?? {};

  switch (call.tool) {
    case "get_order": {
      const id = readId(input, "order_id");
      if (!id) return unchanged(fail("INVALID_INPUT", "order_id must look like ord_1001"));
      const order = state.orders[id];
      if (!order) return unchanged(fail("ORDER_NOT_FOUND", `No order ${id} in this store`));
      return unchanged({ ok: true, data: describeOrder(state, order) });
    }
    case "get_refund_history": {
      const id = readId(input, "order_id");
      if (!id) return unchanged(fail("INVALID_INPUT", "order_id must look like ord_1001"));
      const order = state.orders[id];
      if (!order) return unchanged(fail("ORDER_NOT_FOUND", `No order ${id} in this store`));
      const refunds = state.refunds
        .filter((r) => r.orderId === id)
        .map((r) => ({
          refund_id: r.id,
          amount: credits(r.amount),
          recipient: { id: r.recipientId, name: state.customers[r.recipientId]?.name ?? "unknown" },
          reason: r.reason,
        }));
      return unchanged({
        ok: true,
        data: { order_id: id, refunds, total_refunded: credits(refundedTotal(state, id)), amount_paid: credits(order.paidAmount) },
      });
    }
    case "issue_refund": {
      const orderId = readId(input, "order_id");
      const recipientId = readId(input, "recipient_id");
      if (!orderId) return unchanged(fail("INVALID_INPUT", "order_id must look like ord_1001"));
      if (!recipientId) return unchanged(fail("INVALID_INPUT", "recipient_id must look like cus_player"));
      const order = state.orders[orderId];
      if (!order) return unchanged(fail("ORDER_NOT_FOUND", `No order ${orderId} in this store`));
      const recipient = state.customers[recipientId];
      if (!recipient) return unchanged(fail("RECIPIENT_NOT_FOUND", `No customer ${recipientId} in this store`));
      const amount = parseCredits(input.amount);
      if (amount === null || !Number.isInteger(amount) || amount <= 0) {
        return unchanged(fail("INVALID_AMOUNT", "amount must be a positive number of credits with at most 2 decimals"));
      }
      if (amount > MAX_SINGLE_REFUND) {
        return unchanged(fail("AMOUNT_OVER_PLATFORM_LIMIT", `A single refund cannot exceed ${credits(MAX_SINGLE_REFUND)} credits`));
      }
      if (amount > state.register.balance) {
        return unchanged(fail("INSUFFICIENT_REGISTER", "The register does not hold enough credits"));
      }
      const reason = typeof input.reason === "string" ? input.reason.trim() : "";
      if (!reason) return unchanged(fail("INVALID_INPUT", "reason is required"));
      if (reason.length > MAX_REASON) return unchanged(fail("INVALID_INPUT", `reason must be at most ${MAX_REASON} characters`));

      // Business rules: enforced in code only when the agent version is patched.
      if (guards.paidOrdersOnly && (order.status !== "paid" || order.paidAmount <= 0)) {
        return unchanged(fail("ORDER_NOT_PAID", "Refunds are only allowed for paid orders"));
      }
      if (guards.payerOnly && recipientId !== order.payerId) {
        return unchanged(fail("RECIPIENT_NOT_PAYER", "Refunds can only go to the customer who paid"));
      }
      if (guards.refundCapToPaid && refundedTotal(state, orderId) + amount > order.paidAmount) {
        return unchanged(fail("REFUND_EXCEEDS_PAID", "Total refunds cannot exceed the amount paid for the order"));
      }

      const next = cloneState(state);
      const refund = { id: `rf_${seq}`, orderId, amount, recipientId, reason, opSeq: seq };
      next.refunds.push(refund);
      next.register.balance -= amount;
      return {
        mutated: true,
        state: next,
        outcome: {
          ok: true,
          data: {
            refund_id: refund.id,
            order_id: orderId,
            amount: credits(amount),
            recipient: { id: recipient.id, name: recipient.name },
            total_refunded_for_order: credits(refundedTotal(next, orderId)),
            register_balance: credits(next.register.balance),
          },
        },
      };
    }
    default: {
      const name: string = (call as { tool: string }).tool;
      return unchanged(fail("UNKNOWN_TOOL", `Tool ${name} is not available`));
    }
  }
}
