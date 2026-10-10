import { MODELS } from "@botheist/agent";
import { PROGRAM_ID } from "@botheist/solana";
import { handler, json, publicConfig } from "@/server/http";

export const GET = handler(async () =>
  json({
    ...publicConfig(),
    programId: PROGRAM_ID,
    models: MODELS.map((m) => ({ id: m.id, label: m.label, note: m.note })),
  }),
);
