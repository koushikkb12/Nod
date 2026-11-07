"use server";

import { and, eq, inArray, notInArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { applications, matches, preferences } from "@/lib/db/schema";
import { generateDraft } from "@/lib/draft/generate";
import { latestIngest, saveJobs, startIngest } from "@/lib/jobs/ingest";
import { parseJobUrl } from "@/lib/jobs/job-url";
import { fetchJobByRef } from "@/lib/jobs/sources";
import { computeMatches, matchAddedJob } from "@/lib/match/score";
import { logEvent } from "@/lib/apps";
import { newId } from "@/lib/server-utils";
import { requireUser } from "@/lib/session";
import type { Workplace } from "@/lib/types";

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

export async function savePreferences(formData: FormData) {
  const user = await requireUser();
  const db = await getDb();
  const num = (k: string) => {
    const n = Number(String(formData.get(k) ?? "").replace(/[^\d]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const sponsorship = String(formData.get("needsSponsorship") ?? "");
  const values = {
    titles: list(formData.get("titles")),
    locations: list(formData.get("locations")),
    workplace: formData.getAll("workplace").map(String) as Workplace[],
    seniority: formData.getAll("seniority").map(String),
    minSalary: num("minSalary"),
    salaryCurrency: String(formData.get("salaryCurrency") ?? "GBP"),
    keywords: list(formData.get("keywords")),
    excludeCompanies: list(formData.get("excludeCompanies")),
    needsSponsorship: sponsorship === "yes" ? true : sponsorship === "no" ? false : null,
    rightToWork: String(formData.get("rightToWork") ?? "").trim(),
    noticePeriod: String(formData.get("noticePeriod") ?? "").trim(),
    willingToRelocate: formData.get("willingToRelocate") === "on",
    updatedAt: new Date(),
  };
  await db.insert(preferences).values({ userId: user.id, ...values }).onConflictDoUpdate({ target: preferences.userId, set: values });
  await computeMatches(user.id);
  refresh();
}

export async function saveAgentControls(formData: FormData) {
  const user = await requireUser();
  const db = await getDb();
  const clamp = (v: FormDataEntryValue | null, lo: number, hi: number, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
  };
  const values = {
    dailyCap: clamp(formData.get("dailyCap"), 1, 25, 10),
    perCompanyMonthlyCap: clamp(formData.get("perCompanyMonthlyCap"), 1, 5, 2),
    updatedAt: new Date(),
  };
  await db.insert(preferences).values({ userId: user.id, ...values }).onConflictDoUpdate({ target: preferences.userId, set: values });
  refresh();
}

export async function setAgentPaused(paused: boolean) {
  const user = await requireUser();
  const db = await getDb();
  await db
    .insert(preferences)
    .values({ userId: user.id, agentPaused: paused })
    .onConflictDoUpdate({ target: preferences.userId, set: { agentPaused: paused, updatedAt: new Date() } });
  await logEvent(user.id, null, paused ? "paused" : "resumed", paused ? "You paused the agent. Nothing will be sent until you resume." : "You resumed the agent.");
  refresh();
}

/* ------------------------------- Jobs -------------------------------- */

/** Fetch fresh jobs from every source in the background, then re-match. */
export async function refreshJobs() {
  const user = await requireUser();
  const db = await getDb();
  const [prefs] = await db.select().from(preferences).where(eq(preferences.userId, user.id));
  const started = startIngest({
    titles: prefs?.titles ?? [],
    locations: prefs?.locations ?? [],
    onDone: () => computeMatches(user.id),
  });
  return { started };
}

/** Add one job from a pasted Greenhouse, Lever or Ashby link, then open it. */
export async function addJobFromUrl(_prev: { error?: string } | null, formData: FormData) {
  const user = await requireUser();
  const ref = parseJobUrl(String(formData.get("url") ?? ""));
  if (!ref) return { error: "Paste a job link from Greenhouse, Lever or Ashby." };
  let job;
  try {
    job = await fetchJobByRef(ref);
  } catch {
    return { error: "Couldn't reach the employer's job board. Try again in a moment." };
  }
  if (!job) return { error: "That job wasn't found. It may have closed." };
  await saveJobs([job]);
  await matchAddedJob(user.id, job.id);
  redirect(`/app/jobs/${encodeURIComponent(job.id)}`);
}

export async function ingestStatus() {
  await requireUser();
  const run = await latestIngest();
  return run
    ? { status: run.status, total: run.stats.total, errors: run.stats.errors.length, startedAt: run.startedAt.toISOString(), finishedAt: run.finishedAt?.toISOString() ?? null }
    : null;
}

export async function rematch() {
  const user = await requireUser();
  const r = await computeMatches(user.id);
  refresh();
  return r;
}

export async function setMatchStatus(jobId: string, status: "new" | "shortlisted" | "dismissed", reason?: string) {
  const user = await requireUser();
  const db = await getDb();
  await db
    .update(matches)
    .set({ status, dismissReason: status === "dismissed" ? (reason ?? null) : null })
    .where(and(eq(matches.userId, user.id), eq(matches.jobId, jobId)));
  refresh();
}

/** Draft an application for a job (or open the existing one). */
export async function prepareApplication(jobId: string) {
  const user = await requireUser();
  const db = await getDb();
  const [existing] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.userId, user.id), eq(applications.jobId, jobId), notInArray(applications.status, ["withdrawn"])));
  if (existing) redirect(`/app/applications/${existing.id}`);

  let draft, note;
  try {
    ({ draft, note } = await generateDraft(user.id, jobId));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't draft this application." };
  }
  const id = newId("app");
  await db.insert(applications).values({ id, userId: user.id, jobId, status: "drafted", mode: "manual", draft });
  await logEvent(
    user.id,
    id,
    "drafted",
    `Drafted with ${draft.generatedBy === "ai" ? (draft.model ?? "AI") : "rule-based drafting"}.${note ? ` ${note}` : ""}`,
  );
  if (draft.injectionWarnings.length) {
    await logEvent(user.id, id, "warning", "This job ad contains hidden text aimed at AI tools. Nod ignored it.");
  }
  await db
    .update(matches)
    .set({ status: "shortlisted" })
    .where(and(eq(matches.userId, user.id), inArray(matches.jobId, [jobId]), eq(matches.status, "new")));
  redirect(`/app/applications/${id}`);
}
