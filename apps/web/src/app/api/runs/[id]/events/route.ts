import { assertOwner, getEventsSince, notFound } from "@botheist/core";
import { db, getActor, handler } from "@/server/http";

export const dynamic = "force-dynamic";

const POLL_MS = 400;
const MAX_STREAM_MS = 10 * 60_000;

/**
 * Server-Sent Events for one attempt. Every event carries its sequence number as
 * the SSE id, so a reconnecting browser resumes exactly after the last event it saw.
 */
export const GET = handler(async (req, ctx: RouteContext<"/api/runs/[id]/events">) => {
  const { id } = await ctx.params;
  const actor = await getActor();
  const run = await db().run.findUnique({ where: { id }, select: { userId: true, guestKey: true, campaign: { select: { organizerId: true } } } });
  if (!run) throw notFound("Attempt");
  if (!(run.campaign.organizerId && run.campaign.organizerId === actor.userId)) assertOwner(run, actor);

  const url = new URL(req.url);
  let after = Number(req.headers.get("last-event-id") ?? url.searchParams.get("after") ?? 0) || 0;
  const encoder = new TextEncoder();
  const started = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      req.signal.addEventListener("abort", () => (closed = true));
      const send = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk));
      };
      send("retry: 1500\n\n");
      let sinceLast = 0;
      while (!closed && Date.now() - started < MAX_STREAM_MS) {
        try {
          const events = await getEventsSince(db(), id, after);
          for (const e of events) {
            send(`id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`);
            after = e.seq;
          }
          sinceLast = events.length ? 0 : sinceLast + POLL_MS;
          if (sinceLast >= 15_000) {
            send(": ping\n\n");
            sinceLast = 0;
          }
        } catch {
          // Transient DB hiccup: keep the stream open and try again.
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      if (!closed) controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
