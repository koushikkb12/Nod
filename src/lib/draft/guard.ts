import type { Draft, Sentence } from "@/lib/types";
import { extractSkills, numberTokens } from "@/lib/skills";

export type FactLite = {
  id: string;
  text: string;
  confirmed: boolean;
  startDate: string | null;
  endDate: string | null;
  org: string | null;
  role: string | null;
};

/**
 * Checks one sentence against the fact bank. A claim passes only when:
 *  - it cites at least one confirmed fact,
 *  - every skill it names appears in the cited facts, and
 *  - every number it uses appears in the cited facts.
 * Framing sentences (greetings, the role being applied for) may not name
 * skills or numbers beyond what the job title itself contains.
 */
export function checkSentence(
  s: Sentence,
  factsById: Map<string, FactLite>,
  context: { jobTitle: string; company: string },
): Sentence {
  if (s.removed) return { ...s, status: "traced", reason: undefined };
  const text = s.text.trim();
  if (!text) return { ...s, status: "blocked", reason: "Empty sentence" };

  const contextText = `${context.jobTitle} ${context.company}`;
  const cited = s.factIds.map((id) => factsById.get(id)).filter(Boolean) as FactLite[];

  if (s.kind === "claim") {
    if (!s.factIds.length) {
      return { ...s, status: "blocked", reason: "Makes a claim but isn't linked to any fact" };
    }
    if (cited.length !== s.factIds.length) {
      return { ...s, status: "blocked", reason: "Cites a fact that doesn't exist" };
    }
    const unconfirmed = cited.find((f) => !f.confirmed);
    if (unconfirmed) {
      return { ...s, status: "blocked", reason: "Cites a fact you haven't confirmed yet" };
    }
  }

  const sourceText = [
    contextText,
    ...cited.map((f) => [f.text, f.role, f.org, f.startDate, f.endDate].filter(Boolean).join(" ")),
  ].join("\n");

  const allowedSkills = new Set(extractSkills(sourceText));
  const badSkills = extractSkills(text).filter((sk) => !allowedSkills.has(sk));
  if (badSkills.length) {
    return {
      ...s,
      status: "blocked",
      reason: `Mentions ${badSkills.join(", ")}, which ${badSkills.length > 1 ? "aren't" : "isn't"} in the ${s.kind === "claim" ? "cited fact" : "fact bank for this sentence"}`,
    };
  }

  const allowedNumbers = new Set(numberTokens(sourceText).map(stripUnit));
  const badNumbers = numberTokens(text).filter((n) => !allowedNumbers.has(stripUnit(n)));
  if (badNumbers.length) {
    return {
      ...s,
      status: "blocked",
      reason: `Uses ${badNumbers.join(", ")}, which ${badNumbers.length > 1 ? "don't" : "doesn't"} appear in your facts`,
    };
  }

  return { ...s, status: "traced", reason: undefined };
}

function stripUnit(n: string) {
  return n.replace(/(%|k|m|bn|x)$/i, "");
}

/** Re-check every sentence in a draft. */
export function guardDraft(
  draft: Draft,
  factsById: Map<string, FactLite>,
  context: { jobTitle: string; company: string },
): Draft {
  const check = (s: Sentence) => checkSentence(s, factsById, context);
  return {
    ...draft,
    summary: draft.summary.map(check),
    roles: draft.roles.map((r) => ({ ...r, bullets: r.bullets.map(check) })),
    coverLetter: draft.coverLetter.map(check),
  };
}

/** Every sentence in a draft, for counting and lookup. */
export function allSentences(draft: Draft): Sentence[] {
  return [...draft.summary, ...draft.roles.flatMap((r) => r.bullets), ...draft.coverLetter];
}

/** Sentences that will actually be sent: traced and not removed. */
export function included(list: Sentence[]) {
  return list.filter((s) => s.status === "traced" && !s.removed);
}
