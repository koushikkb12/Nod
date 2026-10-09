import { desc } from "drizzle-orm";
import { connection } from "next/server";
import { Suspense } from "react";
import { getDb } from "@/lib/db";
import { demoAtsApplications } from "@/lib/db/schema";
import { demoJob } from "@/lib/jobs/demo";

export const metadata = { title: "Employer inbox · Hirefield (demo ATS)" };

async function Inbox() {
  await connection();
  const db = await getDb();
  const rows = await db.select().from(demoAtsApplications).orderBy(desc(demoAtsApplications.receivedAt)).limit(50);
  if (!rows.length) return <p className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-slate-500">No applications yet.</p>;
  return (
    <ul className="space-y-4">
      {rows.map((r) => {
        const job = demoJob(r.jobId);
        const f = r.fields;
        return (
          <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">
                {f.first_name} {f.last_name} <span className="font-normal text-slate-500">applied for {job?.title}</span>
              </p>
              <span className="font-mono text-xs text-slate-500">
                {r.id} · {r.receivedAt.toLocaleString("en-GB")}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {job?.company.replace(/ \(demo\)$/, "")} · {f.email}
              {r.resumeFile ? (
                <>
                  {" · "}
                  <a className="text-blue-700 underline" href={`/api/demo-ats/files/${r.id}`} target="_blank">
                    CV (PDF)
                  </a>{" "}
                  <span className="font-mono text-[11px] text-slate-400">sha256 {r.resumeSha256?.slice(0, 12)}</span>
                </>
              ) : null}
            </p>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-blue-700">All answers</summary>
              <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[220px_1fr]">
                {Object.entries(f).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="whitespace-pre-wrap text-slate-800">{v}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

export default function InboxPage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <div className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-[13px] text-amber-900">
        Demo employer inbox: what the demo companies received.
      </div>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-6 text-2xl font-semibold">Received applications</h1>
        <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-white" />}>
          <Inbox />
        </Suspense>
      </main>
    </div>
  );
}
