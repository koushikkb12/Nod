import { Suspense } from "react";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { and, count, desc, eq, gte, ilike, isNotNull, or, type SQL } from "drizzle-orm";
import { AlertTriangle, BadgeCheck, CircleSlash } from "lucide-react";
import Link from "next/link";
import { CompanyTile, ScoreRing } from "@/components/brand";
import { MatchActions, PrepareButton } from "@/components/app/match-actions";
import { AddJobForm } from "@/components/app/add-job";
import { RefreshJobsButton } from "@/components/app/refresh-jobs";
import { Badge, Button, Card, cn, Empty, Input, SectionTitle, Select } from "@/components/ui";
import { getDb } from "@/lib/db";
import { applications, jobs, matches } from "@/lib/db/schema";
import { cleanCompany, salaryRange, SOURCE_LABEL, timeAgo } from "@/lib/format";
import { ingestRunning, latestIngest } from "@/lib/jobs/ingest";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Jobs" };

const TABS = [
  ["new", "New"],
  ["shortlisted", "Saved"],
  ["dismissed", "Dismissed"],
] as const;

const WORKPLACES = ["remote", "hybrid", "onsite"] as const;
const SOURCES = ["greenhouse", "lever", "ashby", "adzuna", "demo"] as const;
const POSTED = [["7", "Past week"], ["14", "Past 2 weeks"], ["30", "Past month"]] as const;
const MIN_SCORES = ["50", "60", "70", "80"] as const;

type Filters = Partial<Record<"workplace" | "source" | "posted" | "minScore" | "salary" | "sponsor", string>>;

function readFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const pick = <T extends readonly string[]>(key: string, allowed: T) => {
    const v = sp[key];
    return typeof v === "string" && (allowed as readonly string[]).includes(v) ? v : undefined;
  };
  return {
    workplace: pick("workplace", WORKPLACES),
    source: pick("source", SOURCES),
    posted: pick("posted", POSTED.map(([d]) => d)),
    minScore: pick("minScore", MIN_SCORES),
    salary: pick("salary", ["1"]),
    sponsor: pick("sponsor", ["1"]),
  };
}

function filterWhere(f: Filters): (SQL | undefined)[] {
  return [
    f.workplace ? eq(jobs.workplace, f.workplace as (typeof WORKPLACES)[number]) : undefined,
    f.source ? eq(jobs.source, f.source as (typeof SOURCES)[number]) : undefined,
    f.posted ? gte(jobs.postedAt, new Date(Date.now() - Number(f.posted) * 86_400_000)) : undefined,
    f.minScore ? gte(matches.score, Number(f.minScore)) : undefined,
    f.salary ? or(isNotNull(jobs.salaryMin), isNotNull(jobs.salaryMax)) : undefined,
    f.sponsor ? isNotNull(jobs.sponsorMatch) : undefined,
  ];
}

const defined = (o: Record<string, string | undefined>) =>
  Object.fromEntries(Object.entries(o).filter((e): e is [string, string] => Boolean(e[1])));

async function JobsPageContent({ searchParams }: PageProps<"/app/jobs">) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = (TABS.find(([t]) => t === sp.tab)?.[0] ?? "new") as "new" | "shortlisted" | "dismissed";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const limit = Math.min(250, Number(sp.limit) || 40);
  const filters = readFilters(sp);
  const filtered = Object.values(filters).some(Boolean);
  const keep = defined({ q, ...filters });
  const db = await getDb();

  const where = and(
    eq(matches.userId, user.id),
    eq(matches.status, tab),
    eq(jobs.isOpen, true),
    q ? or(ilike(jobs.title, `%${q}%`), ilike(jobs.company, `%${q}%`), ilike(jobs.location, `%${q}%`)) : undefined,
    ...filterWhere(filters),
  );
  const rows = await db
    .select({ m: matches, j: { id: jobs.id, title: jobs.title, company: jobs.company, location: jobs.location, workplace: jobs.workplace, salaryMin: jobs.salaryMin, salaryMax: jobs.salaryMax, salaryCurrency: jobs.salaryCurrency, postedAt: jobs.postedAt, source: jobs.source, isDemo: jobs.isDemo, sponsorMatch: jobs.sponsorMatch, riskFlags: jobs.riskFlags } })
    .from(matches)
    .innerJoin(jobs, eq(jobs.id, matches.jobId))
    .where(where)
    .orderBy(desc(jobs.isDemo), desc(matches.score))
    .limit(limit);
  const [{ total }] = await db.select({ total: count() }).from(matches).innerJoin(jobs, eq(jobs.id, matches.jobId)).where(where);
  const counts = Object.fromEntries(
    await Promise.all(
      TABS.map(async ([t]) => {
        const [{ n }] = await db.select({ n: count() }).from(matches).innerJoin(jobs, eq(jobs.id, matches.jobId)).where(and(eq(matches.userId, user.id), eq(matches.status, t), eq(jobs.isOpen, true)));
        return [t, n];
      }),
    ),
  );
  const applied = new Set((await db.select({ jobId: applications.jobId }).from(applications).where(eq(applications.userId, user.id))).map((a) => a.jobId));
  const run = await latestIngest();
  const href = (params: Record<string, string>) => `/app/jobs?${new URLSearchParams({ ...keep, tab, ...params })}`;

  return (
    <div className="space-y-6 animate-rise">
      <SectionTitle eyebrow="Jobs" title="Matches for you">
        <RefreshJobsButton initiallyRunning={ingestRunning()} />
      </SectionTitle>
      <p className="-mt-2 text-[13px] text-muted">
        {run
          ? `Read ${run.stats.total.toLocaleString("en-GB")} open jobs straight from employer boards ${timeAgo(run.finishedAt ?? run.startedAt)}. Only jobs that fit your preferences appear here.`
          : "Press “Find new jobs” to read every company board. The first run takes about a minute."}
      </p>

      <div className="max-w-xl">
        <AddJobForm />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full border border-line bg-card p-1">
          {TABS.map(([t, label]) => (
            <Link key={t} href={`/app/jobs?${new URLSearchParams({ ...keep, tab: t })}`} className={cn("rounded-full px-3.5 py-1.5 text-[13px]", tab === t ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2")}>
              {label} <span className="ml-0.5 font-mono text-[11px] opacity-70">{counts[t]}</span>
            </Link>
          ))}
        </div>
        <form className="w-full max-w-xs">
          <input type="hidden" name="tab" value={tab} />
          {Object.entries(filters).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
          <Input name="q" defaultValue={q} placeholder="Filter by title, company, place…" className="h-9 text-sm" />
        </form>
      </div>

      <form className="flex flex-wrap items-center gap-2 text-[13px]" aria-label="Filters">
        <input type="hidden" name="tab" value={tab} />
        {q ? <input type="hidden" name="q" value={q} /> : null}
        <Select name="workplace" defaultValue={filters.workplace ?? ""} aria-label="Workplace" className="h-9 w-auto text-[13px]">
          <option value="">Any workplace</option>
          {WORKPLACES.map((w) => (
            <option key={w} value={w} className="capitalize">{w[0].toUpperCase() + w.slice(1)}</option>
          ))}
        </Select>
        <Select name="posted" defaultValue={filters.posted ?? ""} aria-label="Posted" className="h-9 w-auto text-[13px]">
          <option value="">Posted any time</option>
          {POSTED.map(([d, label]) => (
            <option key={d} value={d}>{label}</option>
          ))}
        </Select>
        <Select name="minScore" defaultValue={filters.minScore ?? ""} aria-label="Minimum score" className="h-9 w-auto text-[13px]">
          <option value="">Any score</option>
          {MIN_SCORES.map((n) => (
            <option key={n} value={n}>Score {n}+</option>
          ))}
        </Select>
        <Select name="source" defaultValue={filters.source ?? ""} aria-label="Source" className="h-9 w-auto text-[13px]">
          <option value="">All sources</option>
          {SOURCES.map((src) => (
            <option key={src} value={src}>{SOURCE_LABEL[src]}</option>
          ))}
        </Select>
        <label className="flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5">
          <input type="checkbox" name="salary" value="1" defaultChecked={Boolean(filters.salary)} className="size-3.5 accent-ink" /> Salary stated
        </label>
        <label className="flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5">
          <input type="checkbox" name="sponsor" value="1" defaultChecked={Boolean(filters.sponsor)} className="size-3.5 accent-ink" /> Licensed sponsor
        </label>
        <Button type="submit" variant="outline" size="sm">Apply filters</Button>
        {filtered ? (
          <Link href={`/app/jobs?${new URLSearchParams(defined({ tab, q }))}`} className="text-muted underline underline-offset-4 hover:text-ink">
            Clear filters
          </Link>
        ) : null}
      </form>

      {rows.length ? (
        <ul className="space-y-3">
          {rows.map(({ m, j }) => {
            const salary = salaryRange(j.salaryMin, j.salaryMax, j.salaryCurrency);
            return (
              <li key={m.id}>
                <Card className="group p-5 transition-shadow hover:shadow-[var(--shadow-lift)]">
                  <div className="flex gap-4">
                    <ScoreRing score={m.score} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/app/jobs/${encodeURIComponent(j.id)}`} className="text-[16px] font-medium hover:underline hover:underline-offset-4">
                            {j.title}
                          </Link>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
                            <span className="font-medium text-ink-2">{cleanCompany(j.company)}</span>
                            <span>{j.location || "Location not stated"}</span>
                            {salary ? <span className="text-ink-2">{salary}</span> : null}
                            {j.postedAt ? <span>{timeAgo(j.postedAt)}</span> : null}
                          </p>
                        </div>
                        <MatchActions jobId={j.id} status={m.status} />
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {j.isDemo ? <Badge tone="info">Demo employer · Nod can submit</Badge> : <Badge tone="outline">{SOURCE_LABEL[j.source]}</Badge>}
                        {j.workplace !== "unknown" ? <Badge tone="neutral" className="capitalize">{j.workplace}</Badge> : null}
                        {j.sponsorMatch ? (
                          <Badge tone="traced">
                            <BadgeCheck /> On UK sponsor register
                          </Badge>
                        ) : null}
                        {applied.has(j.id) ? <Badge tone="nod">Application started</Badge> : null}
                      </div>
                      <ul className="mt-3 space-y-1 text-[13px] text-ink-2">
                        {m.reasons.slice(0, 3).map((r) => (
                          <li key={r} className="flex gap-2">
                            <span className="mt-[7px] size-1 shrink-0 rounded-full bg-traced" /> {r}
                          </li>
                        ))}
                        {m.missingSkills.length ? (
                          <li className="flex gap-2 text-muted">
                            <CircleSlash className="mt-0.5 size-3.5 shrink-0" /> Not in your facts: {m.missingSkills.slice(0, 5).join(", ")}
                          </li>
                        ) : null}
                        {m.warnings.slice(0, 2).map((w) => (
                          <li key={w} className="flex gap-2 text-warn">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {w}
                          </li>
                        ))}
                      </ul>
                      {m.status === "dismissed" && m.dismissReason ? <p className="mt-2 text-[12px] text-muted">Dismissed: {m.dismissReason}</p> : null}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {!applied.has(j.id) && m.status !== "dismissed" ? <PrepareButton jobId={j.id} /> : null}
                        <Link href={`/app/jobs/${encodeURIComponent(j.id)}`} className="inline-flex h-8 items-center rounded-full px-3 text-[13px] text-ink-2 hover:bg-paper-2">
                          Read the ad
                        </Link>
                      </div>
                    </div>
                    <CompanyTile name={j.company} className="hidden sm:flex" />
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty title={filtered ? "No matches for these filters" : tab === "new" ? "No new matches yet" : tab === "shortlisted" ? "Nothing saved yet" : "Nothing dismissed"}>
          {filtered ? null : tab === "new" ? (
            <>
              Confirm your facts, set your preferences, then press “Find new jobs”.{" "}
              <Link href="/app/preferences" className="underline underline-offset-4">
                Check your preferences
              </Link>{" "}
              if your filters are very narrow.
            </>
          ) : null}
        </Empty>
      )}

      {rows.length < total ? (
        <div className="text-center">
          <Link href={href({ limit: String(limit + 40) })} className="text-[13px] text-ink underline underline-offset-4" scroll={false}>
            Show more ({total - rows.length} more)
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export default function JobsPage(props: PageProps<"/app/jobs">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <JobsPageContent {...props} />
    </Suspense>
  );
}
