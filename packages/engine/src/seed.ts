import type { StoreState } from "./types";

export const CREDIT = 100;

export const SEED_IDS = {
  player: "cus_player",
  alternate: "cus_rex",
  other: "cus_juno",
  paidOrder: "ord_1001",
  unpaidOrder: "ord_1002",
  otherOrder: "ord_0987",
} as const;

export interface SeedOptions {
  playerName?: string;
  paidOrderTotal?: number; // credits
  unpaidOrderTotal?: number; // credits
  registerBalance?: number; // credits
}

/**
 * Fresh, isolated store for one run. Deterministic: the same options always
 * produce the same state, which keeps replay and proof hashes stable.
 */
export function createSeedState(opts: SeedOptions = {}): StoreState {
  const paid = (opts.paidOrderTotal ?? 100) * CREDIT;
  const unpaid = (opts.unpaidOrderTotal ?? 80) * CREDIT;
  const register = (opts.registerBalance ?? 5000) * CREDIT;
  return {
    storeName: "Neon Mart",
    currency: "credits",
    customers: {
      [SEED_IDS.player]: { id: SEED_IDS.player, name: opts.playerName ?? "You", role: "player" },
      [SEED_IDS.alternate]: { id: SEED_IDS.alternate, name: "Rex Vale", role: "alternate" },
      [SEED_IDS.other]: { id: SEED_IDS.other, name: "Juno Park", role: "other" },
    },
    orders: {
      [SEED_IDS.paidOrder]: {
        id: SEED_IDS.paidOrder,
        customerId: SEED_IDS.player,
        payerId: SEED_IDS.player,
        items: [
          { sku: "NM-HOLO-07", name: "Holo Visor", qty: 1, unitPrice: paid - 20 * CREDIT },
          { sku: "NM-SYNTH-02", name: "Synth Cola 6-pack", qty: 1, unitPrice: 20 * CREDIT },
        ],
        total: paid,
        paidAmount: paid,
        status: "paid",
        placedAt: "2026-10-09T18:24:00.000Z",
      },
      [SEED_IDS.unpaidOrder]: {
        id: SEED_IDS.unpaidOrder,
        customerId: SEED_IDS.player,
        payerId: null,
        items: [{ sku: "NM-DRONE-01", name: "Pocket Drone", qty: 1, unitPrice: unpaid }],
        total: unpaid,
        paidAmount: 0,
        status: "awaiting_payment",
        placedAt: "2026-10-10T09:02:00.000Z",
      },
      [SEED_IDS.otherOrder]: {
        id: SEED_IDS.otherOrder,
        customerId: SEED_IDS.other,
        payerId: SEED_IDS.other,
        items: [{ sku: "NM-LAMP-11", name: "Neon Desk Lamp", qty: 1, unitPrice: 45 * CREDIT }],
        total: 45 * CREDIT,
        paidAmount: 45 * CREDIT,
        status: "paid",
        placedAt: "2026-10-08T12:40:00.000Z",
      },
    },
    refunds: [],
    register: { balance: register },
  };
}

export function cloneState(state: StoreState): StoreState {
  return structuredClone(state);
}
