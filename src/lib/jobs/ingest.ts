import "server-only";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { compactDb, getDb } from "@/lib/db";
import { applications, customBoards, ingestRuns, jobs, matches } from "@/lib/db/schema";
import { boardKey } from "@/lib/match/rules";
import { BOARDS, type Board } from "./companies";
import type { NormalizedJob } from "./normalize";
import { adzunaEnabled, fetchAdzuna, fetchBoard, fetchJobByRef } from "./sources";
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

/** Save jobs fetched outside a full ingest, such as a link the user pasted. */
export async function saveJobs(list: NormalizedJob[]) {
  await upsert(await withSponsors(list));
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

/** Built-in boards plus every board users added, without duplicates. */
async function allBoards(): Promise<Board[]> {
  const db = await getDb();
  const extra = await db.selectDistinctOn([customBoards.source, customBoards.token], {
    source: customBoards.source,
    token: customBoards.token,
    name: customBoards.name,
  }).from(customBoards);
  const key = (b: Board) => boardKey(b.source, b.token);
  const seen = new Set(BOARDS.map(key));
  return [...BOARDS, ...extra.filter((b) => !seen.has(key(b)) && seen.add(key(b)))];
}

const RECHECK_MAX = 100;

/**
 * Close Greenhouse, Lever and Ashby jobs from boards nobody follows any more
 * (a removed custom board, or a pasted link). closeMissing never sees those.
 * Ones someone shortlisted or applied to are re-checked one by one instead.
 */
async function closeOrphans() {
  const db = await getDb();
  const followed = new Set((await allBoards()).map((b) => boardKey(b.source, b.token)));
  const open = await db
    .select({ id: jobs.id, source: jobs.source, token: jobs.sourceCompany, externalId: jobs.externalId })
    .from(jobs)
    .where(and(eq(jobs.isOpen, true), inArray(jobs.source, ["greenhouse", "lever", "ashby"])));
  const orphans = open.filter((j) => !followed.has(boardKey(j.source, j.token)));
  if (!orphans.length) return 0;
  const ids = orphans.map((o) => o.id);
  const wanted = new Set([
    ...(await db.selectDistinct({ id: matches.jobId }).from(matches).where(and(inArray(matches.jobId, ids), eq(matches.status, "shortlisted")))),
    ...(await db.selectDistinct({ id: applications.jobId }).from(applications).where(inArray(applications.jobId, ids))),
  ].map((r) => r.id));

  const close: string[] = [];
  let checks = 0;
  for (const o of orphans) {
    if (!wanted.has(o.id)) {
      close.push(o.id);
      continue;
    }
    if (checks++ >= RECHECK_MAX) continue;
    try {
      const job = await fetchJobByRef({ source: o.source as Board["source"], token: o.token, jobId: o.externalId });
      if (job) await upsert(await withSponsors([job]));
      else close.push(o.id);
    } catch {
      // Leave it open and try again on the next refresh.
    }
  }
  if (close.length) await db.update(jobs).set({ isOpen: false, lastCheckedAt: new Date() }).where(inArray(jobs.id, close));
  return close.length;
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

    const queue = await allBoards();
    const worker = async () => {
      for (let board = queue.shift(); board; board = queue.shift()) {
        const s = (stats.sources[board.source] ??= { boards: 0, jobs: 0, errors: 0 });
        try {
          const fetched = await fetchBoard(board);
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
    try {
      stats.closed += await closeOrphans();
    } catch (err) {
      stats.errors.push(`Closing unfollowed jobs: ${err instanceof Error ? err.message : String(err)}`);
    }

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
