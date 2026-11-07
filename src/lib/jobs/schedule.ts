import "server-only";
import { getDb } from "@/lib/db";
import { preferences } from "@/lib/db/schema";
import { computeMatches } from "@/lib/match/score";
import { ingestRunning, startIngest } from "./ingest";

/** Hours between background job refreshes. NOD_REFRESH_HOURS=0 turns it off. */
export function refreshHours() {
  const raw = process.env.NOD_REFRESH_HOURS;
  if (raw === undefined || raw === "") return 6;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.max(1, n) : 0;
}

async function refreshAll() {
  if (ingestRunning()) return;
  const db = await getDb();
  const users = await db.select({ userId: preferences.userId, titles: preferences.titles, locations: preferences.locations }).from(preferences);
  const uniq = (v: string[]) => [...new Set(v.map((x) => x.trim()).filter(Boolean))].slice(0, 10);
  startIngest({
    titles: uniq(users.flatMap((u) => u.titles)),
    locations: uniq(users.flatMap((u) => u.locations)),
    onDone: async () => {
      for (const u of users) await computeMatches(u.userId).catch((err) => console.error("[nod] re-match failed", err));
    },
  });
}

let timer: NodeJS.Timeout | undefined;

/** Refresh jobs and matches for everyone on a timer, in this server process. */
export function startScheduler() {
  const hours = refreshHours();
  if (!hours || timer) return;
  timer = setInterval(() => void refreshAll().catch((err) => console.error("[nod] scheduled refresh failed", err)), hours * 3_600_000);
  timer.unref();
  console.log(`[nod] refreshing jobs every ${hours}h`);
}
