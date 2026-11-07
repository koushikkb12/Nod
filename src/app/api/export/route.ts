import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { answers, applications, approvals, events, facts, interviews, matches, preferences, profiles, submissions } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";

/** Everything Nod holds about the signed-in user, as JSON (UK GDPR access). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const db = await getDb();
  const by = <T extends { userId: unknown }>(t: T) => eq(t.userId as never, user.id);
  const data = {
    exportedAt: new Date().toISOString(),
    account: user,
    profile: (await db.select().from(profiles).where(by(profiles)))[0] ?? null,
    preferences: (await db.select().from(preferences).where(by(preferences)))[0] ?? null,
    facts: await db.select().from(facts).where(by(facts)),
    answerLibrary: await db.select().from(answers).where(by(answers)),
    matches: await db.select().from(matches).where(by(matches)),
    applications: await db.select().from(applications).where(by(applications)),
    interviews: await db.select().from(interviews).where(by(interviews)),
    submissions: await db.select().from(submissions).where(by(submissions)),
    consentLedger: await db.select().from(approvals).where(by(approvals)),
    activity: await db.select().from(events).where(by(events)),
  };
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="nod-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
    },
  });
}
