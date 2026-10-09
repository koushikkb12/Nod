"use server";

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { getDb } from "@/lib/db";
import { answers as answersTable, applications, approvals, facts, jobs, submissions } from "@/lib/db/schema";
import { approvalBlockers, buildPayload, payloadHash } from "@/lib/consent/payload";
import { categoryOf, classify, normLabel } from "@/lib/draft/answers";
import { generateDraft } from "@/lib/draft/generate";
import { allSentences, checkSentence, guardDraft, type FactLite } from "@/lib/draft/guard";
import { absoluteApplyUrl, cvFileName, loadApplication, logEvent, profileLite } from "@/lib/apps";
import { newId, putFile, sha256 } from "@/lib/server-utils";
import { requireUser } from "@/lib/session";
import { extractSkills } from "@/lib/skills";
import { renderCvPdf } from "@/lib/submit/pdf";
import { runSubmission } from "@/lib/submit/engine";
import type { AppStatus, Draft, DraftAnswer } from "@/lib/types";

const LOCKED: AppStatus[] = ["submitting", "submitted", "interviewing", "offer", "rejected", "withdrawn"];

async function confirmedFacts(userId: string) {
  const db = await getDb();
  const rows = await db.select().from(facts).where(eq(facts.userId, userId));
  return new Map<string, FactLite>(rows.map((f) => [f.id, f]));
}

async function userAgent() {
  return (await headers()).get("user-agent")?.slice(0, 300) ?? null;
}

/**
 * Change a draft. If it was approved, the approval is withdrawn first and
 * recorded in the ledger: approvals are bound to exact content.
 */
async function mutateDraft(applicationId: string, fn: (draft: Draft) => Draft | Promise<Draft>, what = "edited the draft") {
  const user = await requireUser();
  const loaded = await loadApplication(user.id, applicationId);
  if (!loaded?.job) throw new Error("Application not found");
  const { app, job } = loaded;
  if (LOCKED.includes(app.status)) throw new Error("This application has already been sent and can't be changed.");
  const db = await getDb();

  if (app.status === "approved" || app.status === "manual_kit") {
    await db.insert(approvals).values({
      applicationId,
      userId: user.id,
      kind: "revoke",
      payloadHash: app.approvedHash ?? "",
      payload: { reason: `You ${what}` },
      userAgent: await userAgent(),
    });
    await logEvent(user.id, applicationId, "revoked", `Approval withdrawn because you ${what}.`);
  }

  const next = guardDraft(await fn(structuredClone(app.draft)), await confirmedFacts(user.id), {
    jobTitle: job.title,
    company: job.company,
  });
  await db
    .update(applications)
    .set({ draft: next, status: "drafted", approvedHash: null, updatedAt: new Date() })
    .where(eq(applications.id, applicationId));
  refresh();
  return { user, app, job };
}

function findSentence(draft: Draft, sentenceId: string) {
  const s = allSentences(draft).find((x) => x.id === sentenceId);
  if (!s) throw new Error("Sentence not found");
  return s;
}

export async function editSentence(applicationId: string, sentenceId: string, text: string) {
  await mutateDraft(applicationId, (d) => {
    const s = findSentence(d, sentenceId);
    s.text = text.trim();
    s.edited = true;
    s.removed = false;
    return d;
  });
}

export async function toggleSentence(applicationId: string, sentenceId: string, removed: boolean) {
  await mutateDraft(applicationId, (d) => {
    findSentence(d, sentenceId).removed = removed;
    return d;
  });
}

/** "This is true": save a blocked sentence as a new confirmed fact. */
export async function sentenceToFact(applicationId: string, sentenceId: string) {
  const user = await requireUser();
  const loaded = await loadApplication(user.id, applicationId);
  if (!loaded) throw new Error("Application not found");
  const s = findSentence(loaded.app.draft, sentenceId);
  const role = loaded.app.draft.roles.find((r) => r.bullets.some((b) => b.id === sentenceId));
  const db = await getDb();
  let parent = null;
  if (role) [parent] = await db.select().from(facts).where(and(eq(facts.id, role.roleFactId), eq(facts.userId, user.id)));
  const id = newId("f", 10);
  await db.insert(facts).values({
    id,
    userId: user.id,
    kind: parent ? "achievement" : "other",
    parentId: parent?.id ?? null,
    text: s.text,
    role: parent?.role ?? null,
    org: parent?.org ?? null,
    startDate: parent?.startDate ?? null,
    endDate: parent?.endDate ?? null,
    skills: extractSkills(s.text),
    confirmed: true,
    source: "user",
    position: 20_000,
  });
  await mutateDraft(applicationId, (d) => {
    const t = findSentence(d, sentenceId);
    t.factIds = [id];
    t.kind = "claim";
    t.removed = false;
    return d;
  }, "added a fact");
}

export async function editAnswer(applicationId: string, questionId: string, value: string, remember: boolean) {
  const { user } = await mutateDraft(applicationId, (d) => {
    const a = d.answers.find((x) => x.questionId === questionId);
    if (!a) throw new Error("Question not found");
    a.value = value.trim();
    a.source = "user";
    a.needsUser = a.required && !a.value;
    a.note = undefined;
    return d;
  }, "changed an answer");
  if (remember && value.trim()) await rememberAnswer(user.id, applicationId, questionId, value.trim());
}

async function rememberAnswer(userId: string, applicationId: string, questionId: string, value: string) {
  const loaded = await loadApplication(userId, applicationId);
  const a = loaded?.app.draft.answers.find((x) => x.questionId === questionId);
  if (!a) return;
  const label = a.options?.length ? a.label : a.label;
  const display = a.options?.find((o) => o.value === value)?.label ?? value;
  const kind = classify({ id: a.questionId, label: a.label, required: a.required, type: a.type, sensitive: a.sensitive });
  const category = categoryOf(kind);
  const db = await getDb();
  await db
    .insert(answersTable)
    .values({ id: newId("ans"), userId, label, normLabel: normLabel(label), category, answer: display, sensitive: Boolean(a.sensitive) })
    .onConflictDoUpdate({ target: [answersTable.userId, answersTable.normLabel], set: { answer: display, updatedAt: new Date() } });
}

/** Answer a question that appeared on the live form after approval. */
export async function answerNewQuestion(formData: FormData) {
  const applicationId = String(formData.get("applicationId"));
  const field = String(formData.get("field"));
  const label = String(formData.get("label"));
  const value = String(formData.get("value") ?? "").trim();
  const remember = formData.get("remember") === "on";
  const options = String(formData.get("options") ?? "");
  if (!value) return;
  const { user } = await mutateDraft(applicationId, (d) => {
    const existing = d.answers.find((a) => a.questionId === field);
    const answer: DraftAnswer = {
      questionId: field,
      label,
      required: true,
      type: options ? "select" : "text",
      options: options ? JSON.parse(options) : undefined,
      value,
      source: "user",
      needsUser: false,
    };
    if (existing) Object.assign(existing, answer);
    else d.answers.push(answer);
    return d;
  }, "answered a new question");
  if (remember) await rememberAnswer(user.id, applicationId, field, value);
}

export async function regenerateDraft(applicationId: string) {
  const user = await requireUser();
  const loaded = await loadApplication(user.id, applicationId);
  if (!loaded) throw new Error("Application not found");
  const { draft } = await generateDraft(user.id, loaded.app.jobId);
  // Keep answers the user typed in.
  const typed = new Map(loaded.app.draft.answers.filter((a) => a.source === "user").map((a) => [a.questionId, a]));
  draft.answers = [
    ...draft.answers.map((a) => typed.get(a.questionId) ?? a),
    ...[...typed.values()].filter((t) => !draft.answers.some((a) => a.questionId === t.questionId)),
  ];
  await mutateDraft(applicationId, () => draft, "regenerated the draft");
  await logEvent(user.id, applicationId, "drafted", `Redrafted with ${draft.generatedBy === "ai" ? (draft.model ?? "AI") : "rule-based drafting"}.`);
}

/* ---------------------------- Consent -------------------------------- */

export type ApproveResult = { ok: true; hash: string } | { ok: false; error: string };

/**
 * The user's nod. Freezes the exact payload (including the rendered CV),
 * records its hash in the append-only ledger, and only then lets anything
 * be sent.
 */
export async function approveApplication(applicationId: string, mode: "manual" | "agent"): Promise<ApproveResult> {
  const user = await requireUser();
  const loaded = await loadApplication(user.id, applicationId);
  if (!loaded?.job) return { ok: false, error: "Application not found" };
  const { app, job, profile, prefs } = loaded;
  if (!["drafted", "needs_user"].includes(app.status)) return { ok: false, error: "This application isn't waiting for approval." };

  const db = await getDb();
  const draft = guardDraft(app.draft, await confirmedFacts(user.id), { jobTitle: job.title, company: job.company });
  const lite = profileLite(profile);
  const blockers = approvalBlockers(draft, lite);
  if (blockers.length) return { ok: false, error: blockers.join(" ") };

  if (mode === "agent") {
    if (!job.isDemo && process.env.NOD_ALLOW_REAL_SUBMISSIONS !== "true") {
      return { ok: false, error: "Nod only submits for you on employer forms it supports. For this job, choose “I'll apply myself”." };
    }
    if (prefs?.agentPaused) return { ok: false, error: "The agent is paused. Resume it in Preferences first." };
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const [{ today }] = await db
      .select({ today: sql<number>`count(*)::int` })
      .from(submissions)
      .where(and(eq(submissions.userId, user.id), gte(submissions.startedAt, dayStart), inArray(submissions.status, ["running", "succeeded"])));
    if (today >= (prefs?.dailyCap ?? 10)) return { ok: false, error: `You've reached your daily limit of ${prefs?.dailyCap ?? 10} agent submissions.` };
    const monthAgo = new Date(Date.now() - 30 * 86_400_000);
    const [{ atCompany }] = await db
      .select({ atCompany: sql<number>`count(*)::int` })
      .from(submissions)
      .innerJoin(applications, eq(applications.id, submissions.applicationId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(and(eq(submissions.userId, user.id), eq(jobs.company, job.company), gte(submissions.startedAt, monthAgo), eq(submissions.status, "succeeded")));
    if (atCompany >= (prefs?.perCompanyMonthlyCap ?? 2)) {
      return { ok: false, error: `You've already applied to ${job.company} ${atCompany} times this month (your limit is ${prefs?.perCompanyMonthlyCap ?? 2}).` };
    }
  }

  // Render the exact CV that will be attached, then hash everything.
  const jobRef = { id: job.id, company: job.company, title: job.title, applyUrl: absoluteApplyUrl(job) };
  const pre = buildPayload({ applicationId, mode, draft, job: jobRef, profile: lite, cvFile: null });
  const pdf = await renderCvPdf(pre);
  const cvPdfPath = await putFile(`${user.id}/cv/${applicationId}-${Date.now()}.pdf`, pdf);
  const payload = buildPayload({
    applicationId,
    mode,
    draft,
    job: jobRef,
    profile: lite,
    cvFile: { name: cvFileName(lite.fullName), sha256: sha256(pdf) },
  });
  const hash = payloadHash(payload);

  await db.insert(approvals).values({
    applicationId,
    userId: user.id,
    kind: "approve",
    payloadHash: hash,
    payload: payload as unknown as Record<string, unknown>,
    userAgent: await userAgent(),
  });
  await db
    .update(applications)
    .set({ draft, mode, status: mode === "agent" ? "approved" : "manual_kit", approvedHash: hash, cvPdfPath, updatedAt: new Date() })
    .where(eq(applications.id, applicationId));
  await logEvent(
    user.id,
    applicationId,
    "approved",
    mode === "agent"
      ? `You approved this exact application (hash ${hash.slice(0, 12)}). Nod will submit it now.`
      : `You approved the application kit (hash ${hash.slice(0, 12)}). Apply on the employer's site when you're ready.`,
  );

  if (mode === "agent") after(() => runSubmission(user.id, applicationId));
  refresh();
  return { ok: true, hash };
}

export async function revokeApproval(applicationId: string) {
  const user = await requireUser();
  const loaded = await loadApplication(user.id, applicationId);
  if (!loaded) throw new Error("Application not found");
  const { app } = loaded;
  if (!["approved", "manual_kit", "needs_user"].includes(app.status)) throw new Error("Nothing to withdraw.");
  const db = await getDb();
  await db.insert(approvals).values({
    applicationId,
    userId: user.id,
    kind: "revoke",
    payloadHash: app.approvedHash ?? "",
    payload: { reason: "You withdrew your approval" },
    userAgent: await userAgent(),
  });
  // Guarded update: if the agent already claimed it, this does nothing.
  const updated = await db
    .update(applications)
    .set({ status: "drafted", approvedHash: null, updatedAt: new Date() })
    .where(and(eq(applications.id, applicationId), inArray(applications.status, ["approved", "manual_kit", "needs_user"])))
    .returning({ id: applications.id });
  await logEvent(user.id, applicationId, "revoked", updated.length ? "You withdrew your approval. Nothing will be sent." : "Too late to withdraw: the agent had already started sending.");
  refresh();
}

/** For the manual path: the user confirms they applied themselves. */
export async function markApplied(applicationId: string) {
  const user = await requireUser();
  const db = await getDb();
  const updated = await db
    .update(applications)
    .set({ status: "submitted", updatedAt: new Date() })
    .where(and(eq(applications.id, applicationId), eq(applications.userId, user.id), eq(applications.status, "manual_kit")))
    .returning({ id: applications.id });
  if (updated.length) await logEvent(user.id, applicationId, "submitted", "You marked this as applied on the employer's site.");
  refresh();
}

const TRACK: AppStatus[] = ["submitted", "interviewing", "offer", "rejected", "withdrawn"];

export async function setApplicationStatus(applicationId: string, status: AppStatus) {
  const user = await requireUser();
  if (!TRACK.includes(status)) throw new Error("Invalid status");
  const loaded = await loadApplication(user.id, applicationId);
  if (!loaded) throw new Error("Application not found");
  if (loaded.app.status === "submitting") throw new Error("Wait until sending finishes.");
  const sent = ["submitted", "interviewing", "offer", "rejected"].includes(loaded.app.status);
  if (!sent && status !== "withdrawn") throw new Error("Only sent applications can move along the tracker.");
  const db = await getDb();
  await db.update(applications).set({ status, updatedAt: new Date() }).where(eq(applications.id, applicationId));
  await logEvent(user.id, applicationId, "status", `Moved to ${status}.`);
  refresh();
}

/** Used by the review screen to show live guard results while typing. */
export async function previewSentence(applicationId: string, sentenceId: string, text: string) {
  const user = await requireUser();
  const loaded = await loadApplication(user.id, applicationId);
  if (!loaded?.job) return null;
  const s = findSentence(loaded.app.draft, sentenceId);
  const checked = checkSentence({ ...s, text }, await confirmedFacts(user.id), { jobTitle: loaded.job.title, company: loaded.job.company });
  return { status: checked.status, reason: checked.reason ?? null };
}
