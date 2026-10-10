import { getFile } from "@/lib/server-utils";
import { getCurrentUser } from "@/lib/session";

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain; charset=utf-8",
};

/** Serve a user's own stored files (tailored CVs, submission screenshots). */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[...key]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const { key } = await ctx.params;
  let path: string;
  try {
    path = key.map(decodeURIComponent).join("/");
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (path.split("/")[0] !== user.id || path.includes("..")) return new Response("Not found", { status: 404 });
  try {
    const bytes = await getFile(path);
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": TYPES[ext] ?? "application/octet-stream",
        "cache-control": "private, no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
