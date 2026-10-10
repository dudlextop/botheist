import { isToolName, type ToolName } from "@botheist/engine";
import { costMicros } from "./models";
import type { Effort } from "./persona";
import type { ContentBlock, MessageParam, ModelProvider, ToolDef } from "./provider";

export interface ToolExecution {
  /** JSON text returned to the model as the tool_result content. */
  content: string;
  isError: boolean;
  /** The run must end now (e.g. the mission's rule was just broken). */
  stopRun: boolean;
}

export interface TurnHooks {
  executeTool(call: { id: string; name: ToolName; input: Record<string, unknown> }): Promise<ToolExecution>;
  /** Called with each assistant text block as soon as it arrives. */
  onAssistantText?(text: string): Promise<void>;
  /** Called after every model call with its cost, before tools run. */
  onModelCall?(info: { costMicros: number; servedBy: string; stopReason: string | null }): Promise<void>;
}

export interface TurnParams {
  provider: ModelProvider;
  model: string;
  effort: Effort;
  system: string;
  tools: ToolDef[];
  /** Full prior conversation (append-only, assistant content kept verbatim). */
  history: MessageParam[];
  playerMessage: string;
  remainingToolCalls: number;
  remainingBudgetMicros: number;
  /** Safety bound on model calls within one player turn. */
  maxModelCalls?: number;
}

export type TurnOutcome =
  | "replied"
  | "run_stopped"
  | "tool_limit"
  | "call_limit"
  | "budget_exhausted"
  | "refusal"
  | "model_error";

export interface TurnResult {
  outcome: TurnOutcome;
  /** Messages to append to the stored conversation, in order. */
  appended: MessageParam[];
  costMicros: number;
  toolCalls: number;
  error?: string;
}

/**
 * One player turn of the cashier loop. Tool calls run strictly one after another
 * through `hooks.executeTool`, and all results of one assistant message go back
 * in a single user message.
 */
export async function runAgentTurn(params: TurnParams, hooks: TurnHooks): Promise<TurnResult> {
  const appended: MessageParam[] = [{ role: "user", content: params.playerMessage }];
  const messages = () => [...params.history, ...appended];
  let spent = 0;
  let toolCalls = 0;
  const maxCalls = params.maxModelCalls ?? 8;

  for (let i = 0; i < maxCalls; i++) {
    if (spent >= params.remainingBudgetMicros) return { outcome: "budget_exhausted", appended, costMicros: spent, toolCalls };

    let response;
    try {
      response = await params.provider.complete({
        model: params.model,
        effort: params.effort,
        system: params.system,
        tools: params.tools,
        messages: messages(),
      });
    } catch (err) {
      return { outcome: "model_error", appended, costMicros: spent, toolCalls, error: describeError(err) };
    }

    const cost = costMicros(response.servedBy, response.usage);
    spent += cost;
    await hooks.onModelCall?.({ costMicros: cost, servedBy: response.servedBy, stopReason: response.stopReason });
    appended.push({ role: "assistant", content: response.content as MessageParam["content"] });

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) await hooks.onAssistantText?.(block.text);
    }

    if (response.stopReason === "refusal") return { outcome: "refusal", appended, costMicros: spent, toolCalls };
    if (response.stopReason === "max_tokens") {
      // A tool call cut off at the limit must never run.
      return { outcome: "model_error", appended, costMicros: spent, toolCalls, error: "The model hit its output limit" };
    }
    if (response.stopReason === "pause_turn") continue;

    const toolUses = response.content.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");
    if (response.stopReason !== "tool_use" || toolUses.length === 0) {
      return { outcome: "replied", appended, costMicros: spent, toolCalls };
    }

    const results: Array<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }> = [];
    let stop: TurnOutcome | null = null;
    for (const use of toolUses) {
      if (stop) {
        results.push(errorResult(use.id, "NOT_EXECUTED", "This call was not executed because the attempt ended."));
        continue;
      }
      if (toolCalls >= params.remainingToolCalls) {
        results.push(errorResult(use.id, "TOOL_LIMIT", "Tool call limit for this attempt reached."));
        stop = "tool_limit";
        continue;
      }
      if (!isToolName(use.name)) {
        results.push(errorResult(use.id, "UNKNOWN_TOOL", `Tool ${use.name} is not available.`));
        continue;
      }
      toolCalls += 1;
      const exec = await hooks.executeTool({ id: use.id, name: use.name, input: (use.input ?? {}) as Record<string, unknown> });
      results.push({ type: "tool_result", tool_use_id: use.id, content: exec.content, ...(exec.isError ? { is_error: true } : {}) });
      if (exec.stopRun) stop = "run_stopped";
    }
    appended.push({ role: "user", content: results });
    if (stop) return { outcome: stop, appended, costMicros: spent, toolCalls };
  }
  return { outcome: "call_limit", appended, costMicros: spent, toolCalls };
}

function errorResult(id: string, code: string, message: string) {
  return { type: "tool_result" as const, tool_use_id: id, content: JSON.stringify({ code, message }), is_error: true };
}

function describeError(err: unknown): string {
  if (err && typeof err === "object" && "status" in err) {
    const e = err as { status?: number; message?: string };
    return `Model API error${e.status ? ` ${e.status}` : ""}: ${e.message ?? "unknown"}`;
  }
  return err instanceof Error ? err.message : String(err);
}
