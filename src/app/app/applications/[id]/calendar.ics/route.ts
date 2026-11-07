import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { applications, interviews, jobs } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";
import { toIcs } from "@/lib/tracking";

/** The application's interviews as an iCalendar file. */
export async function GET(_req: Request, ctx: RouteContext<"/app/applications/[id]/calendar.ics">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const { id } = await ctx.params;
  const db = await getDb();
  const [app] = await db
    .select({ id: applications.id, title: jobs.title, company: jobs.company, url: jobs.sourceUrl })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(and(eq(applications.id, id), eq(applications.userId, user.id)));
  if (!app) return new Response("Not found", { status: 404 });
  const list = await db.select().from(interviews).where(eq(interviews.applicationId, app.id)).orderBy(asc(interviews.startsAt));
  const ics = toIcs(list.map((iv) => ({ ...iv, description: `${app.title} at ${app.company}\n${app.url}` })));
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="nod-interviews-${app.id}.ics"`,
      "cache-control": "private, no-store",
    },
  });
}
