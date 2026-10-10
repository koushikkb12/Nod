import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { demoAtsApplications } from "@/lib/db/schema";
import { getFile } from "@/lib/server-utils";
import { getCurrentUser } from "@/lib/session";

export async function GET(_req: Request, ctx: RouteContext<"/api/demo-ats/files/[id]">) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new Response("Not found", { status: 404 });
  const { id } = await ctx.params;
  const db = await getDb();
  const [row] = await db.select().from(demoAtsApplications)
    .where(and(eq(demoAtsApplications.id, id), eq(demoAtsApplications.ownerUserId, user.id)));
  if (!row?.resumeFile) return new Response("Not found", { status: 404 });
  const bytes = await getFile(row.resumeFile);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": "inline; filename=application.pdf",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}
