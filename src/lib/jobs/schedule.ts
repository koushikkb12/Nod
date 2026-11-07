import "server-only";
import { getDb } from "@/lib/db";
import { preferences } from "@/lib/db/schema";
import { computeMatches, type KeywordCache } from "@/lib/match/score";
import { ingestRunning, startIngest } from "./ingest";
import { searchTerms } from "./search-terms";
import { ADZUNA_MAX_TITLES } from "./sources";

/** Hours between background job refreshes. NOD_REFRESH_HOURS=0 turns it off. */
export function refreshHours() {
  const raw = process.env.NOD_REFRESH_HOURS;
  if (raw === undefined || raw === "") return 6;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.max(1, n) : 0;
}

let round = 0;

async function refreshAll() {
  if (ingestRunning()) return;
  const db = await getDb();
  const users = await db.select({ userId: preferences.userId, titles: preferences.titles, locations: preferences.locations }).from(preferences);
  const started = startIngest({
    titles: searchTerms(users.map((u) => u.titles), ADZUNA_MAX_TITLES, round),
    locations: searchTerms(users.map((u) => u.locations), 10, 0),
    onDone: async () => {
      const keywordCache: KeywordCache = new Map();
      for (const u of users) {
        await computeMatches(u.userId, { keywordCache }).catch((err) => console.error("[nod] re-match failed", err));
      }
    },
  });
  if (started) round += 1;
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
