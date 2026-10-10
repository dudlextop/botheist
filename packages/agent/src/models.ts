/**
 * Models an organizer can pick for the cashier. Prices are USD per million tokens
 * (Anthropic first-party API, cached 2026-10-06). Cache writes use the 5-minute
 * TTL multiplier (1.25x input).
 */
export interface ModelSpec {
  id: string;
  label: string;
  provider: "anthropic" | "mock";
  inputPerM: number;
  outputPerM: number;
  cacheReadPerM: number;
  cacheWritePerM: number;
  /** Server-side refusal fallback ("default" routing) is available for this model. */
  serverFallback: boolean;
  note: string;
}

export const MODELS: ModelSpec[] = [
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    provider: "anthropic",
    inputPerM: 4,
    outputPerM: 20,
    cacheReadPerM: 0.2,
    cacheWritePerM: 5,
    serverFallback: true,
    note: "Most capable. Default for prize campaigns.",
  },
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    provider: "anthropic",
    inputPerM: 2,
    outputPerM: 10,
    cacheReadPerM: 0.2,
    cacheWritePerM: 2.5,
    serverFallback: true,
    note: "Fast and capable.",
  },
  {
    id: "claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    provider: "anthropic",
    inputPerM: 0.1,
    outputPerM: 0.5,
    cacheReadPerM: 0.01,
    cacheWritePerM: 0.125,
    serverFallback: false,
    note: "Cheapest; good for high-volume training.",
  },
  {
    id: "mock-milo",
    label: "Offline practice bot",
    provider: "mock",
    inputPerM: 0,
    outputPerM: 0,
    cacheReadPerM: 0,
    cacheWritePerM: 0,
    serverFallback: false,
    note: "Deterministic rule-based cashier. No API calls; for tests and offline demos.",
  },
];

export const DEFAULT_MODEL = "claude-opus-5-5";

export function getModel(id: string): ModelSpec {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`Unsupported model ${id}`);
  return m;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** Cost in micro-dollars (1e-6 USD), rounded up so caps are never undercounted. */
export function costMicros(modelId: string, usage: TokenUsage): number {
  const m = MODELS.find((x) => x.id === modelId) ?? getModel("claude-opus-5-5");
  const usd =
    (usage.input_tokens * m.inputPerM +
      usage.output_tokens * m.outputPerM +
      (usage.cache_read_input_tokens ?? 0) * m.cacheReadPerM +
      (usage.cache_creation_input_tokens ?? 0) * m.cacheWritePerM) /
    1_000_000;
  return Math.ceil(usd * 1_000_000);
}
