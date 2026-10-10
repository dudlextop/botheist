import type { Prisma, Tx } from "@botheist/db";

/** Event types streamed to the browser over SSE. */
export type RunEventType =
  | "run_started"
  | "player_message"
  | "agent_typing"
  | "turn_end"
  | "agent_message"
  | "agent_refusal"
  | "tool_call"
  | "operation"
  | "rule_broken"
  | "run_finished"
  | "model_error"
  | "finding_status"
  | "payout_status";

/**
 * Append one event with the next per-run sequence number. The counter lives on
 * the run row, so concurrent writers serialize on that row.
 */
export async function appendEvent(
  tx: Tx,
  runId: string,
  type: RunEventType,
  payload: Record<string, unknown>,
  clientMsgId?: string,
): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ seq: number }>>`
    UPDATE "Run" SET "nextEventSeq" = "nextEventSeq" + 1 WHERE id = ${runId}::uuid
    RETURNING "nextEventSeq" - 1 AS seq`;
  const seq = rows[0]?.seq;
  if (seq === undefined) throw new Error(`Run ${runId} not found`);
  await tx.runEvent.create({
    data: { runId, seq, type, payload: payload as Prisma.InputJsonValue, clientMsgId: clientMsgId ?? null },
  });
  return seq;
}
