import { normalise } from "@/lib/skills";

export type PrepFact = {
  id: string;
  kind: string;
  text: string;
  skills: string[];
  role: string | null;
  org: string | null;
};

export type PrepPoint = { text: string; factId: string };
export type PrepQuestion = { question: string; points: PrepPoint[]; hint?: string };
export type Prep = { questions: PrepQuestion[]; askThem: string[] };

const has = (f: PrepFact, skill: string) => {
  const s = normalise(skill);
  return f.skills.some((x) => normalise(x) === s) || ` ${normalise(f.text)} `.includes(` ${s} `);
};

/**
 * Likely interview questions with talking points taken word for word from the
 * candidate's confirmed facts, so nothing in the pack is invented.
 */
export function buildPrep(facts: PrepFact[], job: { title: string; company: string; skills: string[] }): Prep {
  const roles = facts.filter((f) => f.kind === "role");
  const wins = facts.filter((f) => f.kind === "achievement");
  const point = (f: PrepFact): PrepPoint => ({
    factId: f.id,
    text: f.kind === "role" && f.role ? `${f.role}${f.org ? ` at ${f.org}` : ""}` : f.text,
  });
  const questions: PrepQuestion[] = [];

  questions.push({
    question: "Walk me through your background.",
    points: roles.slice(0, 3).map(point),
    hint: roles.length ? "Keep it to two minutes and end on why this role is the next step." : "Add your roles as facts to get talking points here.",
  });

  const matched = job.skills.filter((s) => wins.some((f) => has(f, s)));
  for (const skill of matched.slice(0, 4)) {
    questions.push({
      question: `Tell me about a time you used ${skill}.`,
      points: wins.filter((f) => has(f, skill)).slice(0, 2).map(point),
      hint: "Situation, task, action, result. Lead with the result.",
    });
  }

  const measurable = wins.filter((f) => /\d/.test(f.text)).slice(0, 2);
  if (measurable.length) {
    questions.push({ question: "What's an achievement you're proud of?", points: measurable.map(point) });
  }

  const missing = job.skills.filter((s) => !facts.some((f) => has(f, s)));
  for (const skill of missing.slice(0, 3)) {
    questions.push({
      question: `How much experience do you have with ${skill}?`,
      points: [],
      hint: "It isn't in your confirmed facts. Be honest, mention anything similar you've done, and say how you'd get up to speed.",
    });
  }

  questions.push({
    question: `Why ${job.company}, and why this ${job.title} role?`,
    points: [],
    hint: "Read the job ad and their website. Name one thing about the team or product, and connect it to something you've done.",
  });

  return {
    questions,
    askThem: [
      `What would success look like in the first 90 days for the ${job.title}?`,
      "What is the team working on right now, and what's the hardest part?",
      "How do you support people to learn and grow in this role?",
      "What are the next steps in the process, and when should I expect to hear back?",
    ],
  };
}
