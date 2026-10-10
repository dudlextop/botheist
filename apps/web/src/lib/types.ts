// Shapes returned by our API (see packages/core/src/views.ts).

export type MissionState = "available" | "completed" | "claimed" | "closed";

export interface Challenge {
  id: string;
  slug: string;
  title: string;
  description: string;
  kind: "TRAINING" | "PRIZE";
  status: string;
  /** Players without a Claude key may play this bounty against offline Milo. */
  offlineAllowed: boolean;
  submissionsCloseAt: string | null;
  payoutDeadlineAt: string | null;
  onchainAddress: string | null;
  explorerUrl: string | null;
  limits: { maxMessages: number; maxToolCalls: number; maxDurationSec: number };
  agent: { id: string; name: string; label: string; blurb: string; difficulty: number; model: string; modelLabel: string; configHash: string };
  missions: Array<{
    id: string;
    rule: string;
    title: string;
    objective: string;
    tagline: string;
    ruleText: string;
    rewardLamports: string;
    points: number;
    state: MissionState;
  }>;
}

export interface Customer {
  id: string;
  name: string;
  role: "player" | "alternate" | "other";
}

export interface Order {
  id: string;
  customerId: string;
  payerId: string | null;
  items: Array<{ sku: string; name: string; qty: number; unitPrice: number }>;
  total: number;
  paidAmount: number;
  status: "paid" | "awaiting_payment" | "cancelled";
  placedAt: string;
}

export interface Refund {
  id: string;
  orderId: string;
  amount: number;
  recipientId: string;
  reason: string;
  opSeq: number;
}

export interface StoreState {
  storeName: string;
  customers: Record<string, Customer>;
  orders: Record<string, Order>;
  refunds: Refund[];
  register: { balance: number };
}

export interface RunEvent {
  seq: number;
  type: string;
  payload: Record<string, unknown>;
  at: string;
}

export interface Payout {
  status: string;
  signature: string | null;
  lamports: string;
  recipient: string;
  explorerUrl: string | null;
}

export interface FindingSummary {
  id: string;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  summary: string;
  proofHash: string | null;
  decisiveSeq: number | null;
  paid: number | null;
  refunded: number | null;
  rejectionReason: string | null;
  payout: Payout | null;
}

export interface RunView {
  id: string;
  status: "ACTIVE" | "WON" | "LOST" | "EXPIRED" | "MODEL_ERROR" | "ABORTED";
  endReason: string | null;
  busy: boolean;
  wallet: string | null;
  startedAt: string;
  expiresAt: string;
  finishedAt: string | null;
  playerMessages: number;
  toolCalls: number;
  limits: { maxMessages: number; maxToolCalls: number; maxDurationSec: number };
  campaign: { id: string; slug: string; title: string; kind: "TRAINING" | "PRIZE" };
  mission: {
    id: string;
    rule: string;
    title: string;
    objective: string;
    briefing: string;
    ruleText: string;
    winCondition: string;
    rewardLamports: string;
    points: number;
  };
  agent: { name: string; label: string; model: string; modelLabel: string; difficulty: number; configHash: string };
  /** Who ran Milo for this attempt. */
  brain: "OFFLINE" | "PLAYER_KEY" | "SERVER_KEY";
  seedState: StoreState;
  state: StoreState;
  finding: FindingSummary | null;
  events: RunEvent[];
  lastSeq: number;
  cluster: string;
}
