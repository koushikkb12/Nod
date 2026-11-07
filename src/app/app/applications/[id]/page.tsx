import { Suspense } from "react";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { asc, desc, eq } from "drizzle-orm";
import { AlertTriangle, ArrowLeft, ArrowUpRight, Download, FileWarning, Receipt, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { answerNewQuestion } from "@/app/app/actions/applications";
import { CompanyTile } from "@/components/brand";
import { TrackingPanel } from "@/components/app/tracking";
import { AnswerRow, ApprovePanel, AutoRefresh, CopyButton, type FactRef, SentenceRow, StatusMenu } from "@/components/app/review";
import { SubmitButton } from "@/components/submit-button";
import { Badge, buttonVariants, Card, cn, Input, Select } from "@/components/ui";
import { absoluteApplyUrl, loadApplication, profileLite } from "@/lib/apps";
import { approvalBlockers, coverLetterText } from "@/lib/consent/payload";
import { getDb } from "@/lib/db";
import { events, facts, interviews, submissions } from "@/lib/db/schema";
import { classify } from "@/lib/draft/answers";
import { allSentences, included } from "@/lib/draft/guard";
import { cleanCompany, timeAgo } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { followUpDue } from "@/lib/tracking";
import { APP_STATUS_LABEL, type AppStatus } from "@/lib/types";

export const metadata = { title: "Review application" };

const TONE: Partial<Record<AppStatus, "nod" | "warn" | "traced" | "blocked" | "info" | "neutral">> = {
  drafted: "nod",
  needs_user: "warn",
  approved: "info",
  submitting: "info",
  manual_kit: "info",
  submitted: "traced",
  interviewing: "traced",
  offer: "traced",
  failed: "blocked",
  rejected: "neutral",
  withdrawn: "neutral",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">{children}</p>;
}

async function ApplicationPageContent({ params }: PageProps<"/app/applications/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const loaded = await loadApplication(user.id, id);
  if (!loaded?.job) notFound();
  const { app, job, profile } = loaded;
  const db = await getDb();

  const factRows = await db.select().from(facts).where(eq(facts.userId, user.id)).orderBy(asc(facts.position), asc(facts.createdAt));
  const factMap: Record<string, FactRef> = {};
  factRows.forEach((f, i) => (factMap[f.id] = { n: i + 1, text: f.text, confirmed: f.confirmed }));
  const subs = await db.select().from(submissions).where(eq(submissions.applicationId, app.id)).orderBy(desc(submissions.startedAt));
  const latest = subs[0];
  const succeeded = subs.find((s) => s.status === "succeeded");
  const interviewRows = await db.select().from(interviews).where(eq(interviews.applicationId, app.id)).orderBy(asc(interviews.startsAt));
  const timeline = await db.select().from(events).where(eq(events.applicationId, app.id)).orderBy(desc(events.id)).limit(20);

  const draft = app.draft;
  const editable = ["drafted", "needs_user", "approved", "manual_kit"].includes(app.status);
  const lite = profileLite(profile);
  const blockers = approvalBlockers(draft, lite);
  const sentences = allSentences(draft);
  const isCover = (a: (typeof draft.answers)[number]) => classify({ id: a.questionId, label: a.label, required: a.required, type: a.type }) === "cover_letter";
  const summary = {
    bullets: draft.roles.reduce((n, r) => n + included(r.bullets).length, 0) + included(draft.summary).length,
    cover: included(draft.coverLetter).length,
    answers: draft.answers.filter((a) => a.type !== "file").length,
    blocked: sentences.filter((s) => s.status === "blocked" && !s.removed).length,
    removed: sentences.filter((s) => s.removed).length,
  };
  const canAgent = job.isDemo || process.env.NOD_ALLOW_REAL_SUBMISSIONS === "true";
  const usedFactIds = [...new Set(sentences.filter((s) => !s.removed && s.status === "traced").flatMap((s) => s.factIds))].filter((f) => factMap[f]);
  const sent = ["submitted", "interviewing", "offer", "rejected"].includes(app.status);
  const contact = [lite.email, lite.phone, lite.location, ...lite.links.map((l) => l.url.replace(/^https?:\/\/(www\.)?/, ""))].filter(Boolean);
  const coverText = coverLetterText(draft);

  return (
    <div className="space-y-6 animate-rise">
      {app.status === "submitting" || (app.status === "approved" && app.mode === "agent") ? <AutoRefresh /> : null}
      <Link href="/app/applications" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="size-3.5" /> Applications
      </Link>

      <div className="flex flex-wrap items-start gap-4">
        <CompanyTile name={job.company} className="size-12" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Application · {cleanCompany(job.company)}</p>
          <h1 className="font-display text-[38px] leading-[1.05]">{job.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {sent ? <StatusMenu appId={app.id} status={app.status} /> : <Badge tone={TONE[app.status]} className="h-7 px-3 text-[13px]">{APP_STATUS_LABEL[app.status]}</Badge>}
          <Link href={`/app/jobs/${encodeURIComponent(job.id)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Job ad
          </Link>
        </div>
      </div>

      {draft.injectionWarnings.length ? (
        <Card className="flex gap-3 border-warn/40 bg-warn-bg/60 p-4 text-[13px]">
          <ShieldAlert className="size-5 shrink-0 text-warn" />
          <div>
            <p className="font-medium text-warn">This job ad contains hidden instructions aimed at AI tools</p>
            <p className="mt-0.5 text-ink-2">Nod ignored them. Anything they tried to make it claim is blocked below. Found: “{draft.injectionWarnings[0].slice(0, 160)}”</p>
          </div>
        </Card>
      ) : null}

      {app.status === "needs_user" && latest?.needs?.length ? (
        <Card className="border-warn/50 bg-warn-bg/50 p-5">
          <div className="flex gap-3">
            <FileWarning className="size-5 shrink-0 text-warn" />
            <div className="flex-1">
              <p className="font-medium">Nod stopped before sending: the live form changed</p>
              <p className="mt-0.5 text-[13px] text-ink-2">
                The employer's form now asks something you haven't approved. Nothing was sent. Answer it, then approve again.
              </p>
              <div className="mt-4 space-y-3">
                {latest.needs.map((n) => (
                  <form key={n.field} action={answerNewQuestion} className="rounded-[12px] border border-warn/30 bg-card p-4">
                    <input type="hidden" name="applicationId" value={app.id} />
                    <input type="hidden" name="field" value={n.field} />
                    <input type="hidden" name="label" value={n.label} />
                    {n.options ? <input type="hidden" name="options" value={JSON.stringify(n.options)} /> : null}
                    <p className="text-[14px] font-medium">{n.label}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {n.options ? (
                        <Select name="value" required defaultValue="" className="max-w-xs" aria-label={n.label}>
                          <option value="" disabled>
                            Choose…
                          </option>
                          {n.options.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input name="value" required className="max-w-md" aria-label={n.label} />
                      )}
                      <SubmitButton size="sm">Save answer</SubmitButton>
                      <label className="flex items-center gap-1.5 text-[12px] text-muted">
                        <input type="checkbox" name="remember" defaultChecked className="accent-ink" /> Remember for future forms
                      </label>
                    </div>
                  </form>
                ))}
              </div>
              {latest.formScreenshot ? (
                <a href={`/api/files/${latest.formScreenshot}`} target="_blank" className="mt-3 inline-block text-[12px] text-ink-2 underline underline-offset-2">
                  See what the form looked like ↗
                </a>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      {app.status === "failed" ? (
        <Card className="flex gap-3 border-blocked/30 bg-blocked-bg/60 p-4 text-[13px]">
          <AlertTriangle className="size-5 shrink-0 text-blocked" />
          <div>
            <p className="font-medium text-blocked">Not sent</p>
            <p className="text-ink-2">{latest?.error ?? timeline.find((e) => e.type === "failed")?.message ?? "Something went wrong."}</p>
          </div>
        </Card>
      ) : null}

      {succeeded ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-line bg-traced-bg/60 px-5 py-4">
            <Receipt className="size-5 text-traced" />
            <div className="flex-1">
              <p className="font-medium text-traced">Submitted {timeAgo(succeeded.finishedAt)}</p>
              <p className="text-[13px] text-ink-2">Employer confirmation: “{succeeded.confirmationText}”</p>
            </div>
            <span className="font-mono text-[11px] text-muted">sha256 {succeeded.payloadHash.slice(0, 16)}…</span>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {[
              ["The form, filled in", succeeded.formScreenshot],
              ["The employer's confirmation", succeeded.confirmationScreenshot],
            ].map(([label, path]) =>
              path ? (
                <a key={label} href={`/api/files/${path}`} target="_blank" className="group block">
                  <p className="mb-1.5 text-[12px] font-medium text-muted">{label} ↗</p>
                  <div className="h-56 overflow-hidden rounded-[10px] border border-line bg-paper-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/${path}`} alt={label!} className="w-full object-cover object-top transition-transform group-hover:scale-[1.02]" />
                  </div>
                </a>
              ) : null,
            )}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {app.cvPdfPath && (app.status === "manual_kit" || sent) ? (
            <Card className="flex flex-wrap items-center gap-3 p-4">
              <p className="flex-1 text-[14px] font-medium">Your application kit</p>
              <a href={`/api/files/${app.cvPdfPath}`} target="_blank" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Download /> CV (PDF)
              </a>
              {coverText ? <CopyButton text={coverText} label="Copy cover letter" /> : null}
            </Card>
          ) : null}

          <Card className="p-6 sm:p-8">
            <SectionLabel>Tailored CV</SectionLabel>
            <h2 className="font-display text-[30px] leading-none">{lite.fullName || "Your name"}</h2>
            <p className="mt-1.5 text-[13px] text-muted">{contact.join(" · ") || "Add contact details in your profile"}</p>
            {draft.summary.length ? (
              <div className="mt-5 space-y-1">
                {draft.summary.map((s) => (
                  <SentenceRow key={s.id} appId={app.id} s={s} facts={factMap} editable={editable} />
                ))}
              </div>
            ) : null}
            {draft.roles.length ? (
              <div className="mt-6 space-y-5">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink">Experience</p>
                {draft.roles.map((r) => (
                  <div key={r.roleFactId}>
                    <p className="px-3 text-[14px] font-semibold text-ink">{r.heading}</p>
                    <div className="mt-1 space-y-0.5">
                      {r.bullets.map((b) => (
                        <SentenceRow key={b.id} appId={app.id} s={b} facts={factMap} editable={editable} bullet />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {draft.skills.length ? (
              <div className="mt-6 px-3">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink">Skills</p>
                <p className="mt-1.5 text-[14px] text-ink-2">{draft.skills.join(" · ")}</p>
              </div>
            ) : null}
            {draft.education.length ? (
              <div className="mt-5 px-3">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink">Education</p>
                <ul className="mt-1.5 space-y-0.5 text-[14px] text-ink-2">
                  {draft.education.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          <Card className="p-6 sm:p-8">
            <SectionLabel>Cover letter</SectionLabel>
            <div className="space-y-1">
              {draft.coverLetter.map((s) => (
                <SentenceRow key={s.id} appId={app.id} s={s} facts={factMap} editable={editable} />
              ))}
            </div>
            <p className="mt-4 px-3 text-[14px] text-ink-2">{lite.fullName}</p>
          </Card>

          <div>
            <SectionLabel>Application form · {job.isDemo ? "Hirefield (demo ATS)" : cleanCompany(job.company)}</SectionLabel>
            <div className="space-y-2.5">
              {draft.answers.map((a) => (
                <AnswerRow key={a.questionId} appId={app.id} a={a} editable={editable} isCover={isCover(a)} />
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {editable || app.status === "submitting" ? (
            <Card className="p-5">
              <ApprovePanel
                key={`${app.status}:${app.approvedHash ?? ""}`}
                appId={app.id}
                status={app.status}
                canAgent={canAgent}
                blockers={blockers}
                approvedHash={app.approvedHash}
                summary={summary}
                applyUrl={absoluteApplyUrl(job)}
              />
            </Card>
          ) : null}

          {sent || app.status === "manual_kit" ? (
            <Card className="p-5">
              <TrackingPanel
                appId={app.id}
                notes={app.notes}
                followUpAt={app.followUpAt?.toISOString() ?? null}
                followUpDue={followUpDue(app)}
                interviews={interviewRows.map((iv) => ({ ...iv, startsAt: iv.startsAt.toISOString() }))}
                defaultTitle={`Interview: ${job.title}, ${cleanCompany(job.company)}`}
              />
            </Card>
          ) : null}

          {usedFactIds.length ? (
            <Card className="p-5">
              <p className="mb-3 text-[13px] font-medium">Facts this draft uses</p>
              <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {usedFactIds
                  .sort((a, b) => factMap[a].n - factMap[b].n)
                  .map((fid) => (
                    <li key={fid} className="flex gap-2 text-[12px] leading-snug text-ink-2">
                      <span className="mt-px inline-flex h-[18px] min-w-[26px] shrink-0 items-center justify-center rounded-[5px] border border-traced/30 bg-traced-bg font-mono text-[10px] text-traced">
                        F{factMap[fid].n}
                      </span>
                      <span className="line-clamp-3">{factMap[fid].text}</span>
                    </li>
                  ))}
              </ul>
              <Link href="/app/profile#facts" className="mt-3 inline-block text-[12px] text-muted underline underline-offset-2 hover:text-ink">
                Edit your facts
              </Link>
            </Card>
          ) : null}

          <Card className="p-5">
            <p className="mb-3 text-[13px] font-medium">History</p>
            <ol className="relative space-y-3 border-l border-line pl-4">
              {timeline.map((e) => (
                <li key={e.id} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[21px] top-1.5 size-2 rounded-full ring-4 ring-card",
                      e.type === "submitted" ? "bg-traced" : e.type === "approved" ? "bg-nod-deep" : e.type === "revoked" || e.type === "failed" ? "bg-blocked" : e.type === "needs_user" || e.type === "warning" ? "bg-warn" : "bg-line-2",
                    )}
                  />
                  <p className="text-[12px] leading-snug text-ink-2">{e.message}</p>
                  <p className="font-mono text-[10px] text-muted">{timeAgo(e.createdAt)}</p>
                </li>
              ))}
            </ol>
            <Link href="/app/ledger" className="mt-4 inline-flex items-center gap-1 text-[12px] text-muted underline underline-offset-2 hover:text-ink">
              Consent ledger <ArrowUpRight className="size-3" />
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}

export default function ApplicationPage(props: PageProps<"/app/applications/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ApplicationPageContent {...props} />
    </Suspense>
  );
}
