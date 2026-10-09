import { Suspense } from "react";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { CompanyTile, ScoreRing } from "@/components/brand";
import { RefreshJobsButton } from "@/components/app/refresh-jobs";
import { Badge, buttonVariants, Card, cn, SectionTitle } from "@/components/ui";
import { getDb } from "@/lib/db";
import { applications, events, facts, jobs, matches, preferences, profiles } from "@/lib/db/schema";
import { cleanCompany, timeAgo } from "@/lib/format";
import { ingestRunning, latestIngest } from "@/lib/jobs/ingest";
import { requireUser } from "@/lib/session";
import { APP_STATUS_LABEL } from "@/lib/types";

export const metadata = { title: "Home" };

async function HomePageContent() {
  const user = await requireUser();
  const db = await getDb();
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, user.id));
  const [prefs] = await db.select().from(preferences).where(eq(preferences.userId, user.id));
  const factRows = await db.select({ confirmed: facts.confirmed }).from(facts).where(eq(facts.userId, user.id));
  const confirmed = factRows.filter((f) => f.confirmed).length;
  const run = await latestIngest();
  const [{ n: matchCount }] = await db
    .select({ n: count() })
    .from(matches)
    .where(and(eq(matches.userId, user.id), inArray(matches.status, ["new", "shortlisted"])));
  const apps = await db
    .select({ id: applications.id, status: applications.status, updatedAt: applications.updatedAt, title: jobs.title, company: jobs.company })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(eq(applications.userId, user.id))
    .orderBy(desc(applications.updatedAt));
  const waiting = apps.filter((a) => a.status === "drafted" || a.status === "needs_user");
  const sent = apps.filter((a) => ["submitted", "interviewing", "offer", "rejected"].includes(a.status)).length;
  const interviews = apps.filter((a) => a.status === "interviewing" || a.status === "offer").length;
  const top = await db
    .select({ jobId: matches.jobId, score: matches.score, reasons: matches.reasons, title: jobs.title, company: jobs.company, location: jobs.location, isDemo: jobs.isDemo })
    .from(matches)
    .innerJoin(jobs, eq(jobs.id, matches.jobId))
    .where(and(eq(matches.userId, user.id), eq(matches.status, "new"), eq(jobs.isOpen, true)))
    .orderBy(desc(matches.score))
    .limit(4);
  const activity = await db.select().from(events).where(eq(events.userId, user.id)).orderBy(desc(events.id)).limit(8);

  const steps = [
    { done: Boolean(profile?.cvText), title: "Upload your CV", body: "PDF, Word or text.", href: "/app/profile" },
    { done: confirmed > 0, title: "Confirm your facts", body: factRows.length ? `${confirmed} of ${factRows.length} confirmed` : "Nod only uses facts you confirm.", href: "/app/profile#facts" },
    { done: Boolean(prefs?.titles.length), title: "Set what you want", body: "Titles, places, salary, deal-breakers.", href: "/app/preferences" },
    { done: Boolean(run), title: "Find jobs", body: "Read every company board.", href: "/app/jobs" },
  ];
  const onboarding = steps.some((s) => !s.done);
  const firstName = (profile?.fullName || user.name).split(" ")[0];

  return (
    <div className="space-y-10 animate-rise">
      <SectionTitle eyebrow="Home" title={<>Hello, {firstName}.</>}>
        <RefreshJobsButton initiallyRunning={ingestRunning()} variant="outline" />
      </SectionTitle>

      {onboarding ? (
        <Card className="overflow-hidden">
          <div className="border-b border-line px-6 py-4">
            <p className="font-medium">Set up Nod in four steps</p>
            <p className="text-sm text-muted">Each step makes your matches and drafts more accurate.</p>
          </div>
          <ol className="grid divide-y divide-line sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            {steps.map((s, i) => (
              <li key={s.title}>
                <Link href={s.href} className="group flex h-full flex-col gap-3 p-5 hover:bg-paper-2/60">
                  <span className={cn("flex size-7 items-center justify-center rounded-full border font-mono text-[12px]", s.done ? "border-traced bg-traced text-paper" : "border-line-2 text-ink-2")}>
                    {s.done ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span>
                    <span className="block font-medium">{s.title}</span>
                    <span className="block text-[13px] text-muted">{s.body}</span>
                  </span>
                  {i === 3 && !s.done ? <span className="mt-auto text-[13px] text-ink underline underline-offset-4">Use the button above</span> : null}
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Waiting for your nod", waiting.length, "/app/applications"],
          ["Matches", matchCount, "/app/jobs"],
          ["Applications sent", sent, "/app/applications"],
          ["Interviews & offers", interviews, "/app/applications"],
        ].map(([label, value, href], i) => (
          <Link key={label as string} href={href as string}>
            <Card className={cn("p-5 transition-shadow hover:shadow-[var(--shadow-lift)]", i === 0 && Number(value) > 0 && "border-nod-deep bg-nod/30")}>
              <p className="text-[13px] text-muted">{label}</p>
              <p className="mt-2 font-display text-[44px] leading-none">{value as number}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4">
          {waiting.length ? (
            <div className="space-y-3">
              <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-muted">Waiting for you</h2>
              {waiting.slice(0, 4).map((a) => (
                <Link key={a.id} href={`/app/applications/${a.id}`}>
                  <Card className="mb-3 flex items-center gap-4 p-4 hover:shadow-[var(--shadow-lift)]">
                    <CompanyTile name={a.company} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.title}</p>
                      <p className="truncate text-[13px] text-muted">{cleanCompany(a.company)}</p>
                    </div>
                    <Badge tone={a.status === "needs_user" ? "warn" : "nod"}>{APP_STATUS_LABEL[a.status]}</Badge>
                    <ArrowRight className="size-4 text-muted" />
                  </Card>
                </Link>
              ))}
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-muted">Best new matches</h2>
            <Link href="/app/jobs" className="text-[13px] text-ink-2 underline underline-offset-4">
              All jobs
            </Link>
          </div>
          {top.length ? (
            top.map((m) => (
              <Link key={m.jobId} href={`/app/jobs/${encodeURIComponent(m.jobId)}`}>
                <Card className="mb-3 flex items-center gap-4 p-4 hover:shadow-[var(--shadow-lift)]">
                  <ScoreRing score={m.score} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {m.title} {m.isDemo ? <Badge tone="info" className="ml-1 align-middle">Demo</Badge> : null}
                    </p>
                    <p className="truncate text-[13px] text-muted">
                      {cleanCompany(m.company)} · {m.location}
                    </p>
                    <p className="mt-1 truncate text-[12px] text-ink-2">{m.reasons[0]}</p>
                  </div>
                </Card>
              </Link>
            ))
          ) : (
            <Card className="p-6 text-sm text-muted">
              No matches yet. {confirmed ? "Press “Find new jobs” to read the company boards." : "Upload your CV and confirm your facts first."}
            </Card>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-[13px] font-medium uppercase tracking-[0.12em] text-muted">Activity</h2>
          <Card className="p-2">
            {activity.length ? (
              <ul>
                {activity.map((e) => (
                  <li key={e.id} className="flex gap-3 rounded-[10px] px-3 py-2.5 hover:bg-paper-2/60">
                    <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", e.type === "submitted" ? "bg-traced" : e.type === "approved" ? "bg-nod-deep" : e.type === "needs_user" || e.type === "warning" ? "bg-warn" : e.type === "failed" ? "bg-blocked" : "bg-line-2")} />
                    <div className="min-w-0">
                      {e.applicationId ? (
                        <Link href={`/app/applications/${e.applicationId}`} className="line-clamp-2 text-[13px] text-ink-2 hover:text-ink">
                          {e.message}
                        </Link>
                      ) : (
                        <p className="line-clamp-2 text-[13px] text-ink-2">{e.message}</p>
                      )}
                      <p className="font-mono text-[11px] text-muted">{timeAgo(e.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-6 text-center text-[13px] text-muted">Nothing yet. Activity shows up here as Nod works.</p>
            )}
          </Card>
          {run ? (
            <p className="mt-3 px-1 font-mono text-[11px] text-muted">
              Last job check {timeAgo(run.finishedAt ?? run.startedAt)} · {run.stats.total.toLocaleString("en-GB")} jobs
            </p>
          ) : null}
          {!onboarding ? null : (
            <Link href="/app/profile" className={cn(buttonVariants({ variant: "nod" }), "mt-6 w-full")}>
              Start with your CV <ArrowRight />
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HomePageContent />
    </Suspense>
  );
}
