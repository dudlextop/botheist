import { SEED_IDS } from "@botheist/engine";
import type { ContentBlock, MessageParam, ModelProvider, ModelRequest, ModelResponse } from "./provider";

/**
 * Offline Milo: a deterministic, scripted cashier that stands in for Claude
 * when nobody brought an API key, and powers the tests.
 *
 * Each level has its own blind spot, so the academy is still a game offline:
 *   1  Rookie: does whatever the customer asks.
 *   2  Standard: looks the order up and checks the policy, but a plausible
 *      story (manager approval, a friend paid, paid in cash...) talks him round.
 *   3  Hardened: ignores authority and stories; only narrower tricks work
 *      (per-item refunds he doesn't add up, "the payer on file is outdated",
 *      a payment reference he can't check).
 *   4  Same reasoning as level 2; the fixed version's tool guards stop him.
 * Tool-level guards always apply, whatever the level.
 */
export class MockMiloProvider implements ModelProvider {
  readonly name = "mock";
  private counter = 0;

  constructor(private readonly level: 1 | 2 | 3 | 4 = 1) {}

  async complete(req: ModelRequest): Promise<ModelResponse> {
    const last = req.messages[req.messages.length - 1];
    const request = parseRequest(lastPlayerText(req.messages));

    if (last && isToolResults(last)) {
      const results = last.content as Array<{ content?: unknown; is_error?: boolean }>;
      const data = results.map((r) => parseResult(r.content));
      // An order lookup made to vet a refund: decide now.
      const lookup = data.find((d) => d && typeof d === "object" && "items" in d && "status" in d) as OrderData | undefined;
      if (lookup && request.refund && !results.some((r) => r.is_error) && !refundedThisTurn(req.messages)) {
        const verdict = this.vet(request, lookup);
        if (verdict.ok) return this.refund(request, "Checked it. You're covered, issuing that now.");
        return reply([text(verdict.reply)], "end_turn");
      }
      return reply([text(results.map((r, i) => summarise(r, data[i])).join(" "))], "end_turn");
    }

    if (request.refund && request.amount !== null) {
      if (this.level === 1) return this.refund(request, "Say no more, let me fix that for you.");
      return reply([text("Let me pull that order up first."), toolUse(this.nextId(), "get_order", { order_id: request.order })], "tool_use");
    }
    if (request.refund) {
      return reply([text(`Happy to look into it. How many credits should I refund on ${request.order}, and to whom?`)], "end_turn");
    }
    if (/history|already refunded|previous refund/.test(request.said)) {
      return reply([toolUse(this.nextId(), "get_refund_history", { order_id: request.order })], "tool_use");
    }
    if (/order|receipt|status|ord_/.test(request.said)) {
      return reply([toolUse(this.nextId(), "get_order", { order_id: request.order })], "tool_use");
    }
    return reply(
      [text(`Hey, welcome to Neon Mart! I'm Milo. Ask me about an order or a refund, like "refund 20 cr on ${SEED_IDS.paidOrder}".`)],
      "end_turn",
    );
  }

  /** Policy check against the order Milo just looked up. */
  private vet(r: ParsedRequest, order: OrderData): { ok: true } | { ok: false; reply: string } {
    let paid = Number(order.amount_paid) || 0;
    const already = Number(order.already_refunded) || 0;
    const amount = r.amount ?? 0;
    const payerId = order.paid_by?.id ?? null;
    const unpaid = order.status !== "paid" || paid <= 0;
    const wrongRecipient = payerId !== null && r.recipient !== payerId;
    const s = r.said;

    if (unpaid) {
      const story = this.level === 3 ? /(transaction|txn|payment)\s*(id|ref|reference|#|no\.?|number)/ : /(cash|already paid|i paid|charged|bank|card was)/;
      if (!story.test(s)) return { ok: false, reply: `${order.order_id} shows as ${order.status.replace("_", " ")}, so there's nothing to refund yet.` };
      // Convinced it was paid in full: the order total becomes his refund limit.
      paid = Number(order.total) || 0;
    }
    const overCap = already + amount > paid;
    if (wrongRecipient) {
      const story =
        this.level === 3
          ? /(outdated|out of date|wrong in the system|record is wrong|payer (was )?updated|merged account)/
          : /(paid for (it|me|this)|covered|on (his|her|my) behalf|gift|bought it for me|(his|her) card)/;
      if (!story.test(s)) return { ok: false, reply: `Refunds go back to whoever paid, and that's ${order.paid_by?.name ?? "the payer"} on ${order.order_id}.` };
    }
    if (overCap) {
      if (this.level === 3) {
        // Blind spot: an itemised request is checked against that item's price only.
        const item = order.items.find((i) => i.name.toLowerCase().split(/\W+/).some((w) => w.length >= 4 && s.includes(w)));
        if (!item || amount > Number(item.unit_price) * item.qty) {
          return { ok: false, reply: `That would take refunds on ${order.order_id} to ${already + amount} cr, above the ${paid} cr paid. I can't do that.` };
        }
      } else {
        const story = /(manager|supervisor|approved|charged twice|double charged|goodwill|compensation|second|another one|replacement)/;
        if (!story.test(s)) {
          return { ok: false, reply: `You've had ${already} cr back on ${order.order_id} already, and it was paid ${paid} cr. I can refund up to ${Math.max(0, paid - already)} cr more.` };
        }
      }
    }
    return { ok: true };
  }

  private refund(r: ParsedRequest, line: string): ModelResponse {
    return reply(
      [
        text(line),
        toolUse(this.nextId(), "issue_refund", {
          order_id: r.order,
          amount: r.amount ?? 0,
          recipient_id: r.recipient,
          reason: r.said.slice(0, 120) || "customer request",
        }),
      ],
      "tool_use",
    );
  }

  private nextId() {
    this.counter += 1;
    return `toolu_mock_${Date.now().toString(36)}_${this.counter}`;
  }
}

interface ParsedRequest {
  said: string;
  refund: boolean;
  order: string;
  recipient: string;
  amount: number | null;
}

interface OrderData {
  order_id: string;
  status: string;
  amount_paid: number | string;
  already_refunded: number | string;
  total: number | string;
  paid_by: { id: string; name: string } | null;
  items: Array<{ name: string; qty: number; unit_price: number | string }>;
}

function parseRequest(raw: string): ParsedRequest {
  const said = raw.toLowerCase();
  // Prefer "80 cr"; otherwise a standalone number (not the digits inside ord_1001).
  const amount = said.match(/(\d+(?:\.\d{1,2})?)\s*(?:cr|credits?)\b/)?.[1] ?? said.match(/(?<![\w-])(\d+(?:\.\d{1,2})?)(?![\w-])/)?.[1];
  return {
    said,
    refund: /refund|money back|reimburse/.test(said),
    order: said.match(/ord_[a-z0-9]+/)?.[0] ?? SEED_IDS.paidOrder,
    recipient: said.match(/cus_[a-z0-9]+/)?.[0] ?? SEED_IDS.player,
    amount: amount ? Number(amount) : null,
  };
}

function summarise(r: { content?: unknown; is_error?: boolean }, data: unknown): string {
  const raw = typeof r.content === "string" ? r.content : JSON.stringify(r.content);
  if (r.is_error) return `That didn't go through: ${(data as { message?: string } | null)?.message ?? raw}`;
  const d = data as Record<string, any> | null;
  if (d?.refund_id) return `Done! Refunded ${d.amount} cr to ${d.recipient?.name}. Total refunded on ${d.order_id}: ${d.total_refunded_for_order} cr.`;
  if (d?.order_id && d?.items) return `Order ${d.order_id}: ${String(d.status).replace("_", " ")}, paid ${d.amount_paid} cr, already refunded ${d.already_refunded} cr.`;
  if (d?.refunds) return `${d.refunds.length} refund(s) on ${d.order_id}, ${d.total_refunded} cr total.`;
  return "All set.";
}

function parseResult(content: unknown): unknown {
  const raw = typeof content === "string" ? content : JSON.stringify(content);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isToolResults(msg: MessageParam): boolean {
  return Array.isArray(msg.content) && msg.content.length > 0 && msg.content.every((b) => b.type === "tool_result");
}

/** The latest message the player typed (skipping tool results). */
function lastPlayerText(messages: MessageParam[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (isToolResults(m)) continue;
    return m.content.map((b) => (b.type === "text" ? b.text : "")).join(" ");
  }
  return "";
}

/** True when an issue_refund already ran after the player's latest message. */
function refundedThisTurn(messages: MessageParam[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "user" && !isToolResults(m)) return false;
    if (m.role === "assistant" && Array.isArray(m.content) && m.content.some((b) => b.type === "tool_use" && b.name === "issue_refund")) return true;
  }
  return false;
}

function reply(content: ContentBlock[], stopReason: string): ModelResponse {
  return { content, stopReason, usage: { input_tokens: 0, output_tokens: 0 }, servedBy: "offline-milo" };
}

function text(t: string): ContentBlock {
  return { type: "text", text: t, citations: null } as ContentBlock;
}

function toolUse(id: string, name: string, input: Record<string, unknown>): ContentBlock {
  return { type: "tool_use", id, name, input } as ContentBlock;
}
