import { Suspense } from "react";
import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Card, Empty, SectionTitle } from "@/components/ui";
import { getDb } from "@/lib/db";
import { applications, jobs, matches } from "@/lib/db/schema";
import { funnel, skillGaps, weeklyCounts } from "@/lib/insights";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Insights" };

const WEEKS = 8;

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper-2">
      <div className="h-full rounded-full bg-ink" style={{ width: `${max ? Math.max(4, (100 * value) / max) : 0}%` }} />
    </div>
  );
}

async function InsightsPageContent() {
  const user = await requireUser();
  const db = await getDb();
  const open = await db
    .select({ missingSkills: matches.missingSkills, matchedSkills: matches.matchedSkills })
    .from(matches)
    .innerJoin(jobs, eq(jobs.id, matches.jobId))
    .where(and(eq(matches.userId, user.id), inArray(matches.status, ["new", "shortlisted"]), eq(jobs.isOpen, true)));
  const apps = await db
    .select({ status: applications.status, createdAt: applications.createdAt })
    .from(applications)
    .where(eq(applications.userId, user.id));

  const gaps = skillGaps(open);
  const strengths = skillGaps(open.map((m) => ({ missingSkills: m.matchedSkills })), 6);
  const f = funnel(apps.map((a) => a.status));
  const weekly = weeklyCounts(apps.map((a) => a.createdAt), WEEKS);
  const weeklyMax = Math.max(1, ...weekly);

  return (
    <div className="space-y-8 animate-rise">
      <SectionTitle eyebrow="Insights" title="What your search is telling you" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-medium">Skills your matches ask for</h2>
          <p className="mt-1 text-[13px] text-muted">
            Across {open.length} open matches. If you have one of these, add it to a fact in{" "}
            <Link href="/app/profile#facts" className="underline underline-offset-4">CV &amp; facts</Link> and confirm it.
          </p>
          {gaps.length ? (
            <ul className="mt-5 space-y-3">
              {gaps.map((g) => (
                <li key={g.skill} className="text-[14px]">
                  <div className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate font-medium">{g.skill}</span>
                    <Bar value={g.jobs} max={gaps[0].jobs} />
                    <span className="w-16 shrink-0 text-right font-mono text-[12px] text-muted">{g.jobs} jobs</span>
                  </div>
                  {g.closeCalls ? (
                    <p className="ml-35 mt-0.5 text-[12px] text-ink-2">
                      In {g.closeCalls} {g.closeCalls === 1 ? "match" : "matches"} it&apos;s one of the last two skills you&apos;re missing.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 text-[13px] text-muted">No gaps yet. Find jobs to see which skills come up most.</p>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="font-medium">Your strongest skills</h2>
          <p className="mt-1 text-[13px] text-muted">Skills from your confirmed facts that your matches mention most. Lead with these.</p>
          {strengths.length ? (
            <ul className="mt-5 space-y-3">
              {strengths.map((s) => (
                <li key={s.skill} className="flex items-center gap-3 text-[14px]">
                  <span className="w-32 shrink-0 truncate font-medium">{s.skill}</span>
                  <Bar value={s.jobs} max={strengths[0].jobs} />
                  <span className="w-16 shrink-0 text-right font-mono text-[12px] text-muted">{s.jobs} jobs</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 text-[13px] text-muted">Confirm facts that name your skills to see them here.</p>
          )}
        </Card>
      </div>

      {apps.length ? (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <Card className="p-6">
            <h2 className="font-medium">Application funnel</h2>
            <ul className="mt-5 space-y-3">
              {f.stages.map((s) => (
                <li key={s.label} className="flex items-center gap-3 text-[14px]">
                  <span className="w-28 shrink-0">{s.label}</span>
                  <Bar value={s.count} max={f.stages[0].count} />
                  <span className="w-10 shrink-0 text-right font-mono text-[12px] text-muted">{s.count}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-4">
              <div>
                <p className="text-[13px] text-muted">Heard back</p>
                <p className="font-display text-[32px] leading-none">{f.responseRate === null ? "–" : `${f.responseRate}%`}</p>
              </div>
              <div>
                <p className="text-[13px] text-muted">Reached interview</p>
                <p className="font-display text-[32px] leading-none">{f.interviewRate === null ? "–" : `${f.interviewRate}%`}</p>
              </div>
            </div>
            <p className="mt-3 text-[12px] text-muted">Rates are out of applications sent. Update each application&apos;s status as you hear back.</p>
          </Card>

          <Card className="p-6">
            <h2 className="font-medium">Applications started</h2>
            <p className="mt-1 text-[13px] text-muted">Last {WEEKS} weeks</p>
            <div className="mt-5 flex h-32 items-end gap-2" role="img" aria-label={`Applications per week: ${weekly.join(", ")}`}>
              {weekly.map((n, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <span className="font-mono text-[11px] text-muted">{n || ""}</span>
                  <div className="w-full rounded-t-[6px] bg-ink" style={{ height: `${(100 * n) / weeklyMax}%`, minHeight: n ? 4 : 1 }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between font-mono text-[11px] text-muted">
              <span>{WEEKS} weeks ago</span>
              <span>This week</span>
            </div>
          </Card>
        </div>
      ) : (
        <Empty title="No applications yet">Your funnel and weekly progress show up once you draft your first application.</Empty>
      )}
    </div>
  );
}

export default function InsightsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <InsightsPageContent />
    </Suspense>
  );
}
