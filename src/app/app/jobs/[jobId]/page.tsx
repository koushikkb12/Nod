import { Suspense } from "react";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { and, eq, notInArray } from "drizzle-orm";
import { AlertTriangle, ArrowLeft, ArrowUpRight, BadgeCheck, Check, CircleSlash, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyTile, ScoreRing } from "@/components/brand";
import { MatchActions, PrepareButton } from "@/components/app/match-actions";
import { MatchSummary } from "@/components/app/match-summary";
import { hasAI } from "@/lib/ai";
import { Badge, buttonVariants, Card, cn } from "@/components/ui";
import { getDb } from "@/lib/db";
import { applications, jobs, matches } from "@/lib/db/schema";
import { cleanCompany, salaryRange, SOURCE_LABEL, timeAgo, riskLabel } from "@/lib/format";
import { cleanHtml } from "@/lib/jobs/normalize";
import { requireUser } from "@/lib/session";
import { APP_STATUS_LABEL } from "@/lib/types";

function decode(id: string) {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

async function JobPageContent({ params }: PageProps<"/app/jobs/[jobId]">) {
  const user = await requireUser();
  const jobId = decode((await params).jobId);
  const db = await getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) notFound();
  const [match] = await db.select().from(matches).where(and(eq(matches.userId, user.id), eq(matches.jobId, jobId)));
  const [app] = await db
    .select({ id: applications.id, status: applications.status })
    .from(applications)
    .where(and(eq(applications.userId, user.id), eq(applications.jobId, jobId), notInArray(applications.status, ["withdrawn"])));
  const salary = salaryRange(job.salaryMin, job.salaryMax, job.salaryCurrency);

  return (
    <div className="space-y-6 animate-rise">
      <Link href="/app/jobs" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="size-3.5" /> All jobs
      </Link>

      <div className="flex flex-wrap items-start gap-5">
        <CompanyTile name={job.company} className="size-14 rounded-[14px] text-[16px]" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[40px] leading-[1.05]">{job.title}</h1>
          <p className="mt-2 flex flex-wrap gap-x-3 text-[14px] text-muted">
            <span className="font-medium text-ink-2">{cleanCompany(job.company)}</span>
            <span>{job.location || "Location not stated"}</span>
            {salary ? <span className="text-ink-2">{salary}</span> : null}
            {job.postedAt ? <span>Posted {timeAgo(job.postedAt)}</span> : null}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {job.isDemo ? <Badge tone="info">Demo employer · Nod can submit for you</Badge> : <Badge tone="outline">Via {SOURCE_LABEL[job.source]}</Badge>}
            {job.workplace !== "unknown" ? <Badge className="capitalize">{job.workplace}</Badge> : null}
            {job.employmentType ? <Badge>{job.employmentType}</Badge> : null}
            {!job.isOpen ? <Badge tone="blocked">Closed</Badge> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {match ? <MatchActions jobId={job.id} status={match.status} /> : null}
          <a href={job.sourceUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Employer page <ArrowUpRight />
          </a>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="p-6 sm:p-8">
          <div className="prose-job" dangerouslySetInnerHTML={{ __html: cleanHtml(job.descriptionHtml) || `<p>${job.descriptionText}</p>` }} />
        </Card>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="p-5">
            {match ? (
              <>
                <div className="flex items-center gap-4">
                  <ScoreRing score={match.score} size={58} />
                  <div>
                    <p className="font-medium">Match score</p>
                    <p className="text-[13px] text-muted">Based on your confirmed facts and preferences</p>
                  </div>
                </div>
                {hasAI() ? <MatchSummary jobId={job.id} summary={match.aiSummary} /> : null}
                <ul className="mt-4 space-y-1.5 text-[13px] text-ink-2">
                  {match.reasons.map((r) => (
                    <li key={r} className="flex gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-traced" /> {r}
                    </li>
                  ))}
                  {match.warnings.map((w) => (
                    <li key={w} className="flex gap-2 text-warn">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {w}
                    </li>
                  ))}
                </ul>
                {match.matchedSkills.length ? (
                  <div className="mt-4">
                    <p className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.1em] text-muted">You have</p>
                    <div className="flex flex-wrap gap-1">
                      {match.matchedSkills.map((s) => (
                        <Badge key={s} tone="traced">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
                {match.missingSkills.length ? (
                  <div className="mt-3">
                    <p className="mb-1.5 flex items-center gap-1 text-[12px] font-medium uppercase tracking-[0.1em] text-muted">
                      <CircleSlash className="size-3" /> Not in your facts
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {match.missingSkills.map((s) => (
                        <Badge key={s} tone="outline">
                          {s}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-2 text-[12px] text-muted">Nod won't claim these. If you do have them, add them as facts first.</p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-[13px] text-muted">This job doesn't fit your current preferences, so it has no match score.</p>
            )}

            <div className="mt-5 border-t border-line pt-5">
              {app ? (
                <Link href={`/app/applications/${app.id}`} className={cn(buttonVariants({ variant: "nod" }), "w-full")}>
                  Open application · {APP_STATUS_LABEL[app.status]}
                </Link>
              ) : job.isOpen ? (
                <PrepareButton jobId={job.id} size="md" />
              ) : null}
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                Nod drafts a tailored CV, a cover letter and form answers using only your confirmed facts. Nothing is sent until you approve it.
              </p>
            </div>
          </Card>

          {job.sponsorMatch ? (
            <Card className="flex gap-3 p-4 text-[13px]">
              <BadgeCheck className="size-4 shrink-0 text-traced" />
              <p className="text-ink-2">
                <span className="font-medium text-ink">{job.sponsorMatch}</span> appears on the UK Home Office register of licensed sponsors. That doesn't guarantee this role is sponsored.
              </p>
            </Card>
          ) : null}
          {job.riskFlags.length ? (
            <Card className="border-warn/40 bg-warn-bg/50 p-4 text-[13px]">
              <p className="flex items-center gap-1.5 font-medium text-warn">
                <ShieldAlert className="size-4" /> Things to check
              </p>
              <ul className="mt-2 space-y-1 text-ink-2">
                {job.riskFlags.map((f) => (
                  <li key={f}>· {riskLabel(f)}</li>
                ))}
              </ul>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

export default function JobPage(props: PageProps<"/app/jobs/[jobId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <JobPageContent {...props} />
    </Suspense>
  );
}
