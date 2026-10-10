"use server";

import { rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { dataDir, getDb, withClient } from "@/lib/db";
import { demoAtsApplications } from "@/lib/db/schema";
import { filePath } from "@/lib/server-utils";
import { requireUser } from "@/lib/session";

/**
 * Right to erasure. Deletes the user and everything that cascades from them,
 * plus their consent ledger rows (allowed only inside this transaction) and
 * their stored files.
 */
export async function deleteAccount(formData: FormData) {
  const user = await requireUser();
  if (String(formData.get("confirm") ?? "").trim().toLowerCase() !== "delete") {
    throw new Error('Type "delete" to confirm.');
  }
  const db = await getDb();
  const demoFiles = await db.select({ resumeFile: demoAtsApplications.resumeFile })
    .from(demoAtsApplications).where(eq(demoAtsApplications.ownerUserId, user.id));
  await withClient((client) =>
    client.transaction(async (tx) => {
      await tx.query("SET LOCAL nod.allow_erasure = 'on'");
      await tx.query("DELETE FROM approvals WHERE user_id = $1", [user.id]);
      await tx.query('DELETE FROM "user" WHERE id = $1', [user.id]);
    }),
  );
  await Promise.all(demoFiles.filter((row): row is { resumeFile: string } => Boolean(row.resumeFile))
    .map((row) => rm(filePath(row.resumeFile), { force: true })));
  await rm(dataDir("files", user.id), { recursive: true, force: true });
  redirect("/?deleted=1");
}
