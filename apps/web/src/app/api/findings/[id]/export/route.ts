import { exportScenario } from "@botheist/core";
import { db, getActor, handler } from "@/server/http";

export const GET = handler(async (_req, ctx: RouteContext<"/api/findings/[id]/export">) => {
  const { id } = await ctx.params;
  const scenario = await exportScenario(db(), id, await getActor());
  return new Response(JSON.stringify(scenario, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="botheist-scenario-${id}.json"`,
    },
  });
});
