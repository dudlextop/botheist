import type { Metadata } from "next";
import { GameScreen } from "@/components/game/game-screen";

export const metadata: Metadata = { title: "Heist in progress" };

export default async function RunPage({ params }: PageProps<"/play/[runId]">) {
  const { runId } = await params;
  return <GameScreen runId={runId} />;
}
