import { Suspense } from "react";
import { DEMO_JOBS, demoJob } from "@/lib/jobs/demo";

export function generateStaticParams() {
  return DEMO_JOBS.map((j) => ({ jobId: j.id }));
}

async function Confirmation({ params }: PageProps<"/demo-ats/[jobId]/thanks">) {
  const { jobId } = await params;
  const job = demoJob(decodeURIComponent(jobId));
  const company = job?.company.replace(/ \(demo\)$/, "") ?? "the employer";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">✓</div>
      <h1 className="mt-4 text-2xl font-semibold">Thanks, your application was received</h1>
      <p className="mt-2 text-slate-600">
        {company} will review it and be in touch. Applied for {job?.title ?? "this role"}.
      </p>
      <p data-confirmation className="mt-6 inline-block rounded-md bg-slate-100 px-4 py-2 font-mono text-sm text-slate-800">
        Application received in the demo employer inbox.
      </p>
    </div>
  );
}

export default function ThanksPage(props: PageProps<"/demo-ats/[jobId]/thanks">) {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <div className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-[13px] text-amber-900">
        Demo employer. No real company receives these applications.
      </div>
      <main className="mx-auto max-w-xl px-6 py-16">
        <Suspense fallback={<div className="h-56 animate-pulse rounded-lg bg-white" />}>
          <Confirmation {...props} />
        </Suspense>
      </main>
    </div>
  );
}
