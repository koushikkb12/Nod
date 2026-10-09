import { Suspense } from "react";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { eq } from "drizzle-orm";
import { saveAgentControls, savePreferences } from "@/app/app/actions/jobs";
import { PauseSwitch } from "@/components/app/pause-switch";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, Input, SectionTitle, Select, Textarea } from "@/components/ui";
import { getDb } from "@/lib/db";
import { preferences } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Preferences" };

const SENIORITY = [
  ["intern", "Intern"],
  ["graduate", "Graduate"],
  ["junior", "Junior"],
  ["mid", "Mid-level"],
  ["senior", "Senior"],
  ["staff", "Staff / Principal"],
  ["lead", "Lead / Manager"],
];

function Chip({ name, value, label, checked }: { name: string; value: string; label: string; checked: boolean }) {
  return (
    <label className="cursor-pointer">
      <input type="checkbox" name={name} value={value} defaultChecked={checked} className="peer sr-only" />
      <span className="inline-flex h-9 items-center rounded-full border border-line-2 bg-card px-3.5 text-[13px] text-ink-2 transition-colors peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:ring-2 peer-focus-visible:ring-ink">
        {label}
      </span>
    </label>
  );
}

async function PreferencesPageContent() {
  const user = await requireUser();
  const db = await getDb();
  const [p] = await db.select().from(preferences).where(eq(preferences.userId, user.id));
  const join = (v?: string[]) => (v ?? []).join(", ");

  return (
    <div className="space-y-8 animate-rise">
      <SectionTitle eyebrow="Preferences" title="What you're looking for" />
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <form action={savePreferences} className="space-y-6">
          <Card className="space-y-5 p-6">
            <h2 className="font-medium">Roles and places</h2>
            <Field label="Job titles" htmlFor="titles" hint="Comma separated. Nod matches close variants (for example, Developer and Engineer).">
              <Input id="titles" name="titles" defaultValue={join(p?.titles)} placeholder="Software Engineer, Backend Engineer" />
            </Field>
            <Field label="Locations" htmlFor="locations" hint="Cities or countries. Remote roles are filtered to your region.">
              <Input id="locations" name="locations" defaultValue={join(p?.locations)} placeholder="London, Manchester, UK" />
            </Field>
            <div className="space-y-2">
              <p className="text-[13px] font-medium text-ink-2">Workplace</p>
              <div className="flex flex-wrap gap-2">
                {[["remote", "Remote"], ["hybrid", "Hybrid"], ["onsite", "On-site"]].map(([v, l]) => (
                  <Chip key={v} name="workplace" value={v} label={l} checked={p?.workplace.includes(v as never) ?? false} />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[13px] font-medium text-ink-2">Seniority</p>
              <div className="flex flex-wrap gap-2">
                {SENIORITY.map(([v, l]) => (
                  <Chip key={v} name="seniority" value={v} label={l} checked={p?.seniority.includes(v) ?? false} />
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
              <Field label="Minimum salary" htmlFor="minSalary" hint="Jobs that state a lower maximum are hidden.">
                <Input id="minSalary" name="minSalary" inputMode="numeric" defaultValue={p?.minSalary ?? ""} placeholder="55000" />
              </Field>
              <Field label="Currency" htmlFor="salaryCurrency">
                <Select id="salaryCurrency" name="salaryCurrency" defaultValue={p?.salaryCurrency ?? "GBP"}>
                  <option value="GBP">GBP</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </Select>
              </Field>
            </div>
            <Field label="Companies to exclude" htmlFor="excludeCompanies" hint="Your current employer, or anywhere you'd never apply.">
              <Input id="excludeCompanies" name="excludeCompanies" defaultValue={join(p?.excludeCompanies)} />
            </Field>
          </Card>

          <Card className="space-y-5 p-6">
            <div>
              <h2 className="font-medium">Questions Nod will never guess</h2>
              <p className="text-[13px] text-muted">Application forms ask these, and wrong answers can cost you an offer. Nod only uses exactly what you write here.</p>
            </div>
            <Field label="Right to work" htmlFor="rightToWork" hint="For example: Yes, I have the right to work in the UK (British citizen).">
              <Input id="rightToWork" name="rightToWork" defaultValue={p?.rightToWork ?? ""} />
            </Field>
            <Field label="Do you need visa sponsorship?" htmlFor="needsSponsorship" hint="If yes, Nod checks each UK employer against the Home Office register of licensed sponsors.">
              <Select id="needsSponsorship" name="needsSponsorship" defaultValue={p?.needsSponsorship === true ? "yes" : p?.needsSponsorship === false ? "no" : ""}>
                <option value="">Not set: ask me on each form</option>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </Select>
            </Field>
            <Field label="Notice period" htmlFor="noticePeriod">
              <Input id="noticePeriod" name="noticePeriod" defaultValue={p?.noticePeriod ?? ""} placeholder="1 month" />
            </Field>
            <label className="flex items-center gap-2.5 text-[14px]">
              <input type="checkbox" name="willingToRelocate" defaultChecked={p?.willingToRelocate ?? false} className="size-4 accent-ink" />
              I'm willing to relocate
            </label>
            <Field label="Keywords (optional)" htmlFor="keywords">
              <Textarea id="keywords" name="keywords" defaultValue={join(p?.keywords)} className="min-h-16" placeholder="climate, healthcare, fintech" />
            </Field>
          </Card>
          <SubmitButton size="lg" pendingText="Saving and re-matching…">
            Save and update matches
          </SubmitButton>
        </form>

        <aside className="space-y-4">
          <Card className="space-y-4 p-5">
            <div>
              <h2 className="font-medium">Agent controls</h2>
              <p className="text-[13px] text-muted">Limits protect you and the employers you apply to.</p>
            </div>
            <PauseSwitch paused={p?.agentPaused ?? false} />
            <form action={saveAgentControls} className="space-y-3">
              <Field label="Daily limit" htmlFor="dailyCap" hint="Maximum agent submissions per day (1–25).">
                <Input id="dailyCap" name="dailyCap" type="number" min={1} max={25} defaultValue={p?.dailyCap ?? 10} />
              </Field>
              <Field label="Per company, per month" htmlFor="perCompanyMonthlyCap" hint="Stops you flooding one employer (1–5).">
                <Input id="perCompanyMonthlyCap" name="perCompanyMonthlyCap" type="number" min={1} max={5} defaultValue={p?.perCompanyMonthlyCap ?? 2} />
              </Field>
              <SubmitButton variant="outline" size="sm" className="w-full">
                Save limits
              </SubmitButton>
            </form>
          </Card>
          <Card className="p-5 text-[13px] leading-relaxed text-muted">
            <p className="font-medium text-ink">How sending works</p>
            <p className="mt-1">
              Nod submits for you only on forms it supports (the demo employers here). For other jobs it prepares a complete kit: tailored CV, cover letter and answers. You then apply on the employer's site, where nothing can break their terms.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

export default function PreferencesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PreferencesPageContent />
    </Suspense>
  );
}
