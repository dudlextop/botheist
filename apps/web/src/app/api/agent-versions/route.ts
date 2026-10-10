import { createAgentVersion, listAgentVersionsFor } from "@botheist/core";
import type { Effort } from "@botheist/agent";
import type { ToolGuards } from "@botheist/engine";
import { body, db, handler, json, requireUser } from "@/server/http";

export const GET = handler(async () => {
  const user = await requireUser();
  return json(await listAgentVersionsFor(db(), user.userId));
});

export const POST = handler(async (req) => {
  const user = await requireUser();
  const input = await body<{ baseVersionId: string; name?: string; model?: string; effort?: Effort; instructions?: string; guards?: ToolGuards }>(req);
  const v = await createAgentVersion(db(), user.userId, input);
  return json({ id: v.id, name: v.name, configHash: v.configHash }, { status: 201 });
});
