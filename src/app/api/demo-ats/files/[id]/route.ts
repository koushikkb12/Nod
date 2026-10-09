import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { demoAtsApplications } from "@/lib/db/schema";
import { getFile } from "@/lib/server-utils";

export async function GET(_req: Request, ctx: RouteContext<"/api/demo-ats/files/[id]">) {
  const { id } = await ctx.params;
  const db = await getDb();
  const [row] = await db.select().from(demoAtsApplications).where(eq(demoAtsApplications.id, id));
  if (!row?.resumeFile) return new Response("Not found", { status: 404 });
  const bytes = await getFile(row.resumeFile);
  return new Response(new Uint8Array(bytes), { headers: { "content-type": "application/pdf" } });
}
