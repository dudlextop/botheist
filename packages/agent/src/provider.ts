import Anthropic from "@anthropic-ai/sdk";
import { TOOL_SPECS } from "@botheist/engine";
import { getModel, type TokenUsage } from "./models";
import type { Effort } from "./persona";

export type MessageParam = Anthropic.Beta.BetaMessageParam;
export type ContentBlock = Anthropic.Beta.BetaContentBlock;
export type ToolDef = Anthropic.Beta.BetaTool;

export interface ModelRequest {
  model: string;
  effort: Effort;
  system: string;
  tools: ToolDef[];
  messages: MessageParam[];
}

export interface ModelResponse {
  content: ContentBlock[];
  stopReason: string | null;
  usage: TokenUsage;
  /** The model that actually served the response (may differ after a refusal fallback). */
  servedBy: string;
}

export interface ModelProvider {
  readonly name: string;
  complete(req: ModelRequest): Promise<ModelResponse>;
}

/** Cashier tools in the API's shape. `strict` keeps inputs schema-valid. */
export function cashierTools(): ToolDef[] {
  return TOOL_SPECS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as ToolDef["input_schema"],
    strict: true,
  }));
}

/** Upper bound on one response; also bounds per-call cost. */
const MAX_TOKENS = 8000;

export class AnthropicProvider implements ModelProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(client?: Anthropic) {
    this.client = client ?? new Anthropic({ maxRetries: 2, timeout: 90_000 });
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    const spec = getModel(req.model);
    // Thinking is left at the model default (adaptive). History is append-only and
    // assistant content is echoed back unchanged, which preserved thinking requires.
    const res = await this.client.beta.messages.create({
      model: req.model,
      max_tokens: MAX_TOKENS,
      system: req.system,
      tools: req.tools,
      tool_choice: { type: "auto" },
      messages: req.messages,
      output_config: { effort: req.effort },
      cache_control: { type: "ephemeral" },
      ...(spec.serverFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    return { content: res.content, stopReason: res.stop_reason, usage: res.usage, servedBy: res.model };
  }
}
