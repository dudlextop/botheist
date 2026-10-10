import { listChallenges } from "@botheist/core";
import { db, getActor, handler, json } from "@/server/http";

export const GET = handler(async () => json(await listChallenges(db(), await getActor())));
