// Organizer API shapes (see packages/core/src/views.ts getOrganizerDashboard).

export interface DashboardCampaign {
  id: string;
  slug: string;
  title: string;
  status: string;
  configHash: string | null;
  onchainAddress: string | null;
  explorerUrl: string | null;
  fundTxSignature: string | null;
  fundedLamports: string | null;
  submissionsCloseAt: string | null;
  payoutDeadlineAt: string | null;
  spentMicros: string;
  totalBudgetMicros: string;
  runs: number;
  agent: { id: string; name: string; model: string; configHash: string };
  missions: Array<{ id: string; title: string; rule: string; rewardLamports: string; claimed: boolean }>;
  findings: Array<{
    id: string;
    status: string;
    rule: string;
    mission: string;
    summary: string;
    paid: number | null;
    refunded: number | null;
    decisiveSeq: number | null;
    playerMessages: number;
    winner: string | null;
    payoutStatus: string | null;
    createdAt: string;
  }>;
}

export const CAMPAIGN_STATUS: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "border-dashed border-ink/40 text-ink" },
  AWAITING_FUNDING: { label: "Awaiting funding", className: "bg-tag text-tag-foreground" },
  ACTIVE: { label: "Live", className: "bg-ink text-white" },
  CLOSED: { label: "Closed", className: "border-ink/25 text-muted-foreground" },
  REFUNDED: { label: "Settled", className: "border-ink/25 text-muted-foreground" },
};

