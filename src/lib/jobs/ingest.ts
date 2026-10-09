import "server-only";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { compactDb, getDb } from "@/lib/db";
import { ingestRuns, jobs } from "@/lib/db/schema";
import { BOARDS, type Board } from "./companies";
import type { NormalizedJob } from "./normalize";
import { adzunaEnabled, fetchAdzuna, fetchAshby, fetchGreenhouse, fetchLever } from "./sources";
import { ensureSponsorRegister, sponsorMatch } from "./sponsors";

const CONCURRENCY = 6;
const BATCH = 150;

type Stats = (typeof ingestRuns.$inferSelect)["stats"];

const g = globalThis as unknown as { __nodIngest?: Promise<void> | null };

export function ingestRunning() {
  return Boolean(g.__nodIngest);
}

/** Start an ingest in the background unless one is already running. */
export function startIngest(opts: { titles: string[]; locations: string[]; onDone?: () => Promise<unknown> }) {
  if (g.__nodIngest) return false;
  g.__nodIngest = runIngest(opts)
    .then(async () => {
      // Matching runs before the ingest counts as finished, so the UI's
      // refresh shows fresh matches.
      await opts.onDone?.();
    })
    .catch((err) => console.error("[nod] ingest failed", err))
    .finally(() => {
      g.__nodIngest = null;
      // Runs after the UI has its results; queries queue behind it briefly.
      compactDb().catch((err) => console.error("[nod] database compaction failed", err));
    });
  return true;
}

export async function latestIngest() {
  const db = await getDb();
  const [run] = await db.select().from(ingestRuns).orderBy(desc(ingestRuns.id)).limit(1);
  return run ?? null;
}

async function upsert(list: NormalizedJob[]) {
  const db = await getDb();
  const now = new Date();
  for (let i = 0; i < list.length; i += BATCH) {
    const chunk = list.slice(i, i + BATCH).map((j) => ({ ...j, lastCheckedAt: now, isOpen: true }));
    await db
      .insert(jobs)
      .values(chunk)
      .onConflictDoUpdate({
        target: jobs.id,
        set: {
          title: sql`excluded.title`,
          location: sql`excluded.location`,
          workplace: sql`excluded.workplace`,
          employmentType: sql`excluded.employment_type`,
          salaryMin: sql`excluded.salary_min`,
          salaryMax: sql`excluded.salary_max`,
          salaryCurrency: sql`excluded.salary_currency`,
          descriptionHtml: sql`excluded.description_html`,
          descriptionText: sql`excluded.description_text`,
          skills: sql`excluded.skills`,
          applyUrl: sql`excluded.apply_url`,
          sourceUrl: sql`excluded.source_url`,
          postedAt: sql`excluded.posted_at`,
          lastCheckedAt: sql`excluded.last_checked_at`,
          isOpen: sql`true`,
          dedupeKey: sql`excluded.dedupe_key`,
          riskScore: sql`excluded.risk_score`,
          riskFlags: sql`excluded.risk_flags`,
          sponsorMatch: sql`excluded.sponsor_match`,
        },
        // Most postings are unchanged between refreshes. Rewriting them would
        // copy every description again (about 65 MB of dead rows per refresh),
        // so only update rows whose content changed or that had closed.
        setWhere: sql`${jobs.isOpen} = false
          or ${jobs.title} is distinct from excluded.title
          or ${jobs.location} is distinct from excluded.location
          or ${jobs.descriptionHtml} is distinct from excluded.description_html
          or ${jobs.applyUrl} is distinct from excluded.apply_url
          or ${jobs.salaryMin} is distinct from excluded.salary_min
          or ${jobs.salaryMax} is distinct from excluded.salary_max
          or ${jobs.postedAt} is distinct from excluded.posted_at
          or ${jobs.skills} is distinct from excluded.skills
          or ${jobs.riskScore} is distinct from excluded.risk_score
          or ${jobs.sponsorMatch} is distinct from excluded.sponsor_match`,
      });
  }
}

async function withSponsors(list: NormalizedJob[]) {
  const byCompany = new Map<string, string | null>();
  for (const j of list) {
    if (!byCompany.has(j.company)) byCompany.set(j.company, await sponsorMatch(j.company));
  }
  return list.map((j) => ({ ...j, sponsorMatch: byCompany.get(j.company) ?? null }));
}

/** Mark jobs from a board that no longer appear in its feed as closed. */
async function closeMissing(board: Board, seenIds: string[]) {
  const db = await getDb();
  const closed = await db
    .update(jobs)
    .set({ isOpen: false, lastCheckedAt: new Date() })
    .where(
      and(
        eq(jobs.source, board.source),
        eq(jobs.sourceCompany, board.token),
        eq(jobs.isOpen, true),
        seenIds.length ? notInArray(jobs.id, seenIds) : sql`true`,
      ),
    )
    .returning({ id: jobs.id });
  return closed.length;
}

async function runIngest(opts: { titles: string[]; locations: string[] }) {
  const db = await getDb();
  const stats: Stats = { sources: {}, total: 0, closed: 0, errors: [] };
  const [run] = await db
    .insert(ingestRuns)
    .values({ status: "running", stats })
    .returning({ id: ingestRuns.id });

  const save = (status: "running" | "done" | "failed") =>
    db
      .update(ingestRuns)
      .set({ stats, status, finishedAt: status === "running" ? null : new Date() })
      .where(eq(ingestRuns.id, run.id));

  try {
    await ensureSponsorRegister().catch((err) => {
      stats.errors.push(`Sponsor register: ${err instanceof Error ? err.message : String(err)}`);
    });

    const queue = [...BOARDS];
    const worker = async () => {
      for (let board = queue.shift(); board; board = queue.shift()) {
        const s = (stats.sources[board.source] ??= { boards: 0, jobs: 0, errors: 0 });
        try {
          const fetched =
            board.source === "greenhouse" ? await fetchGreenhouse(board)
            : board.source === "lever" ? await fetchLever(board)
            : await fetchAshby(board);
          const list = await withSponsors(fetched);
          await upsert(list);
          stats.closed += await closeMissing(board, list.map((j) => j.id));
          s.boards += 1;
          s.jobs += list.length;
          stats.total += list.length;
        } catch (err) {
          s.errors += 1;
          stats.errors.push(`${board.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
        await save("running");
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    if (adzunaEnabled() && opts.titles.length) {
      const s = (stats.sources.adzuna ??= { boards: 0, jobs: 0, errors: 0 });
      try {
        const list = await withSponsors(await fetchAdzuna(opts.titles, opts.locations));
        // Skip aggregator copies of jobs we already have from the employer.
        const keys = list.map((j) => j.dedupeKey);
        const existing = keys.length
          ? await db
              .select({ k: jobs.dedupeKey })
              .from(jobs)
              .where(and(inArray(jobs.dedupeKey, keys), sql`${jobs.source} <> 'adzuna'`))
          : [];
        const dupes = new Set(existing.map((e) => e.k));
        const fresh = list.filter((j) => !dupes.has(j.dedupeKey));
        await upsert(fresh);
        s.boards = 1;
        s.jobs = fresh.length;
        stats.total += fresh.length;
      } catch (err) {
        s.errors += 1;
        stats.errors.push(`Adzuna: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await save("done");
  } catch (err) {
    stats.errors.push(err instanceof Error ? err.message : String(err));
    await save("failed");
  }
}
