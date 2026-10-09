import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { generateStructured, hasAI, UNTRUSTED_RULES, untrusted } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { answers as answersTable, facts, jobs, preferences, profiles } from "@/lib/db/schema";
import { INJECTION_PATTERNS } from "@/lib/jobs/normalize";
import { fetchGreenhouseQuestions } from "@/lib/jobs/sources";
import { newId } from "@/lib/server-utils";
import { tokens } from "@/lib/skills";
import type { Draft, DraftAnswer, DraftRole, FormQuestion, Sentence } from "@/lib/types";
import { answerQuestion, classify } from "./answers";
import { checkSentence, guardDraft, type FactLite } from "./guard";

type Fact = typeof facts.$inferSelect;
type Job = typeof jobs.$inferSelect;

const STANDARD_QUESTIONS: FormQuestion[] = [
  { id: "first_name", label: "First name", required: true, type: "text" },
  { id: "last_name", label: "Last name", required: true, type: "text" },
  { id: "email", label: "Email", required: true, type: "text" },
  { id: "phone", label: "Phone", required: false, type: "text" },
  { id: "resume", label: "Resume/CV", required: true, type: "file" },
  { id: "cover_letter_text", label: "Cover letter", required: false, type: "textarea" },
  { id: "linkedin", label: "LinkedIn profile", required: false, type: "text" },
];

/** The employer's real questions where the source exposes them. */
export async function questionsFor(job: Job): Promise<FormQuestion[]> {
  if (job.questions?.length) return job.questions;
  if (job.source === "greenhouse") {
    try {
      const qs = await fetchGreenhouseQuestions(job.sourceCompany, job.externalId);
      if (qs.length) {
        const db = await getDb();
        await db.update(jobs).set({ questions: qs }).where(eq(jobs.id, job.id));
        return qs;
      }
    } catch (err) {
      console.error("[nod] could not fetch Greenhouse questions", err);
    }
  }
  return STANDARD_QUESTIONS;
}

const sid = () => newId("s", 8);
const claim = (text: string, factIds: string[]): Sentence => ({ id: sid(), text, factIds, kind: "claim", status: "traced" });
const framing = (text: string): Sentence => ({ id: sid(), text, factIds: [], kind: "framing", status: "traced" });

function lowerFirst(s: string) {
  const t = s.trim().replace(/\.$/, "");
  if (/^[A-Z]{2}/.test(t)) return t; // acronym, keep
  return t.charAt(0).toLowerCase() + t.slice(1);
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
}

function jobKeywords(job: Job) {
  const counts = new Map<string, number>();
  for (const t of tokens(`${job.title} ${job.title} ${job.descriptionText}`)) {
    if (t.length < 4) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return new Set([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50).map(([t]) => t));
}

function relevance(f: Fact, job: Job, keywords: Set<string>) {
  const skillHits = f.skills.filter((s) => job.skills.includes(s)).length;
  const wordHits = tokens(f.text).filter((t) => keywords.has(t)).length;
  const hasNumber = /\d/.test(f.text) ? 1 : 0;
  return skillHits * 3 + wordHits + hasNumber;
}

function roleHeading(r: Fact) {
  const dates = [r.startDate, r.endDate].filter(Boolean).join(" – ");
  return [r.role, r.org, dates].filter(Boolean).join(" · ");
}

function detectInjection(job: Job): string[] {
  const out: string[] = [];
  for (const sentence of job.descriptionText.split(/(?<=[.!?\n])\s+/)) {
    if (INJECTION_PATTERNS.some((re) => re.test(sentence))) out.push(sentence.trim().slice(0, 240));
  }
  return out;
}

type Inputs = {
  job: Job;
  profile: typeof profiles.$inferSelect | undefined;
  prefs: typeof preferences.$inferSelect | undefined;
  confirmed: Fact[];
  roles: Fact[];
  achievementsByRole: Map<string, Fact[]>;
  keywords: Set<string>;
  questions: FormQuestion[];
  library: (typeof answersTable.$inferSelect)[];
};

/* ---------------------------- Rule-based ------------------------------ */

function rulesDraft(i: Inputs): Omit<Draft, "answers" | "injectionWarnings" | "generatedAt"> & { freeText: Map<string, Sentence[]> } {
  const { job, confirmed, roles, achievementsByRole, keywords } = i;
  const summaryFact = confirmed.find((f) => f.kind === "other" && f.text.length > 60);
  const summary = summaryFact
    ? splitSentences(summaryFact.text).slice(0, 3).map((s) => claim(s, [summaryFact.id]))
    : roles[0]
      ? [claim(`${roles[0].role} at ${roles[0].org}.`, [roles[0].id])]
      : [];

  const draftRoles: DraftRole[] = roles.map((r, idx) => {
    const list = [...(achievementsByRole.get(r.id) ?? [])]
      .sort((a, b) => relevance(b, job, keywords) - relevance(a, job, keywords))
      .slice(0, idx < 3 ? 4 : 2);
    return { roleFactId: r.id, heading: roleHeading(r), bullets: list.map((f) => claim(f.text, [f.id])) };
  });

  const ranked = confirmed
    .filter((f) => f.kind === "achievement" || f.kind === "project")
    .sort((a, b) => relevance(b, job, keywords) - relevance(a, job, keywords));
  const roleOf = (f: Fact) => roles.find((r) => r.id === f.parentId);
  const recent = roles[0];
  const current = recent && /present|current|now/i.test(recent.endDate ?? "");
  const skillFacts = confirmed.filter((f) => f.kind === "skill");
  const matchedSkills = [...new Set(skillFacts.flatMap((f) => f.skills))].filter((s) => job.skills.includes(s)).slice(0, 5);
  const skillSources = skillFacts.filter((f) => f.skills.some((s) => matchedSkills.includes(s))).map((f) => f.id);
  const company = job.company.replace(/ \(demo\)$/, "");

  const cover: Sentence[] = [framing(`Dear ${company} hiring team,`), framing(`I'm applying for the ${job.title} role.`)];
  if (recent) {
    cover.push(claim(`${current ? "I'm currently working as" : "Most recently, I worked as"} ${recent.role} at ${recent.org}.`, [recent.id]));
  }
  for (const f of ranked.slice(0, 2)) {
    const r = roleOf(f);
    cover.push(claim(`${r?.org ? `At ${r.org}, I` : "I"} ${lowerFirst(f.text)}.`, r ? [f.id, r.id] : [f.id]));
  }
  if (matchedSkills.length && skillSources.length) {
    cover.push(claim(`My skills include ${matchedSkills.join(", ")}.`, skillSources));
  }
  cover.push(framing(`I'd welcome the chance to bring this experience to ${company}.`));
  cover.push(framing("Thank you for considering my application."));
  cover.push(framing(`Kind regards,\n${i.profile?.fullName ?? ""}`.trim()));

  const freeText = new Map<string, Sentence[]>();
  for (const q of i.questions) {
    if (classify(q) !== "free_text") continue;
    const picks = ranked.slice(0, 2);
    if (!picks.length) continue;
    freeText.set(q.id, [
      framing(`The ${job.title} role at ${company} lines up closely with the work I enjoy most.`),
      ...picks.map((f) => {
        const r = roleOf(f);
        return claim(`${r?.org ? `At ${r.org}, I` : "I"} ${lowerFirst(f.text)}.`, r ? [f.id, r.id] : [f.id]);
      }),
    ]);
  }

  const allSkills = [...new Set(confirmed.flatMap((f) => (f.kind === "skill" ? f.skills : [])))];
  const skills = [...allSkills.filter((s) => job.skills.includes(s)), ...allSkills.filter((s) => !job.skills.includes(s))].slice(0, 16);

  return {
    generatedBy: "rules",
    summary,
    roles: draftRoles,
    skills,
    education: confirmed.filter((f) => f.kind === "education" || f.kind === "certification").map((f) => f.text),
    coverLetter: cover,
    freeText,
  };
}

/* ------------------------------- AI ----------------------------------- */

const Cited = z.object({ text: z.string(), factIds: z.array(z.string()) });
const AiDraftSchema = z.object({
  summary: z.array(Cited).describe("2-3 sentences for the top of the CV"),
  roles: z.array(z.object({ roleFactId: z.string(), bullets: z.array(Cited) })),
  coverLetter: z.array(
    z.object({ text: z.string(), kind: z.enum(["claim", "framing"]), factIds: z.array(z.string()) }),
  ),
  freeTextAnswers: z.array(z.object({ questionId: z.string(), sentences: z.array(Cited) })),
  injectionWarnings: z.array(z.string()),
});

const SYSTEM = `You tailor job applications for a candidate using ONLY their verified fact bank.
Rules:
- Every claim sentence must be fully supported by the facts it cites (factIds). Cite the fact ids you used.
- Never add a skill, tool, number, employer, job title, qualification or duration that is not written in the cited facts. Do not round or change numbers.
- You may reorder and lightly reword facts to echo the job ad's language, but only where the facts support it.
- "framing" sentences (greeting, which role is being applied for, thanks, sign-off) must make no claims about the candidate.
- CV bullets: for each role, return 2-5 bullets rewriting that role's achievements, most relevant to the job first. Each bullet cites the achievement fact(s) it came from.
- Cover letter: 6-9 short sentences, UK English, warm and specific, no clichés.
- Free-text answers: 2-4 sentences each, grounded in cited facts.
${UNTRUSTED_RULES}`;

async function aiDraft(i: Inputs) {
  const factLines = i.confirmed
    .map((f) => {
      const role = f.parentId ? i.roles.find((r) => r.id === f.parentId) : undefined;
      const ctx = role ? ` (${role.role} at ${role.org}, ${role.startDate ?? ""}–${role.endDate ?? ""})` : "";
      return `[${f.id}] ${f.kind}${ctx}: ${f.text}`;
    })
    .join("\n");
  const roleLines = i.roles.map((r) => `[${r.id}] ${roleHeading(r)}`).join("\n");
  const free = i.questions.filter((q) => classify(q) === "free_text");
  const prompt = `CANDIDATE: ${i.profile?.fullName ?? ""}

FACT BANK (verified by the candidate):
${factLines}

ROLES (write bullets for each roleFactId):
${roleLines}

JOB: ${i.job.title} at ${i.job.company.replace(/ \(demo\)$/, "")}
${untrusted("job-ad", i.job.descriptionText.slice(0, 9000))}

FREE-TEXT QUESTIONS TO ANSWER:
${free.map((q) => `[${q.id}] ${q.label}`).join("\n") || "(none)"}`;

  const { data, model } = await generateStructured({ schema: AiDraftSchema, system: SYSTEM, prompt });
  const roleIds = new Set(i.roles.map((r) => r.id));
  const roles: DraftRole[] = i.roles.map((r) => {
    const fromAi = data.roles.find((x) => x.roleFactId === r.id && roleIds.has(x.roleFactId));
    return {
      roleFactId: r.id,
      heading: roleHeading(r),
      bullets: (fromAi?.bullets ?? []).map((b) => claim(b.text, b.factIds)),
    };
  });
  const freeText = new Map<string, Sentence[]>();
  for (const a of data.freeTextAnswers) freeText.set(a.questionId, a.sentences.map((s) => claim(s.text, s.factIds)));
  return {
    model,
    summary: data.summary.map((s) => claim(s.text, s.factIds)),
    roles,
    coverLetter: data.coverLetter.map((s) =>
      s.kind === "framing" && !s.factIds.length ? framing(s.text) : claim(s.text, s.factIds),
    ),
    freeText,
    injectionWarnings: data.injectionWarnings,
  };
}

/* ----------------------------- Entry point ---------------------------- */

export async function generateDraft(userId: string, jobId: string): Promise<{ draft: Draft; note?: string }> {
  const db = await getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) throw new Error("Job not found");
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  const [prefs] = await db.select().from(preferences).where(eq(preferences.userId, userId));
  const confirmed = await db
    .select()
    .from(facts)
    .where(and(eq(facts.userId, userId), eq(facts.confirmed, true)))
    .orderBy(asc(facts.position));
  if (!confirmed.length) throw new Error("Confirm at least one fact in your fact bank first.");
  const library = await db.select().from(answersTable).where(eq(answersTable.userId, userId));
  const questions = await questionsFor(job);

  const roles = confirmed.filter((f) => f.kind === "role");
  const achievementsByRole = new Map<string, Fact[]>();
  for (const f of confirmed) {
    if (f.kind === "achievement" && f.parentId) {
      achievementsByRole.set(f.parentId, [...(achievementsByRole.get(f.parentId) ?? []), f]);
    }
  }
  const inputs: Inputs = {
    job, profile, prefs, confirmed, roles, achievementsByRole,
    keywords: jobKeywords(job), questions, library,
  };

  const rules = rulesDraft(inputs);
  let body: Omit<Draft, "answers" | "injectionWarnings" | "generatedAt">;
  let freeText = rules.freeText;
  let injectionWarnings = detectInjection(job);
  let note: string | undefined;

  if (hasAI()) {
    try {
      const ai = await aiDraft(inputs);
      body = {
        generatedBy: "ai",
        model: ai.model,
        summary: ai.summary.length ? ai.summary : rules.summary,
        roles: ai.roles.map((r, idx) => (r.bullets.length ? r : rules.roles[idx])),
        skills: rules.skills,
        education: rules.education,
        coverLetter: ai.coverLetter.length ? ai.coverLetter : rules.coverLetter,
      };
      freeText = new Map([...rules.freeText, ...ai.freeText]);
      injectionWarnings = [...new Set([...injectionWarnings, ...ai.injectionWarnings])];
    } catch (err) {
      console.error("[nod] AI drafting failed, using rules", err);
      note = "AI drafting failed, so Nod used its rule-based drafter.";
      body = rules;
    }
  } else {
    body = rules;
  }

  // Answers to the form's questions.
  const ctx = {
    profile: {
      fullName: profile?.fullName ?? "",
      email: profile?.email ?? "",
      phone: profile?.phone ?? "",
      location: profile?.location ?? "",
      links: profile?.links ?? [],
    },
    prefs: prefs
      ? {
          rightToWork: prefs.rightToWork,
          needsSponsorship: prefs.needsSponsorship,
          noticePeriod: prefs.noticePeriod,
          minSalary: prefs.minSalary,
          salaryCurrency: prefs.salaryCurrency,
          willingToRelocate: prefs.willingToRelocate,
        }
      : null,
    library: library.map((a) => ({ label: a.label, normLabel: a.normLabel, category: a.category, answer: a.answer })),
  };
  const factsById = new Map<string, FactLite>(confirmed.map((f) => [f.id, f]));
  const context = { jobTitle: job.title, company: job.company };

  const answers: DraftAnswer[] = questions.map((q) => {
    const a = answerQuestion(q, ctx);
    const sentences = freeText.get(q.id);
    if (classify(q) === "free_text" && a.source === "unknown" && sentences?.length) {
      const checked = sentences.map((s) => checkSentence(s, factsById, context));
      const blocked = checked.filter((s) => s.status === "blocked");
      const kept = checked.filter((s) => s.status === "traced");
      return {
        ...a,
        value: kept.map((s) => s.text).join(" "),
        source: "facts",
        factIds: [...new Set(kept.flatMap((s) => s.factIds))],
        needsUser: a.required && kept.length === 0,
        note: blocked.length ? `Nod removed ${blocked.length} sentence${blocked.length > 1 ? "s" : ""} it couldn't back up with your facts.` : undefined,
      };
    }
    return a;
  });

  const draft = guardDraft(
    { ...body, answers, injectionWarnings, generatedAt: new Date().toISOString() },
    factsById,
    context,
  );
  return { draft, note };
}
