import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, MessageCircleQuestion } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Card, SectionTitle } from "@/components/ui";
import { getDb } from "@/lib/db";
import { applications, facts, jobs } from "@/lib/db/schema";
import { cleanCompany } from "@/lib/format";
import { buildPrep } from "@/lib/prep";
import { requireUser } from "@/lib/session";

async function PrepContent({ params }: PageProps<"/app/applications/[id]/prep">) {
  const user = await requireUser();
  const { id } = await params;
  const db = await getDb();
  const [row] = await db
    .select({ id: applications.id, title: jobs.title, company: jobs.company, skills: jobs.skills })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(and(eq(applications.id, id), eq(applications.userId, user.id)));
  if (!row) notFound();
  const confirmed = await db
    .select()
    .from(facts)
    .where(and(eq(facts.userId, user.id), eq(facts.confirmed, true)))
    .orderBy(asc(facts.position));
  const company = cleanCompany(row.company);
  const prep = buildPrep(confirmed, { title: row.title, company, skills: row.skills });

  return (
    <div className="space-y-6 animate-rise">
      <Link href={`/app/applications/${row.id}`} className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="size-3.5" /> Back to application
      </Link>
      <SectionTitle eyebrow="Interview prep" title={`${row.title} · ${company}`} />
      <p className="max-w-2xl text-[14px] text-muted">
        Likely questions, with talking points taken word for word from your confirmed facts. Nothing here is made up. Where you have no
        fact to point to, Nod says so.
      </p>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {prep.questions.map((q) => (
            <Card key={q.question} className="p-5">
              <p className="font-medium">{q.question}</p>
              {q.points.length ? (
                <ul className="mt-2 space-y-1.5 text-[13px] text-ink-2">
                  {q.points.map((p) => (
                    <li key={p.factId} className="flex gap-2">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-traced" />
                      {p.text}
                    </li>
                  ))}
                </ul>
              ) : null}
              {q.hint ? <p className="mt-2 text-[12px] text-muted">{q.hint}</p> : null}
            </Card>
          ))}
        </div>
        <aside>
          <Card className="p-5">
            <p className="flex items-center gap-1.5 font-medium">
              <MessageCircleQuestion className="size-4" /> Questions to ask them
            </p>
            <ul className="mt-3 space-y-2 text-[13px] text-ink-2">
              {prep.askThem.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}

export default function PrepPage(props: PageProps<"/app/applications/[id]/prep">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PrepContent {...props} />
    </Suspense>
  );
}
