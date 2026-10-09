import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { applications, approvals, events, jobs, preferences, profiles } from "@/lib/db/schema";
import { buildPayload, payloadHash } from "@/lib/consent/payload";
import { getFile, sha256 } from "@/lib/server-utils";

export async function logEvent(userId: string, applicationId: string | null, type: string, message: string) {
  const db = await getDb();
  await db.insert(events).values({ userId, applicationId, type, message });
}

export async function loadApplication(userId: string, applicationId: string) {
  const db = await getDb();
  const [app] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)));
  if (!app) return null;
  const [job] = await db.select().from(jobs).where(eq(jobs.id, app.jobId));
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  const [prefs] = await db.select().from(preferences).where(eq(preferences.userId, userId));
  return { app, job, profile, prefs };
}

export function profileLite(p: typeof profiles.$inferSelect | undefined) {
  return {
    fullName: p?.fullName ?? "",
    email: p?.email ?? "",
    phone: p?.phone ?? "",
    location: p?.location ?? "",
    links: p?.links ?? [],
  };
}

export function absoluteApplyUrl(job: { applyUrl: string }) {
  if (/^https?:\/\//.test(job.applyUrl)) return job.applyUrl;
  return `${process.env.NOD_BASE_URL ?? "http://localhost:3000"}${job.applyUrl}`;
}

/** Rebuild the payload from the current draft and the stored CV file. */
export async function currentPayload(
  app: typeof applications.$inferSelect,
  job: typeof jobs.$inferSelect,
  profile: typeof profiles.$inferSelect | undefined,
) {
  let cvFile: { name: string; sha256: string } | null = null;
  if (app.cvPdfPath) {
    const bytes = await getFile(app.cvPdfPath);
    cvFile = { name: cvFileName(profile?.fullName), sha256: sha256(bytes) };
  }
  const payload = buildPayload({
    applicationId: app.id,
    mode: app.mode,
    draft: app.draft,
    job: { id: job.id, company: job.company, title: job.title, applyUrl: absoluteApplyUrl(job) },
    profile: profileLite(profile),
    cvFile,
  });
  return { payload, hash: payloadHash(payload) };
}

export function cvFileName(fullName: string | undefined) {
  const base = (fullName || "CV").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${base}-CV.pdf`;
}

/** The newest ledger entry for an application. */
export async function latestLedgerEntry(applicationId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(approvals)
    .where(eq(approvals.applicationId, applicationId))
    .orderBy(desc(approvals.id))
    .limit(1);
  return row ?? null;
}
