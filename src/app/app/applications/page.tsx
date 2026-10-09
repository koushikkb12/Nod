import { Suspense } from "react";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { CompanyTile } from "@/components/brand";
import { Badge, Card, cn, Empty, SectionTitle } from "@/components/ui";
import { getDb } from "@/lib/db";
import { applications, jobs } from "@/lib/db/schema";
import { cleanCompany, timeAgo } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { APP_STATUS_LABEL, type AppStatus } from "@/lib/types";

export const metadata = { title: "Applications" };

const COLUMNS: { title: string; statuses: AppStatus[]; tone: string }[] = [
  { title: "Needs you", statuses: ["drafted", "needs_user"], tone: "bg-nod" },
  { title: "In progress", statuses: ["approved", "submitting", "manual_kit"], tone: "bg-info" },
  { title: "Applied", statuses: ["submitted"], tone: "bg-traced" },
  { title: "Interviews & offers", statuses: ["interviewing", "offer"], tone: "bg-traced" },
  { title: "Closed", statuses: ["rejected", "withdrawn", "failed"], tone: "bg-line-2" },
];

async function ApplicationsPageContent() {
  const user = await requireUser();
  const db = await getDb();
  const rows = await db
    .select({ id: applications.id, status: applications.status, mode: applications.mode, updatedAt: applications.updatedAt, title: jobs.title, company: jobs.company, isDemo: jobs.isDemo })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(eq(applications.userId, user.id))
    .orderBy(desc(applications.updatedAt));

  return (
    <div className="space-y-8 animate-rise">
      <SectionTitle eyebrow="Applications" title="Your applications" />
      {rows.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {COLUMNS.map((c) => {
            const list = rows.filter((r) => c.statuses.includes(r.status));
            return (
              <section key={c.title} className="min-w-0">
                <div className="mb-3 flex items-center gap-2 px-1">
                  <span className={cn("size-2 rounded-full", c.tone)} />
                  <h2 className="text-[13px] font-medium">{c.title}</h2>
                  <span className="font-mono text-[11px] text-muted">{list.length}</span>
                </div>
                <div className="space-y-2.5 rounded-[14px] bg-paper-2/60 p-2 min-h-24">
                  {list.map((r) => (
                    <Link key={r.id} href={`/app/applications/${r.id}`}>
                      <Card className="mb-2.5 p-3.5 transition-shadow hover:shadow-[var(--shadow-lift)]">
                        <div className="flex items-start gap-2.5">
                          <CompanyTile name={r.company} className="size-8 rounded-[8px] text-[11px]" />
                          <div className="min-w-0">
                            <p className="line-clamp-2 text-[13px] font-medium leading-snug">{r.title}</p>
                            <p className="truncate text-[12px] text-muted">{cleanCompany(r.company)}</p>
                          </div>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <Badge tone={r.status === "needs_user" ? "warn" : r.status === "failed" ? "blocked" : "neutral"} className="text-[11px]">
                            {APP_STATUS_LABEL[r.status]}
                          </Badge>
                          <span className="font-mono text-[10px] text-muted">{timeAgo(r.updatedAt)}</span>
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <Empty title="No applications yet">
          Open a job you like and press “Prepare application”. Nod drafts it from your facts and waits for your nod.{" "}
          <Link href="/app/jobs" className="underline underline-offset-4">
            Browse matches
          </Link>
        </Empty>
      )}
    </div>
  );
}

export default function ApplicationsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ApplicationsPageContent />
    </Suspense>
  );
}
