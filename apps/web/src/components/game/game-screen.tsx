"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRun } from "@/hooks/use-run";
import { api, ApiError, newClientId } from "@/lib/api";
import { useModelKey } from "@/lib/model-key";
import { deriveRun, type ChatItem } from "@/lib/run-state";
import { ChatPanel } from "./chat-panel";
import { ConsequencesPanel } from "./consequences-panel";
import { ResultCard } from "./result-card";
import { SituationPanel } from "./situation-panel";

export function GameScreen({ runId }: { runId: string }) {
  const router = useRouter();
  const { view, events, error, conn, reload } = useRun(runId);
  const [pending, setPending] = useState<ChatItem[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const apiKey = useModelKey();

  const d = useMemo(() => (view ? deriveRun(view, events, pending) : null), [view, events, pending]);

  if (error) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-start gap-3 px-4 py-20">
        <h1 className="font-condensed text-3xl font-extrabold">
          {error.status === 404 ? "Attempt not found" : error.status === 403 ? "This attempt belongs to another player" : "Couldn't load this attempt"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {error.status === 403 ? "Attempts are private to the player who started them. Start your own from the missions list." : error.message}
        </p>
        <div className="mt-2 flex gap-2">
          {error.status !== 403 && (
            <Button className="h-10" onClick={() => void reload()}>
              Try again
            </Button>
          )}
          <Button variant={error.status === 403 ? "default" : "outline"} className="h-10" render={<Link href="/play" />} nativeButton={false}>
            Back to missions
          </Button>
        </div>
      </div>
    );
  }

  if (!view || !d) {
    return (
      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-6 md:px-6 lg:grid-cols-[280px_1fr_340px]">
        <Skeleton className="h-[600px] rounded-lg" />
        <Skeleton className="h-[600px] rounded-lg" />
        <Skeleton className="h-[600px] rounded-lg" />
      </div>
    );
  }

  const send = async (text: string) => {
    const clientMsgId = newClientId();
    setSendError(null);
    setPending((p) => [...p, { key: clientMsgId, role: "player", text, pending: true }]);
    // Retry once on a network failure with the same id: the server deduplicates it.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await api(`/api/runs/${runId}/messages`, { method: "POST", json: { text, clientMsgId } });
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.code === "NETWORK" && attempt === 0) continue;
        setPending((p) => p.filter((m) => m.key !== clientMsgId));
        setSendError(err instanceof ApiError ? err.message : "Message not sent. Try again.");
        return false;
      }
    }
    return false;
  };

  const retry = async () => {
    setRetrying(true);
    try {
      const { runId: next } = await api<{ runId: string }>("/api/runs", {
        method: "POST",
        json: { campaignId: view.campaign.id, missionId: view.mission.id, ...(apiKey ? { apiKey } : {}) },
      });
      router.push(`/play/${next}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't start a new attempt");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 md:px-6">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button variant="ghost" className="-ml-2 h-10 px-2" render={<Link href="/play" />} nativeButton={false}>
          <ArrowLeft aria-hidden /> Missions
        </Button>
        <span className="text-muted-foreground" aria-hidden>
          /
        </span>
        <p className="text-sm text-muted-foreground">{view.campaign.kind === "TRAINING" ? `Milo academy, ${view.agent.name}` : view.campaign.title}</p>
        {conn === "reconnecting" && (
          <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-warning" role="status">
            <WifiOff className="size-3.5" aria-hidden /> Reconnecting…
          </span>
        )}
      </div>
      <ResultCard view={view} d={d} onRetry={() => void retry()} retrying={retrying} />
      <div className="grid gap-4 lg:h-[calc(100dvh-9.5rem)] lg:min-h-[620px] lg:grid-cols-[270px_minmax(0,1fr)_320px] xl:grid-cols-[300px_minmax(0,1fr)_350px]">
        <SituationPanel view={view} state={view.state} refunds={d.refunds} register={d.register} />
        <ChatPanel view={view} d={d} onSend={send} sendError={sendError} />
        <ConsequencesPanel view={view} d={d} />
      </div>
    </div>
  );
}
