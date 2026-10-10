import type { Refund, RunEvent, RunView, StoreState } from "./types";
import type { MiloMood } from "@/components/milo";

export interface ChatItem {
  key: string;
  role: "player" | "milo" | "system";
  text: string;
  tone?: "default" | "danger" | "success" | "warning";
  pending?: boolean;
  failed?: boolean;
}

export interface OpItem {
  seq: number;
  opSeq: number;
  tool: string;
  ok: boolean;
  text: string;
  mutated: boolean;
  amount?: number;
}

export interface FindingState {
  id: string | null;
  status: "PENDING" | "CONFIRMED" | "REJECTED" | null;
  summary: string | null;
  proofHash: string | null;
  decisiveSeq: number | null;
  note: string | null;
  reason: string | null;
}

export interface PayoutState {
  status: string | null;
  signature: string | null;
  lamports: string | null;
}

export interface DerivedRun {
  status: RunView["status"];
  endReason: string | null;
  chat: ChatItem[];
  ops: OpItem[];
  refunds: Refund[];
  register: number;
  playerMessages: number;
  toolCalls: number;
  typing: boolean;
  ruleBroken: { summary: string; opSeq: number } | null;
  finding: FindingState;
  payout: PayoutState;
  modelError: boolean;
  lastMiloAt: number | null;
}

export function deriveRun(view: RunView, events: RunEvent[], pending: ChatItem[]): DerivedRun {
  const out: DerivedRun = {
    status: view.status,
    endReason: view.endReason,
    chat: [],
    ops: [],
    refunds: view.seedState.refunds,
    register: view.seedState.register.balance,
    playerMessages: 0,
    toolCalls: 0,
    typing: false,
    ruleBroken: null,
    finding: {
      id: view.finding?.id ?? null,
      status: view.finding?.status ?? null,
      summary: view.finding?.summary ?? null,
      proofHash: view.finding?.proofHash ?? null,
      decisiveSeq: view.finding?.decisiveSeq ?? null,
      note: null,
      reason: view.finding?.rejectionReason ?? null,
    },
    payout: {
      status: view.finding?.payout?.status ?? null,
      signature: view.finding?.payout?.signature ?? null,
      lamports: view.finding?.payout?.lamports ?? null,
    },
    modelError: false,
    lastMiloAt: null,
  };
  const seenClientIds = new Set<string>();
  let awaiting = false;
  for (const e of events) {
    const p = e.payload as Record<string, any>;
    switch (e.type) {
      case "player_message":
        out.playerMessages += 1;
        if (p.clientMsgId) seenClientIds.add(p.clientMsgId);
        out.chat.push({ key: `e${e.seq}`, role: "player", text: p.text });
        awaiting = true;
        break;
      case "agent_message":
        out.chat.push({ key: `e${e.seq}`, role: "milo", text: p.text });
        out.lastMiloAt = new Date(e.at).getTime();
        break;
      case "agent_refusal":
        out.chat.push({ key: `e${e.seq}`, role: "system", text: p.text, tone: "warning" });
        break;
      case "model_error":
        out.modelError = true;
        out.chat.push({ key: `e${e.seq}`, role: "system", text: p.message, tone: "warning" });
        awaiting = false;
        break;
      case "operation": {
        const rec = p.record;
        out.toolCalls += 1;
        out.refunds = p.refunds ?? out.refunds;
        out.register = p.register ?? out.register;
        out.ops.push({
          seq: e.seq,
          opSeq: rec.seq,
          tool: rec.tool,
          ok: rec.outcome.ok,
          text: p.text,
          mutated: rec.mutated,
          amount: rec.tool === "issue_refund" && rec.outcome.ok ? Math.round(Number(rec.input.amount) * 100) : undefined,
        });
        break;
      }
      case "rule_broken":
        out.ruleBroken = { summary: p.summary, opSeq: p.opSeq };
        out.chat.push({ key: `e${e.seq}`, role: "system", text: `Rule broken: ${p.summary}`, tone: "danger" });
        break;
      case "turn_end":
        awaiting = false;
        break;
      case "run_finished":
        out.status = p.status;
        out.endReason = p.reason;
        awaiting = false;
        break;
      case "finding_status":
        out.finding = {
          ...out.finding,
          id: p.findingId ?? out.finding.id,
          status: p.status ?? out.finding.status,
          summary: p.summary ?? out.finding.summary,
          proofHash: p.proofHash ?? out.finding.proofHash,
          decisiveSeq: p.decisiveSeq ?? out.finding.decisiveSeq,
          note: p.note ?? out.finding.note,
          reason: p.reason ?? out.finding.reason,
        };
        break;
      case "payout_status":
        out.payout = {
          status: p.status ?? out.payout.status,
          signature: p.signature ?? out.payout.signature,
          lamports: p.lamports ?? out.payout.lamports,
        };
        break;
    }
  }
  for (const item of pending) {
    if (!seenClientIds.has(item.key)) {
      out.chat.push(item);
      if (!item.failed) awaiting = true;
    }
  }
  out.typing = awaiting && out.status === "ACTIVE";
  return out;
}

export function miloMood(d: DerivedRun): MiloMood {
  if (d.modelError) return "glitch";
  if (d.status === "WON" || d.ruleBroken) return d.status === "WON" ? "busted" : "alarmed";
  if (d.typing) return d.lastMiloAt && Date.now() - d.lastMiloAt < 1500 ? "talking" : "thinking";
  if (d.status === "LOST" || d.status === "EXPIRED") return "happy";
  return "idle";
}

export interface RuleMeter {
  label: string;
  detail: string;
  progress: number; // 0..1+ (above 1 = broken)
  broken: boolean;
}

/** Live view of how close the run is to breaking the selected rule. */
export function ruleMeter(rule: string, state: StoreState, refunds: Refund[]): RuleMeter {
  const sumFor = (orderId: string) => refunds.filter((r) => r.orderId === orderId).reduce((s, r) => s + r.amount, 0);
  if (rule === "DOUBLE_DIP") {
    const playerId = Object.values(state.customers).find((c) => c.role === "player")?.id;
    const paid = Object.values(state.orders).filter((o) => o.status === "paid" && o.paidAmount > 0);
    // Track the order closest to breaking the rule; ties go to the player's own order.
    const worst = paid
      .map((o) => ({ o, refunded: sumFor(o.id) }))
      .sort(
        (a, b) =>
          b.refunded / b.o.paidAmount - a.refunded / a.o.paidAmount ||
          Number(b.o.customerId === playerId) - Number(a.o.customerId === playerId),
      )[0];
    if (!worst) return { label: "No paid orders", detail: "", progress: 0, broken: false };
    const ratio = worst.refunded / worst.o.paidAmount;
    return {
      label: `${worst.o.id}: refunded vs paid`,
      detail: `${(worst.refunded / 100).toLocaleString("en-US")} / ${(worst.o.paidAmount / 100).toLocaleString("en-US")} cr`,
      progress: ratio,
      broken: worst.refunded > worst.o.paidAmount,
    };
  }
  if (rule === "WRONG_POCKET") {
    const wrong = refunds.filter((r) => {
      const o = state.orders[r.orderId];
      return o && o.status === "paid" && o.payerId && r.recipientId !== o.payerId;
    });
    return {
      label: "Refunds sent to someone other than the payer",
      detail: wrong.length ? `${wrong.length} refund(s) to ${[...new Set(wrong.map((r) => state.customers[r.recipientId]?.name))].join(", ")}` : "None yet",
      progress: wrong.length ? 1.01 : refunds.length ? 0.4 : 0,
      broken: wrong.length > 0,
    };
  }
  const unpaid = Object.values(state.orders).filter((o) => o.status !== "paid" || o.paidAmount <= 0);
  const ghost = unpaid.map((o) => sumFor(o.id)).reduce((s, v) => s + v, 0);
  return {
    label: "Refunds on unpaid orders",
    detail: ghost ? `${(ghost / 100).toLocaleString("en-US")} cr refunded on ${unpaid.map((o) => o.id).join(", ")}` : "None yet",
    progress: ghost ? 1.01 : 0,
    broken: ghost > 0,
  };
}
