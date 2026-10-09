import { Suspense } from "react";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { desc, eq, inArray } from "drizzle-orm";
import { Download, Lock } from "lucide-react";
import Link from "next/link";
import { deleteAccount } from "@/app/app/actions/account";
import { SubmitButton } from "@/components/submit-button";
import { Badge, buttonVariants, Card, Empty, Input, SectionTitle } from "@/components/ui";
import { getDb } from "@/lib/db";
import { applications, approvals, jobs } from "@/lib/db/schema";
import { cleanCompany } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Consent ledger" };

async function LedgerPageContent() {
  const user = await requireUser();
  const db = await getDb();
  const rows = await db.select().from(approvals).where(eq(approvals.userId, user.id)).orderBy(desc(approvals.id)).limit(200);
  const appIds = [...new Set(rows.map((r) => r.applicationId))];
  const apps = appIds.length
    ? await db
        .select({ id: applications.id, title: jobs.title, company: jobs.company })
        .from(applications)
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .where(inArray(applications.id, appIds))
    : [];
  const appById = new Map(apps.map((a) => [a.id, a]));

  return (
    <div className="space-y-8 animate-rise">
      <SectionTitle eyebrow="Consent ledger" title="Every nod, on the record">
        <a href="/api/export" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Download /> Export all my data
        </a>
      </SectionTitle>
      <Card className="flex gap-3 p-4 text-[13px] text-ink-2">
        <Lock className="size-4 shrink-0 text-ink" />
        <p>
          This ledger is append-only: the database refuses to edit or delete entries. Each approval stores the exact payload you approved and its SHA-256 fingerprint. Nod checks that fingerprint again right before it sends anything.
        </p>
      </Card>

      {rows.length ? (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[110px_1fr_190px_150px] gap-4 border-b border-line bg-paper-2/60 px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted md:grid">
            <span>Entry</span>
            <span>Application</span>
            <span>Fingerprint</span>
            <span>When</span>
          </div>
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const app = appById.get(r.applicationId);
              const reason = typeof r.payload.reason === "string" ? r.payload.reason : null;
              return (
                <li key={r.id} className="px-5 py-3.5">
                  <div className="grid items-center gap-x-4 gap-y-1 md:grid-cols-[110px_1fr_190px_150px]">
                    <span>
                      <Badge tone={r.kind === "approve" ? "traced" : "blocked"}>
                        #{r.id} {r.kind === "approve" ? "Approved" : "Withdrawn"}
                      </Badge>
                    </span>
                    <span className="min-w-0 text-[13px]">
                      {app ? (
                        <Link href={`/app/applications/${r.applicationId}`} className="font-medium hover:underline">
                          {app.title} <span className="font-normal text-muted">· {cleanCompany(app.company)}</span>
                        </Link>
                      ) : (
                        <span className="text-muted">{r.applicationId}</span>
                      )}
                      {reason ? <span className="block text-[12px] text-muted">{reason}</span> : null}
                      {r.kind === "approve" && typeof r.payload.mode === "string" ? (
                        <span className="block text-[12px] text-muted">{r.payload.mode === "agent" ? "Nod submits" : "You apply yourself"}</span>
                      ) : null}
                    </span>
                    <span className="truncate font-mono text-[11px] text-ink-2" title={r.payloadHash}>
                      {r.payloadHash ? `${r.payloadHash.slice(0, 20)}…` : "n/a"}
                    </span>
                    <span className="font-mono text-[11px] text-muted">{r.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
                  </div>
                  {r.kind === "approve" ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[12px] text-muted hover:text-ink">View the exact approved payload</summary>
                      <pre className="mt-2 max-h-80 overflow-auto rounded-[10px] bg-ink p-4 font-mono text-[11px] leading-relaxed text-paper/90">
                        {JSON.stringify(r.payload, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <Empty title="No entries yet">Approvals and withdrawals appear here the moment you make them.</Empty>
      )}

      <Card className="border-blocked/25 p-5">
        <h2 className="font-medium text-blocked">Delete my account</h2>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-2">
          Permanently deletes your CV, facts, preferences, drafts, receipts and consent ledger from this Nod instance. Applications already sent stay with the employers who received them.
        </p>
        <form action={deleteAccount} className="mt-4 flex flex-wrap items-center gap-2">
          <Input name="confirm" placeholder='Type "delete" to confirm' className="h-9 max-w-xs text-sm" required pattern="[Dd][Ee][Ll][Ee][Tt][Ee]" />
          <SubmitButton variant="danger" size="sm" pendingText="Deleting…">
            Delete everything
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}

export default function LedgerPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LedgerPageContent />
    </Suspense>
  );
}
