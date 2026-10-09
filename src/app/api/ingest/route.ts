import { latestIngest, ingestRunning } from "@/lib/jobs/ingest";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const run = await latestIngest();
  return Response.json({
    running: ingestRunning(),
    run: run
      ? {
          status: run.status,
          total: run.stats.total,
          closed: run.stats.closed,
          sources: run.stats.sources,
          errors: run.stats.errors.slice(0, 5),
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
        }
      : null,
  });
}
