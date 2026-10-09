import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { applications, submissions } from "@/lib/db/schema";
import { absoluteApplyUrl, currentPayload, latestLedgerEntry, loadApplication, logEvent } from "@/lib/apps";
import { isStillOpen } from "@/lib/jobs/sources";
import { filePath, newId, putFile } from "@/lib/server-utils";
import type { ApplicationPayload } from "@/lib/consent/payload";
import { browser } from "./pdf";

const g = globalThis as unknown as { __nodSubmitting?: Set<string> };
const running = (g.__nodSubmitting ??= new Set());

type Outcome =
  | { status: "succeeded"; confirmationText: string; formShot: string; confirmShot: string }
  | { status: "needs_user"; needs: Need[]; formShot?: string; message: string };

type Need = { field: string; label: string; reason: string; options?: { label: string; value: string }[] };

/**
 * Submit an approved application. Re-verifies everything at the last moment:
 * the approval is the newest ledger entry, the payload still hashes to the
 * approved value, the user hasn't paused the agent, and the job is open.
 */
export async function runSubmission(userId: string, applicationId: string) {
  if (running.has(applicationId)) return;
  running.add(applicationId);
  const db = await getDb();
  try {
    // Claim the application atomically so it can't be sent twice.
    const claimed = await db
      .update(applications)
      .set({ status: "submitting", updatedAt: new Date() })
      .where(and(eq(applications.id, applicationId), eq(applications.userId, userId), eq(applications.status, "approved"), eq(applications.mode, "agent")))
      .returning({ id: applications.id });
    if (!claimed.length) return;

    const loaded = await loadApplication(userId, applicationId);
    if (!loaded?.job) return;
    const { app, job, profile, prefs } = loaded;

    const backToUser = async (message: string, status: "needs_user" | "failed" = "needs_user") => {
      await db.update(applications).set({ status, updatedAt: new Date() }).where(eq(applications.id, applicationId));
      await logEvent(userId, applicationId, status, message);
    };

    if (prefs?.agentPaused) {
      await db.update(applications).set({ status: "approved" }).where(eq(applications.id, applicationId));
      await logEvent(userId, applicationId, "paused", "The agent is paused, so Nod is holding this application.");
      return;
    }

    const ledger = await latestLedgerEntry(applicationId);
    const { payload, hash } = await currentPayload(app, job, profile);
    if (!ledger || ledger.kind !== "approve" || ledger.payloadHash !== app.approvedHash || hash !== app.approvedHash) {
      return backToUser("The application no longer matches what you approved, so Nod stopped. Review and approve again.");
    }
    await logEvent(userId, applicationId, "verified", `Approval verified: payload hash ${hash.slice(0, 12)} matches the ledger.`);

    if (!(await isStillOpen(job))) {
      return backToUser("The job has closed since you approved it, so nothing was sent.", "failed");
    }

    const allowReal = process.env.NOD_ALLOW_REAL_SUBMISSIONS === "true";
    if (!job.isDemo && !allowReal) {
      return backToUser("Agent submission to real employers is switched off. Use “I'll apply myself” with the prepared kit.");
    }

    const [sub] = await db
      .insert(submissions)
      .values({ id: newId("sub"), applicationId, userId, adapter: job.isDemo ? "demo-ats" : job.source, status: "running", payloadHash: hash })
      .returning();
    await logEvent(userId, applicationId, "submitting", `Opening the application form at ${absoluteApplyUrl(job)}`);

    let outcome: Outcome;
    try {
      outcome = await submitToForm({ userId, applicationId, url: absoluteApplyUrl(job), payload, cvPath: app.cvPdfPath ? filePath(app.cvPdfPath) : null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.update(submissions).set({ status: "failed", error: message, finishedAt: new Date() }).where(eq(submissions.id, sub.id));
      return backToUser(`Submission failed: ${message}. Nothing was confirmed as sent.`, "failed");
    }

    if (outcome.status === "needs_user") {
      await db
        .update(submissions)
        .set({ status: "needs_user", needs: outcome.needs, formScreenshot: outcome.formShot, finishedAt: new Date() })
        .where(eq(submissions.id, sub.id));
      return backToUser(outcome.message);
    }

    await db
      .update(submissions)
      .set({
        status: "succeeded",
        formScreenshot: outcome.formShot,
        confirmationScreenshot: outcome.confirmShot,
        confirmationText: outcome.confirmationText,
        finishedAt: new Date(),
      })
      .where(eq(submissions.id, sub.id));
    await db.update(applications).set({ status: "submitted", updatedAt: new Date() }).where(eq(applications.id, applicationId));
    await logEvent(userId, applicationId, "submitted", `Submitted. Employer confirmation: “${outcome.confirmationText}”`);
  } finally {
    running.delete(applicationId);
  }
}

type FieldInfo = { name: string; label: string; required: boolean; tag: string; type: string; options: { label: string; value: string }[] };

/**
 * Fill and submit a standard HTML application form (the demo ATS follows
 * Greenhouse-style field names). Stops before submitting when the live form
 * asks for something the user did not approve.
 */
async function submitToForm(input: {
  userId: string;
  applicationId: string;
  url: string;
  payload: ApplicationPayload;
  cvPath: string | null;
}): Promise<Outcome> {
  const b = await browser();
  const context = await b.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const shot = async (name: string) => {
    const bytes = await page.screenshot({ fullPage: true, type: "png" });
    return putFile(`${input.userId}/submissions/${input.applicationId}-${name}-${Date.now()}.png`, bytes);
  };
  try {
    await page.goto(input.url, { waitUntil: "domcontentloaded" });
    const fields: FieldInfo[] = await page.$$eval("form [name]", (els) =>
      els
        .filter((el) => !(el as HTMLInputElement).type || (el as HTMLInputElement).type !== "hidden")
        .map((el) => {
          const e = el as HTMLInputElement;
          const id = e.id;
          const label = (id && document.querySelector(`label[for="${id}"]`)?.textContent) || e.getAttribute("aria-label") || e.name;
          const options =
            e.tagName === "SELECT"
              ? Array.from((e as unknown as HTMLSelectElement).options)
                  .filter((o) => o.value && !o.disabled)
                  .map((o) => ({ label: (o.textContent ?? o.value).trim(), value: o.value }))
              : [];
          return { name: e.name, label: label.replace(/\s*\*\s*$/, "").trim(), required: e.required, tag: e.tagName.toLowerCase(), type: e.type || "", options };
        }),
    );

    const approved = new Map(input.payload.answers.map((a) => [a.id, a]));
    const needs: Need[] = fields
      .filter((f) => f.type !== "file" && f.type !== "submit")
      .filter((f) => f.required && !approved.has(f.name))
      .map((f) => ({
        field: f.name,
        label: f.label,
        reason: "New required question on the live form that you haven't approved an answer for",
        ...(f.options.length ? { options: f.options } : {}),
      }));
    if (needs.length) {
      const formShot = await shot("form-drift");
      return {
        status: "needs_user",
        needs,
        formShot,
        message: `The live form asks something new (${needs.map((n) => `“${n.label}”`).join(", ")}). Nod stopped without sending anything.`,
      };
    }

    for (const f of fields) {
      const locator = page.locator(`[name="${f.name}"]`).first();
      if (f.type === "file") {
        if (input.cvPath) await locator.setInputFiles(input.cvPath);
        continue;
      }
      const a = approved.get(f.name);
      if (!a || !a.value) continue;
      if (f.tag === "select") await locator.selectOption(a.value);
      else await locator.fill(a.value);
    }
    const formShot = await shot("form-filled");
    await Promise.all([page.waitForURL(/\/thanks/, { timeout: 30_000 }), page.locator('form [type="submit"]').first().click()]);
    const confirmationText = ((await page.locator("[data-confirmation]").first().textContent()) ?? "").trim();
    const confirmShot = await shot("confirmation");
    if (!confirmationText) throw new Error("No confirmation was shown after submitting");
    return { status: "succeeded", confirmationText, formShot, confirmShot };
  } finally {
    await context.close();
  }
}
