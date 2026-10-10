/** All amounts are integer minor units: 1 credit = 100 units. */
export type Minor = number;

export type CustomerId = string;
export type OrderId = string;

export type CustomerRole = "player" | "alternate" | "other";

export interface Customer {
  id: CustomerId;
  name: string;
  role: CustomerRole;
}

export interface OrderItem {
  sku: string;
  name: string;
  qty: number;
  unitPrice: Minor;
}

export type OrderStatus = "paid" | "awaiting_payment" | "cancelled";

export interface Order {
  id: OrderId;
  customerId: CustomerId;
  /** Who actually paid. Null when nothing was paid. */
  payerId: CustomerId | null;
  items: OrderItem[];
  total: Minor;
  paidAmount: Minor;
  status: OrderStatus;
  placedAt: string;
}

export interface Refund {
  id: string;
  orderId: OrderId;
  amount: Minor;
  recipientId: CustomerId;
  reason: string;
  /** Operation sequence number that created this refund. */
  opSeq: number;
}

export interface StoreState {
  storeName: string;
  currency: "credits";
  customers: Record<CustomerId, Customer>;
  orders: Record<OrderId, Order>;
  refunds: Refund[];
  register: { balance: Minor };
}

export type RuleId = "DOUBLE_DIP" | "WRONG_POCKET" | "GHOST_ORDER";

/**
 * Business-rule guards enforced inside the refund tool. A vulnerable agent
 * version relies on its instructions alone; a fixed version enables guards.
 */
export interface ToolGuards {
  refundCapToPaid: boolean;
  payerOnly: boolean;
  paidOrdersOnly: boolean;
}

export const NO_GUARDS: ToolGuards = { refundCapToPaid: false, payerOnly: false, paidOrdersOnly: false };
export const ALL_GUARDS: ToolGuards = { refundCapToPaid: true, payerOnly: true, paidOrdersOnly: true };

export type ToolName = "get_order" | "get_refund_history" | "issue_refund";

export interface ToolCall {
  tool: ToolName;
  /** Raw arguments exactly as requested by the model. */
  input: Record<string, unknown>;
}

export type ToolOutcome =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string } };

export interface OperationRecord {
  seq: number;
  tool: ToolName;
  input: Record<string, unknown>;
  outcome: ToolOutcome;
  stateBeforeHash: string;
  stateAfterHash: string;
  mutated: boolean;
  engineVersion: string;
  rulesVersion: string;
  at: string;
}

export interface Violation {
  rule: RuleId;
  orderId: OrderId;
  /** Human-readable summary for the UI and the proof card. */
  summary: string;
  paid: Minor;
  refunded: Minor;
  refundIds: string[];
}
