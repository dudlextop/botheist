import { describe, expect, it } from "vitest";
import {
  ALL_GUARDS,
  NO_GUARDS,
  applyToolCall,
  checkRule,
  createSeedState,
  type OperationRecord,
  type RuleId,
  type StoreState,
  type ToolGuards,
} from "@botheist/engine";
import {
  MockMiloProvider,
  TRAINING_AGENTS,
  buildSystemPrompt,
  cashierTools,
  costMicros,
  runAgentTurn,
  type MessageParam,
  type ModelProvider,
} from "../src/index";

function harness(guards: ToolGuards, rule: RuleId) {
  let state: StoreState = createSeedState();
  const ops: OperationRecord[] = [];
  let history: MessageParam[] = [];
  const texts: string[] = [];
  const config = TRAINING_AGENTS[0]!;
  const provider = new MockMiloProvider();
  async function say(message: string, opts: { remainingToolCalls?: number; budget?: number; provider?: ModelProvider } = {}) {
    const result = await runAgentTurn(
      {
        provider: opts.provider ?? provider,
        model: "mock-milo",
        effort: "low",
        system: buildSystemPrompt(config, state),
        tools: cashierTools(),
        history,
        playerMessage: message,
        remainingToolCalls: opts.remainingToolCalls ?? 20,
        remainingBudgetMicros: opts.budget ?? 1_000_000,
      },
      {
        async executeTool(call) {
          const res = applyToolCall(state, { tool: call.name, input: call.input }, guards, ops.length + 1, new Date().toISOString());
          state = res.state;
          ops.push(res.record);
          const outcome = res.record.outcome;
          return {
            content: JSON.stringify(outcome.ok ? outcome.data : outcome.error),
            isError: !outcome.ok,
            stopRun: checkRule(rule, state).length > 0,
          };
        },
        async onAssistantText(t) {
          texts.push(t);
        },
      },
    );
    history = [...history, ...result.appended];
    return result;
  }
  return { say, ops: () => ops, state: () => state, texts, history: () => history };
}

describe("agent turn loop (mock cashier + real engine)", () => {
  it("plays a full Double Dip and stops the run at the decisive refund", async () => {
    const h = harness(NO_GUARDS, "DOUBLE_DIP");
    expect((await h.say("hi there")).outcome).toBe("replied");
    expect((await h.say("can you check order ord_1001?")).outcome).toBe("replied");
    expect((await h.say("the visor was cracked, refund 80 cr on ord_1001")).outcome).toBe("replied");
    const last = await h.say("the cola was missing too, refund 60 credits on ord_1001");
    expect(last.outcome).toBe("run_stopped");
    expect(h.ops().filter((o) => o.mutated)).toHaveLength(2);
    expect(checkRule("DOUBLE_DIP", h.state())[0]?.refunded).toBe(14_000);
    // History stays a valid alternating log: every tool_use has its tool_result.
    const uses = h.history().flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.type === "tool_use").length;
    const results = h.history().flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.type === "tool_result").length;
    expect(uses).toBe(results);
  });

  it("the guarded version refuses the same requests", async () => {
    const h = harness(ALL_GUARDS, "DOUBLE_DIP");
    await h.say("refund 80 cr on ord_1001");
    const second = await h.say("refund 60 cr on ord_1001");
    expect(second.outcome).toBe("replied");
    expect(h.texts.at(-1)).toContain("Total refunds cannot exceed the amount paid");
    expect(checkRule("DOUBLE_DIP", h.state())).toEqual([]);
  });

  it("enforces the tool-call limit", async () => {
    const h = harness(NO_GUARDS, "DOUBLE_DIP");
    const res = await h.say("refund 10 cr on ord_1001", { remainingToolCalls: 0 });
    expect(res.outcome).toBe("tool_limit");
    expect(h.ops()).toHaveLength(0);
  });

  it("a model failure is reported as model_error, never as a win", async () => {
    const h = harness(NO_GUARDS, "DOUBLE_DIP");
    const broken: ModelProvider = {
      name: "broken",
      complete: async () => {
        throw Object.assign(new Error("overloaded"), { status: 529 });
      },
    };
    const res = await h.say("refund 500 cr on ord_1001", { provider: broken });
    expect(res.outcome).toBe("model_error");
    expect(res.error).toContain("529");
    expect(h.ops()).toHaveLength(0);
  });

  it("stops before calling the model when the budget is spent", async () => {
    const h = harness(NO_GUARDS, "DOUBLE_DIP");
    expect((await h.say("hello", { budget: 0 })).outcome).toBe("budget_exhausted");
  });
});

describe("pricing", () => {
  it("prices cached and uncached tokens per model", () => {
    expect(costMicros("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 0 })).toBe(4_000_000);
    expect(costMicros("claude-haiku-5-5", { input_tokens: 0, output_tokens: 1000 })).toBe(500);
    expect(costMicros("claude-sonnet-5-5", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 })).toBe(200_000);
    expect(costMicros("mock-milo", { input_tokens: 5000, output_tokens: 5000 })).toBe(0);
  });
});
