import { getDb } from "@/lib/db";
import { demoAtsApplications } from "@/lib/db/schema";
import { demoJob } from "@/lib/jobs/demo";
import { putFile, sha256 } from "@/lib/server-utils";

/** The demo employer receives an application. */
export async function POST(req: Request, ctx: RouteContext<"/api/demo-ats/[jobId]">) {
  const { jobId } = await ctx.params;
  const job = demoJob(decodeURIComponent(jobId));
  if (!job) return new Response("No such job", { status: 404 });

  const form = await req.formData();
  const fields: Record<string, string> = {};
  let resume: File | null = null;
  for (const [k, v] of form.entries()) {
    if (v instanceof File) {
      if (v.size) resume = v;
    } else {
      fields[k] = v;
    }
  }
  const missing = [...job.questions, ...job.liveOnlyFields]
    .filter((q) => q.required && (q.type === "file" ? !resume : !fields[q.id]?.trim()))
    .map((q) => q.label);
  if (missing.length) {
    return new Response(`Missing required fields: ${missing.join(", ")}`, { status: 400 });
  }

  const ref = `HF-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  let resumeFile: string | null = null;
  let resumeSha: string | null = null;
  if (resume) {
    const bytes = Buffer.from(await resume.arrayBuffer());
    resumeSha = sha256(bytes);
    resumeFile = await putFile(`_demo-ats/${ref}.pdf`, bytes);
  }
  const db = await getDb();
  await db.insert(demoAtsApplications).values({ id: ref, jobId: job.id, fields, resumeFile, resumeSha256: resumeSha });

  const url = new URL(`/demo-ats/${encodeURIComponent(job.id)}/thanks`, req.url);
  url.searchParams.set("ref", ref);
  return Response.redirect(url, 303);
}
