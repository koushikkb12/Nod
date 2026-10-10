import { getDb } from "@/lib/db";
import { applications, demoAtsApplications } from "@/lib/db/schema";
import { demoJob } from "@/lib/jobs/demo";
import { newId, putFile, sha256, verifyDemoSubmissionToken } from "@/lib/server-utils";
import { and, eq } from "drizzle-orm";

/** The demo employer receives an application. */
export async function POST(req: Request, ctx: RouteContext<"/api/demo-ats/[jobId]">) {
  // Demo employer endpoints deliberately stay local. The inbox has no
  // employer-account model, so exposing it in production would disclose CVs.
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });

  // Reject cross-site form posts before reading their potentially large body.
  const origin = req.headers.get("origin") ?? "";
  const referer = req.headers.get("referer") ?? "";
  const baseUrl = process.env.NOD_BASE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  let requestOrigin: string;
  let expectedOrigin: string;
  try {
    requestOrigin = origin ? new URL(origin).origin : referer ? new URL(referer).origin : "";
    expectedOrigin = new URL(baseUrl).origin;
  } catch {
    return new Response("Forbidden: invalid origin", { status: 403 });
  }
  if (requestOrigin !== expectedOrigin) {
    return new Response("Forbidden: invalid origin", { status: 403 });
  }
  const cookie = req.headers.get("cookie") ?? "";
  const tokenValue = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("nod_demo_submission="))?.slice("nod_demo_submission=".length) ?? null;
  const token = verifyDemoSubmissionToken(tokenValue);
  if (!token) return new Response("Unauthorized demo submission", { status: 401 });
  const rawLength = req.headers.get("content-length");
  const contentLength = Number(rawLength);
  if (!rawLength || !Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > 7 * 1024 * 1024) {
    return new Response("Application is too large or missing a valid content length", { status: 413 });
  }

  const { jobId } = await ctx.params;
  const job = demoJob(decodeURIComponent(jobId));
  if (!job) return new Response("No such job", { status: 404 });

  const db = await getDb();
  const [application] = await db.select({ userId: applications.userId, jobId: applications.jobId, status: applications.status })
    .from(applications)
    .where(and(eq(applications.id, token.applicationId), eq(applications.userId, token.userId)));
  if (!application || application.jobId !== job.id || application.status !== "submitting") {
    return new Response("Submission is no longer active", { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response("Invalid application form", { status: 400 });
  }
  const fields: Record<string, string> = {};
  let resume: File | null = null;
  let fieldCount = 0;
  const allowedFields = new Set([...job.questions, ...job.liveOnlyFields].map((q) => q.id));
  for (const [k, v] of form.entries()) {
    if (++fieldCount > 100) return new Response("Too many application fields", { status: 400 });
    if (v instanceof File) {
      if (v.size) {
        if (k !== "resume" || v.size > 6 * 1024 * 1024 || v.type !== "application/pdf" || !v.name.toLowerCase().endsWith(".pdf")) {
          return new Response("Upload a PDF CV under 6 MB", { status: 400 });
        }
        resume = v;
      }
    } else {
      if (!allowedFields.has(k) || k.length > 100 || v.length > 10_000) {
        return new Response("Invalid application field", { status: 400 });
      }
      fields[k] = v;
    }
  }
  const missing = [...job.questions, ...job.liveOnlyFields]
    .filter((q) => q.required && (q.type === "file" ? !resume : !fields[q.id]?.trim()))
    .map((q) => q.label);
  if (missing.length) {
    return new Response(`Missing required fields: ${missing.join(", ")}`, { status: 400 });
  }

  const ref = newId("HF", 24);
  let resumeFile: string | null = null;
  let resumeSha: string | null = null;
  if (resume) {
    const bytes = Buffer.from(await resume.arrayBuffer());
    if (bytes.length < 5 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return new Response("The uploaded file is not a valid PDF", { status: 400 });
    }
    resumeSha = sha256(bytes);
    resumeFile = await putFile(`_demo-ats/${ref}.pdf`, bytes);
  }
  await db.insert(demoAtsApplications).values({
    id: ref,
    jobId: job.id,
    applicationId: token.applicationId,
    ownerUserId: token.userId,
    fields,
    resumeFile,
    resumeSha256: resumeSha,
  });

  const url = new URL(`/demo-ats/${encodeURIComponent(job.id)}/thanks`, req.url);
  return Response.redirect(url, 303);
}
