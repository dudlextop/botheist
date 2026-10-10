import { requestRegression } from "@botheist/core";
import type { RegressionMode } from "@botheist/db";
import { body, db, handler, json, requireUser } from "@/server/http";

export const POST = handler(async (req, ctx: RouteContext<"/api/findings/[id]/regressions">) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const input = await body<{ targetAgentVersionId: string; mode: RegressionMode; repeats?: number; apiKey?: string }>(req);
  const r = await requestRegression(db(), user.userId, { findingId: id, ...input });
  return json({ id: r.id }, { status: 202 });
});
