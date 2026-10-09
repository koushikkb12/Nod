import type { AnswerCategory, DraftAnswer, FormQuestion } from "@/lib/types";
import { normalise, tokens } from "@/lib/skills";

export type QuestionKind =
  | "first_name" | "last_name" | "full_name" | "email" | "phone" | "location"
  | "linkedin" | "github" | "website" | "resume" | "cover_letter"
  | "work_auth" | "sponsorship" | "notice" | "salary" | "relocation"
  | "sensitive" | "free_text" | "other";

const RULES: [RegExp, QuestionKind][] = [
  [/^first[ _]?name|given name|forename/i, "first_name"],
  [/^last[ _]?name|surname|family name/i, "last_name"],
  [/^(full )?name$/i, "full_name"],
  [/e-?mail/i, "email"],
  [/phone|mobile|telephone/i, "phone"],
  [/resume|\bcv\b|curriculum/i, "resume"],
  [/cover[ _]?letter/i, "cover_letter"],
  [/linkedin/i, "linkedin"],
  [/github|gitlab/i, "github"],
  [/website|portfolio|personal site|url/i, "website"],
  [/gender|sex\b|ethnic|race|racial|veteran|disab|sexual orientation|religio|belief|pronoun|transgender|date of birth|age range|caring responsibilit|socio-?economic|neurodiver/i, "sensitive"],
  [/sponsor|visa/i, "sponsorship"],
  [/right to work|authori[sz]ed to work|eligib\w* to work|legally (able|permitted|entitled) to work|work permit|work authori[sz]ation/i, "work_auth"],
  [/notice period|start date|when can you start|earliest .*start|availability to start/i, "notice"],
  [/salary|compensation|pay expectation|remuneration/i, "salary"],
  [/relocat/i, "relocation"],
  [/\b(city|location|where are you based|current location|country of residence)\b/i, "location"],
  [/why (do you|are you|would you)|tell us|describe|what (excites|interests|attracts)|motivat|additional information|anything else/i, "free_text"],
];

export function classify(q: FormQuestion): QuestionKind {
  if (q.sensitive) return "sensitive";
  const text = `${q.id.replace(/_/g, " ")} ${q.label}`;
  for (const [re, kind] of RULES) if (re.test(q.label) || (kind !== "free_text" && re.test(text))) return kind;
  if (q.type === "textarea") return "free_text";
  return "other";
}

export function categoryOf(kind: QuestionKind): AnswerCategory {
  switch (kind) {
    case "work_auth":
    case "sponsorship":
    case "notice":
    case "salary":
    case "relocation":
    case "sensitive":
      return kind;
    case "linkedin":
    case "github":
    case "website":
      return "links";
    default:
      return "other";
  }
}

export const normLabel = (label: string) => normalise(label).slice(0, 200);

/** Pick the option matching a free-text answer ("Yes, I have..." -> "Yes"). */
export function matchOption(q: FormQuestion, value: string): string | null {
  if (!q.options?.length) return value;
  const v = normalise(value);
  const exact = q.options.find((o) => normalise(o.label) === v || normalise(o.value) === v);
  if (exact) return exact.value;
  const yes = /^(yes|y|true|i do|i have|i am)\b/.test(v);
  const no = /^(no|n|false|i don.?t|i do not|i am not|not)\b/.test(v);
  if (yes || no) {
    const o = q.options.find((o) => (yes ? /^yes\b/i : /^no\b/i).test(o.label));
    if (o) return o.value;
  }
  const starts = q.options.find((o) => v.startsWith(normalise(o.label)) || normalise(o.label).startsWith(v));
  return starts?.value ?? null;
}

const DECLINE = /decline|prefer not|don.?t wish|do not wish|not to (say|answer|disclose)|rather not/i;

export type AnswerContext = {
  profile: { fullName: string; email: string; phone: string; location: string; links: { label: string; url: string }[] };
  prefs: {
    rightToWork: string;
    needsSponsorship: boolean | null;
    noticePeriod: string;
    minSalary: number | null;
    salaryCurrency: string;
    willingToRelocate: boolean;
  } | null;
  library: { label: string; normLabel: string; category: AnswerCategory; answer: string }[];
};

function fromLibrary(ctx: AnswerContext, q: FormQuestion, category: AnswerCategory, exactOnly = false) {
  const n = normLabel(q.label);
  const exact = ctx.library.find((a) => a.normLabel === n);
  if (exact) return exact.answer;
  // Free-text answers often name the company, so never reuse them loosely.
  if (exactOnly) return null;
  // Similar wording ("Do you need sponsorship?" vs "Will you require sponsorship?").
  const qt = new Set(tokens(q.label));
  let best: { score: number; answer: string } | null = null;
  for (const a of ctx.library) {
    if (category !== "other" && a.category !== category) continue;
    const at = tokens(a.label);
    if (!at.length) continue;
    const overlap = at.filter((t) => qt.has(t)).length / Math.max(at.length, qt.size);
    if (overlap >= 0.6 && (!best || overlap > best.score)) best = { score: overlap, answer: a.answer };
  }
  if (best) return best.answer;
  if (category !== "other" && category !== "sensitive") {
    return ctx.library.find((a) => a.category === category)?.answer ?? null;
  }
  return null;
}

/**
 * Fill one question. Never guesses: anything the profile, preferences or
 * answer library can't answer is marked needsUser. Work authorisation and
 * sponsorship come only from what the user typed in themselves.
 */
export function answerQuestion(q: FormQuestion, ctx: AnswerContext): DraftAnswer {
  const kind = classify(q);
  const base = {
    questionId: q.id,
    label: q.label,
    required: q.required,
    type: q.type,
    options: q.options,
  };
  const done = (value: string, source: DraftAnswer["source"], extra: Partial<DraftAnswer> = {}): DraftAnswer => {
    const mapped = q.type === "select" ? matchOption(q, value) : value;
    if (q.type === "select" && mapped === null) {
      return { ...base, value: "", source: "unknown", needsUser: q.required, ...extra };
    }
    return { ...base, value: mapped ?? value, source, needsUser: false, ...extra };
  };
  const unknown = (): DraftAnswer => ({ ...base, value: "", source: "unknown", needsUser: q.required });

  const [first, ...rest] = ctx.profile.fullName.trim().split(/\s+/);
  const link = (re: RegExp) => ctx.profile.links.find((l) => re.test(l.url) || re.test(l.label))?.url;
  const lib = fromLibrary(ctx, q, categoryOf(kind), kind === "free_text");

  switch (kind) {
    case "first_name":
      return first ? done(first, "profile") : unknown();
    case "last_name":
      return rest.length ? done(rest.join(" "), "profile") : unknown();
    case "full_name":
      return ctx.profile.fullName ? done(ctx.profile.fullName, "profile") : unknown();
    case "email":
      return ctx.profile.email ? done(ctx.profile.email, "profile") : unknown();
    case "phone":
      return ctx.profile.phone ? done(ctx.profile.phone, "profile") : unknown();
    case "location":
      return lib ? done(lib, "library") : ctx.profile.location ? done(ctx.profile.location, "profile") : unknown();
    case "linkedin": {
      const url = link(/linkedin/i);
      return url ? done(url, "profile") : lib ? done(lib, "library") : unknown();
    }
    case "github": {
      const url = link(/github|gitlab/i);
      return url ? done(url, "profile") : lib ? done(lib, "library") : unknown();
    }
    case "website": {
      const url = link(/^(?!.*(linkedin|github)).*$/i);
      return url ? done(url, "profile") : lib ? done(lib, "library") : unknown();
    }
    case "resume":
      return { ...base, value: "Tailored CV (PDF)", source: "file", needsUser: false };
    case "cover_letter":
      // Filled from the cover letter section when the payload is built.
      return { ...base, value: "", source: "facts", needsUser: false };
    case "work_auth":
      if (lib) return done(lib, "library");
      return ctx.prefs?.rightToWork ? done(ctx.prefs.rightToWork, "preferences") : unknown();
    case "sponsorship":
      if (lib) return done(lib, "library");
      if (ctx.prefs?.needsSponsorship === true) return done("Yes", "preferences");
      if (ctx.prefs?.needsSponsorship === false) return done("No", "preferences");
      return unknown();
    case "notice":
      if (lib) return done(lib, "library");
      return ctx.prefs?.noticePeriod ? done(ctx.prefs.noticePeriod, "preferences") : unknown();
    case "salary":
      if (lib) return done(lib, "library");
      if (ctx.prefs?.minSalary) {
        const sym = ctx.prefs.salaryCurrency === "GBP" ? "£" : ctx.prefs.salaryCurrency === "EUR" ? "€" : "$";
        return done(`${sym}${ctx.prefs.minSalary.toLocaleString("en-GB")}`, "preferences");
      }
      return unknown();
    case "relocation":
      if (lib) return done(lib, "library");
      return ctx.prefs ? done(ctx.prefs.willingToRelocate ? "Yes" : "No", "preferences") : unknown();
    case "sensitive": {
      // Special category data: only the user's own stored answer, else decline.
      if (lib) return done(lib, "library", { sensitive: true });
      const decline = q.options?.find((o) => DECLINE.test(o.label));
      if (decline) return { ...base, value: decline.value, source: "sensitive-default", needsUser: false, sensitive: true };
      if (q.type !== "select") return { ...base, value: "Prefer not to say", source: "sensitive-default", needsUser: false, sensitive: true };
      return { ...unknown(), sensitive: true };
    }
    case "free_text":
      if (lib) return done(lib, "library");
      return unknown(); // the drafter may fill this from facts
    default:
      return lib ? done(lib, "library") : unknown();
  }
}
