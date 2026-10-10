import { hashValue } from "./hash";
import { RULES_VERSION } from "./rules";
import { executeTool } from "./tools";
import type { OperationRecord, StoreState, ToolCall, ToolGuards } from "./types";

export const ENGINE_VERSION = "neon-mart-engine@1.0.0";

export function stateHash(state: StoreState): string {
  return hashValue(state);
}

/**
 * Apply one tool call and produce the operation record stored in the run log.
 * The caller is responsible for running calls of one run strictly in sequence.
 */
export function applyToolCall(
  state: StoreState,
  call: ToolCall,
  guards: ToolGuards,
  seq: number,
  at: string,
): { record: OperationRecord; state: StoreState } {
  const before = stateHash(state);
  const result = executeTool(state, call, guards, seq);
  const after = result.mutated ? stateHash(result.state) : before;
  return {
    state: result.state,
    record: {
      seq,
      tool: call.tool,
      input: call.input,
      outcome: result.outcome,
      stateBeforeHash: before,
      stateAfterHash: after,
      mutated: result.mutated,
      engineVersion: ENGINE_VERSION,
      rulesVersion: RULES_VERSION,
      at,
    },
  };
}
