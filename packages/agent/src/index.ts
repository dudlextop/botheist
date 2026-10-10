import Anthropic from "@anthropic-ai/sdk";
import { AnthropicProvider, type ModelProvider } from "./provider";
import { MockMiloProvider } from "./mock";
import { getModel } from "./models";

export * from "./models";
export * from "./persona";
export * from "./provider";
export * from "./mock";
export * from "./turn";

let serverAnthropic: AnthropicProvider | null = null;

export interface ProviderOptions {
  /** A Claude API key the player or organizer brought. Used for this provider only, never cached. */
  apiKey?: string | null;
  /** Route to the offline stand-in even if a server key exists. */
  offline?: boolean;
  /** Offline Milo's level (1 rookie … 4 guarded). */
  level?: number;
}

/** Pick the provider for one model call sequence. */
export function providerFor(modelId: string, opts: ProviderOptions = {}): ModelProvider {
  const level = Math.min(4, Math.max(1, Math.round(opts.level ?? 1))) as 1 | 2 | 3 | 4;
  if (getModel(modelId).provider === "mock") return new MockMiloProvider(level);
  if (opts.apiKey) return new AnthropicProvider(new Anthropic({ apiKey: opts.apiKey, maxRetries: 2, timeout: 90_000 }));
  // No key brought: the server's key if configured, otherwise offline Milo.
  if (opts.offline || process.env.BOTHEIST_MOCK_MODELS === "true" || !process.env.ANTHROPIC_API_KEY) return new MockMiloProvider(level);
  serverAnthropic ??= new AnthropicProvider();
  return serverAnthropic;
}

/** Check a Claude API key with a free call (list models). Never logs the key. */
export async function checkApiKey(apiKey: string): Promise<{ ok: true } | { ok: false; reason: "rejected" | "unreachable"; status?: number }> {
  try {
    const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 15_000 });
    await client.models.list({ limit: 1 });
    return { ok: true };
  } catch (err) {
    const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : undefined;
    if (status === 401 || status === 403) return { ok: false, reason: "rejected", status };
    return { ok: false, reason: "unreachable", ...(status ? { status } : {}) };
  }
}
