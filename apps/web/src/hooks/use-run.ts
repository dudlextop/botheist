"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { RunEvent, RunView } from "@/lib/types";

type Conn = "connecting" | "live" | "reconnecting";

/**
 * Load an attempt and follow its events. The SSE stream resumes from the last
 * sequence number the page has, so a reload or a dropped connection never loses
 * or duplicates events.
 */
export function useRun(runId: string) {
  const [view, setView] = useState<RunView | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [conn, setConn] = useState<Conn>("connecting");
  const lastSeq = useRef(0);

  const load = useCallback(async () => {
    try {
      const v = await api<RunView>(`/api/runs/${runId}`);
      lastSeq.current = Math.max(lastSeq.current, v.lastSeq);
      setView(v);
      setEvents(v.events);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError("UNKNOWN", String(err), 0));
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!view) return;
    let es: EventSource | null = null;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const open = () => {
      es = new EventSource(`/api/runs/${runId}/events?after=${lastSeq.current}`);
      es.onopen = () => setConn("live");
      es.onmessage = (msg) => {
        const e = JSON.parse(msg.data) as RunEvent;
        if (e.seq <= lastSeq.current) return;
        lastSeq.current = e.seq;
        setEvents((prev) => (prev.some((p) => p.seq === e.seq) ? prev : [...prev, e]));
      };
      es.onerror = () => {
        es?.close();
        if (stopped) return;
        setConn("reconnecting");
        retry = setTimeout(open, 1500);
      };
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(retry);
      es?.close();
    };
    // Open once per attempt; the cursor lives in a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, Boolean(view)]);

  return { view, events, error, conn, reload: load };
}
