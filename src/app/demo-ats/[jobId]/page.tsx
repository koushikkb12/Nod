import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DEMO_JOBS, demoJob } from "@/lib/jobs/demo";
import { cleanHtml } from "@/lib/jobs/normalize";
import type { FormQuestion } from "@/lib/types";

export function generateStaticParams() {
  return DEMO_JOBS.map((j) => ({ jobId: j.id }));
}

export const metadata = { title: "Apply · Hirefield (demo ATS)" };

function FieldInput({ q }: { q: FormQuestion }) {
  const common = {
    id: q.id,
    name: q.id,
    required: q.required,
    className:
      "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20",
  };
  if (q.type === "textarea") return <textarea {...common} rows={5} />;
  if (q.type === "file") return <input {...common} type="file" accept=".pdf,application/pdf" className="mt-1 block w-full text-sm text-slate-700" />;
  if (q.type === "select")
    return (
      <select {...common} defaultValue="">
        <option value="" disabled>
          Select…
        </option>
        {q.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  return <input {...common} type={q.id === "email" ? "email" : "text"} />;
}

async function DemoAtsForm({ params }: PageProps<"/demo-ats/[jobId]">) {
  if (process.env.NODE_ENV === "production") notFound();
  const { jobId } = await params;
  const job = demoJob(decodeURIComponent(jobId));
  if (!job) notFound();
  const fields = [...job.questions, ...job.liveOnlyFields];
  const company = job.company.replace(/ \(demo\)$/, "");
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <div className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-[13px] text-amber-900">
        Demo employer. This form is hosted by Nod for testing, and no real company receives these applications.
      </div>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">{company}</span>
          <span className="text-xs text-slate-500">Powered by Hirefield</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold">{job.title}</h1>
        <p className="mt-1 text-slate-600">
          {job.location} · {job.workplace}
        </p>
        <details className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-blue-700">Job description</summary>
          <div className="prose-job mt-3" dangerouslySetInnerHTML={{ __html: cleanHtml(job.html) }} />
        </details>
        <form
          method="post"
          action={`/api/demo-ats/${encodeURIComponent(job.id)}`}
          encType="multipart/form-data"
          className="mt-8 space-y-5 rounded-lg border border-slate-200 bg-white p-6"
        >
          <h2 className="text-lg font-semibold">Apply for this job</h2>
          {fields.map((q) => (
            <div key={q.id}>
              <label htmlFor={q.id} className="text-sm font-medium text-slate-800">
                {q.label}
                {q.required ? <span className="text-red-600"> *</span> : null}
              </label>
              <FieldInput q={q} />
            </div>
          ))}
          <button type="submit" className="rounded-md bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
            Submit application
          </button>
        </form>
      </main>
    </div>
  );
}

export default function DemoAtsPage(props: PageProps<"/demo-ats/[jobId]">) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <DemoAtsForm {...props} />
    </Suspense>
  );
}
