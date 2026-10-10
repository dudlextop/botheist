import { postPlayerMessage } from "@botheist/core";
import { body, db, getActor, handler, json } from "@/server/http";

export const POST = handler(async (req, ctx: RouteContext<"/api/runs/[id]/messages">) => {
  const { id } = await ctx.params;
  const input = await body<{ text: string; clientMsgId: string }>(req);
  const res = await postPlayerMessage(db(), await getActor(), { runId: id, text: String(input.text ?? ""), clientMsgId: String(input.clientMsgId ?? "") });
  return json(res, { status: res.duplicate ? 200 : 202 });
});
