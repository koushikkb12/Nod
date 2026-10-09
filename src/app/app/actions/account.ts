"use server";

import { rm } from "node:fs/promises";
import { redirect } from "next/navigation";
import { dataDir, withClient } from "@/lib/db";
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
  await withClient((client) =>
    client.transaction(async (tx) => {
      await tx.query("SET LOCAL nod.allow_erasure = 'on'");
      await tx.query("DELETE FROM approvals WHERE user_id = $1", [user.id]);
      await tx.query('DELETE FROM "user" WHERE id = $1', [user.id]);
    }),
  );
  await rm(dataDir("files", user.id), { recursive: true, force: true });
  redirect("/?deleted=1");
}
