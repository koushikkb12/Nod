import "server-only";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { facts, jobs, matches, preferences } from "@/lib/db/schema";
import { normalise } from "@/lib/skills";
import { keywordPattern, MIN_SCORE, regionsOf, scoreJob, type Scored } from "./rules";

const KEEP = 250;

/** The user's skills: everything named in their confirmed facts. */
export async function userSkillSet(userId: string) {
  const db = await getDb();
  const rows = await db
    .select({ skills: facts.skills })
    .from(facts)
    .where(and(eq(facts.userId, userId), eq(facts.confirmed, true)));
  return new Set(rows.flatMap((r) => r.skills));
}

const MAX_KEYWORDS = 10;

/**
 * Which open jobs mention each preference keyword as a whole word. Runs in the
 * database so the ~9,500 ad texts never have to be loaded into memory.
 */
async function findKeywordHits(keywords: string[]) {
  const hits = new Map<string, string[]>();
  const unique = [...new Map(keywords.map((k) => [k.trim().toLowerCase(), k.trim()])).values()]
    .filter(Boolean)
    .slice(0, MAX_KEYWORDS);
  if (!unique.length) return hits;
  const db = await getDb();
  for (const keyword of unique) {
    const pattern = keywordPattern(keyword);
    const rows = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.isOpen, true),
          sql`(${jobs.title} ~* ${pattern} or ${jobs.company} ~* ${pattern} or ${jobs.descriptionText} ~* ${pattern})`,
        ),
      );
    for (const { id } of rows) hits.set(id, [...(hits.get(id) ?? []), keyword]);
  }
  return hits;
}

/** Score every open job for one user and keep the best matches. */
export async function computeMatches(userId: string) {
  const db = await getDb();
  const [prefs] = await db.select().from(preferences).where(eq(preferences.userId, userId));
  const userSkills = await userSkillSet(userId);
  const userRegions = new Set<string>();
  for (const l of prefs?.locations ?? []) regionsOf(l).forEach((r) => userRegions.add(r));
  const excluded = new Set((prefs?.excludeCompanies ?? []).map((c) => normalise(c)));
  const keywordHits = await findKeywordHits(prefs?.keywords ?? []);

  const open = await db
    .select({
      id: jobs.id, title: jobs.title, company: jobs.company, location: jobs.location,
      workplace: jobs.workplace, salaryMin: jobs.salaryMin, salaryMax: jobs.salaryMax,
      salaryCurrency: jobs.salaryCurrency, skills: jobs.skills, postedAt: jobs.postedAt,
      riskFlags: jobs.riskFlags, sponsorMatch: jobs.sponsorMatch, isDemo: jobs.isDemo, source: jobs.source,
    })
    .from(jobs)
    .where(eq(jobs.isOpen, true));

  const scored: Scored[] = [];
  for (const job of open) {
    const s = scoreJob(job, { prefs: prefs ?? null, userSkills, userRegions, excluded, keywordHits });
    if (s && (s.score >= MIN_SCORE || job.isDemo)) scored.push(s);
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, KEEP);

  const now = new Date();
  for (let i = 0; i < top.length; i += 100) {
    await db
      .insert(matches)
      .values(top.slice(i, i + 100).map((m) => ({ id: `${userId}:${m.jobId}`, userId, ...m, computedAt: now })))
      .onConflictDoUpdate({
        target: matches.id,
        set: {
          score: sql`excluded.score`,
          matchedSkills: sql`excluded.matched_skills`,
          missingSkills: sql`excluded.missing_skills`,
          reasons: sql`excluded.reasons`,
          warnings: sql`excluded.warnings`,
          computedAt: sql`excluded.computed_at`,
        },
      });
  }
  // Drop untouched matches that no longer qualify; keep the user's decisions.
  const keepIds = top.map((m) => `${userId}:${m.jobId}`);
  await db
    .delete(matches)
    .where(
      and(
        eq(matches.userId, userId),
        eq(matches.status, "new"),
        keepIds.length ? notInArray(matches.id, keepIds) : sql`true`,
      ),
    );
  return { considered: open.length, kept: top.length };
}

/** Recompute one job's match (after the user edits facts, for example). */
export async function matchJobIds(userId: string, jobIds: string[]) {
  const db = await getDb();
  return db.select().from(matches).where(and(eq(matches.userId, userId), inArray(matches.jobId, jobIds)));
}
