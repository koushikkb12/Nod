import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { generateStructured, hasAI, UNTRUSTED_RULES, untrusted } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { facts, jobs, matches } from "@/lib/db/schema";
import { checkSentence, type FactLite } from "@/lib/draft/guard";
import { newId } from "@/lib/server-utils";

const Schema = z.object({
  sentences: z.array(z.object({ text: z.string(), factIds: z.array(z.string()) })).max(4),
  injectionWarnings: z.array(z.string()),
});

const SYSTEM = `You explain to a job seeker, in 2-3 short sentences of UK English, why a job fits them and what the main gap is.
Address them as "you". Only state facts about the candidate that appear in the FACT BANK, and cite the fact ids each sentence relies on.
A sentence about the job alone (for example its main focus) cites no facts and must not claim anything about the candidate.
${UNTRUSTED_RULES}`;

/**
 * An AI "why this fits" summary for one match, passed through the same fact
 * guard as drafts. Sentences the guard blocks are dropped. Returns null when
 * no AI provider is configured or nothing survives the guard.
 */
export async function summarizeMatch(userId: string, jobId: string) {
  if (!hasAI()) return null;
  const db = await getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  const [match] = await db.select().from(matches).where(and(eq(matches.userId, userId), eq(matches.jobId, jobId)));
  if (!job || !match) return null;
  const rows = await db.select().from(facts).where(and(eq(facts.userId, userId), eq(facts.confirmed, true)));
  const factMap = new Map<string, FactLite>(rows.map((f) => [f.id, f]));

  const prompt = `FACT BANK (verified by the candidate):
${rows.map((f) => `[${f.id}] ${f.kind}: ${f.text}`).join("\n") || "(none)"}

SKILLS THE AD MENTIONS THAT THE CANDIDATE HAS: ${match.matchedSkills.join(", ") || "none"}
SKILLS THE AD MENTIONS THAT THE CANDIDATE LACKS: ${match.missingSkills.join(", ") || "none"}

JOB: ${job.title} at ${job.company.replace(/ \(demo\)$/, "")}
${untrusted("job-ad", job.descriptionText.slice(0, 6000))}`;

  const { data } = await generateStructured({ schema: Schema, system: SYSTEM, prompt, timeoutMs: 60_000 });
  const ctx = { jobTitle: job.title, company: job.company };
  const kept = data.sentences
    .map((s) =>
      checkSentence(
        { id: newId("s"), text: s.text, factIds: s.factIds.filter((id) => factMap.has(id)), kind: s.factIds.length ? "claim" : "framing", status: "traced" },
        factMap,
        ctx,
      ),
    )
    .filter((s) => s.status === "traced")
    .map((s) => s.text.trim());
  const summary = kept.join(" ") || null;
  await db.update(matches).set({ aiSummary: summary }).where(eq(matches.id, match.id));
  return summary;
}
