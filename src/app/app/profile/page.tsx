import { Suspense } from "react";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { asc, eq } from "drizzle-orm";
import { Trash2 } from "lucide-react";
import { deleteAnswer, saveAnswer, saveProfile } from "@/app/app/actions/profile";
import { CvUpload } from "@/components/app/cv-upload";
import { FactBank, type FactView } from "@/components/app/fact-bank";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, Field, Input, SectionTitle, Select } from "@/components/ui";
import { getDb } from "@/lib/db";
import { answers, facts, profiles } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";

export const metadata = { title: "CV & facts" };

const CATEGORY_LABEL: Record<string, string> = {
  work_auth: "Right to work",
  sponsorship: "Sponsorship",
  notice: "Notice period",
  salary: "Salary",
  relocation: "Relocation",
  links: "Links",
  sensitive: "Sensitive",
  other: "Other",
};

async function ProfilePageContent() {
  const user = await requireUser();
  const db = await getDb();
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, user.id));
  const rows = await db.select().from(facts).where(eq(facts.userId, user.id)).orderBy(asc(facts.position), asc(facts.createdAt));
  const library = await db.select().from(answers).where(eq(answers.userId, user.id)).orderBy(asc(answers.category));
  const factViews: FactView[] = rows.map((f, i) => ({
    id: f.id,
    n: i + 1,
    kind: f.kind,
    parentId: f.parentId,
    text: f.text,
    confirmed: f.confirmed,
    source: f.source,
    skills: f.skills,
  }));
  const link = (re: RegExp) => profile?.links.find((l) => re.test(l.url) || re.test(l.label))?.url ?? "";

  return (
    <div className="space-y-10 animate-rise">
      <SectionTitle eyebrow="CV & facts" title="Your fact bank">
        {profile?.parsedBy ? <Badge tone="outline">Parsed by {profile.parsedBy === "ai" ? "AI" : "rules"}</Badge> : null}
      </SectionTitle>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          <CvUpload current={profile?.cvFileName} />
          <div id="facts">
            {factViews.length ? (
              <FactBank facts={factViews} />
            ) : (
              <Card className="p-6 text-[14px] text-muted">
                Your facts will appear here after you upload a CV. Nod splits it into roles, achievements, skills and education so you can check each one.
              </Card>
            )}
          </div>
        </div>

        <aside className="space-y-6">
          <Card className="p-5">
            <h2 className="font-medium">Contact details</h2>
            <p className="mb-4 text-[13px] text-muted">Used on your CV and to fill application forms.</p>
            <form action={saveProfile} className="space-y-3">
              <Field label="Full name" htmlFor="fullName">
                <Input id="fullName" name="fullName" defaultValue={profile?.fullName ?? user.name} required />
              </Field>
              <Field label="Email" htmlFor="pemail">
                <Input id="pemail" name="email" type="email" defaultValue={profile?.email ?? user.email} required />
              </Field>
              <Field label="Phone" htmlFor="phone">
                <Input id="phone" name="phone" defaultValue={profile?.phone ?? ""} />
              </Field>
              <Field label="Location" htmlFor="location">
                <Input id="location" name="location" defaultValue={profile?.location ?? ""} placeholder="London, UK" />
              </Field>
              <Field label="Headline" htmlFor="headline">
                <Input id="headline" name="headline" defaultValue={profile?.headline ?? ""} placeholder="Software Engineer" />
              </Field>
              <Field label="LinkedIn" htmlFor="linkedin">
                <Input id="linkedin" name="linkedin" defaultValue={link(/linkedin/i)} placeholder="linkedin.com/in/…" />
              </Field>
              <Field label="GitHub" htmlFor="github">
                <Input id="github" name="github" defaultValue={link(/github|gitlab/i)} />
              </Field>
              <Field label="Website" htmlFor="website">
                <Input id="website" name="website" defaultValue={profile?.links.find((l) => !/linkedin|github|gitlab/i.test(l.url))?.url ?? ""} />
              </Field>
              <SubmitButton className="w-full" pendingText="Saving…">
                Save details
              </SubmitButton>
            </form>
          </Card>

          <Card className="p-5">
            <h2 className="font-medium">Answer library</h2>
            <p className="mb-4 text-[13px] text-muted">
              Answers you've given before. Nod reuses them on new forms, and you see every reused answer before approving.
            </p>
            {library.length ? (
              <ul className="mb-4 space-y-2">
                {library.map((a) => (
                  <li key={a.id} className="group rounded-[10px] border border-line px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-medium leading-snug">{a.label}</p>
                      <form action={deleteAnswer.bind(null, a.id)}>
                        <button className="text-muted opacity-0 transition-opacity hover:text-blocked group-hover:opacity-100" aria-label="Delete answer">
                          <Trash2 className="size-3.5" />
                        </button>
                      </form>
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink-2">{a.sensitive ? "•••• (sensitive)" : a.answer}</p>
                    <Badge tone={a.category === "sensitive" ? "warn" : "neutral"} className="mt-1.5 text-[11px]">
                      {CATEGORY_LABEL[a.category]}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : null}
            <form action={saveAnswer} className="space-y-2 border-t border-line pt-4">
              <Input name="label" placeholder="Question, e.g. Do you hold a DBS check?" required />
              <Input name="answer" placeholder="Your answer" required />
              <Select name="category" defaultValue="">
                <option value="">Detect category</option>
                {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
              <SubmitButton variant="outline" size="sm" className="w-full">
                Save answer
              </SubmitButton>
            </form>
          </Card>
        </aside>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProfilePageContent />
    </Suspense>
  );
}
