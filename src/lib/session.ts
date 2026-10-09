import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";

export type CurrentUser = { id: string; name: string; email: string };

/** The signed-in user, or null. Reads the request cookies. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Read the request first: during prerendering this is where rendering stops,
  // so build workers never open the database.
  const requestHeaders = await headers();
  await getDb();
  const result = await getAuth().api.getSession({ headers: requestHeaders });
  if (!result) return null;
  const { id, name, email } = result.user;
  return { id, name, email };
}

/** The signed-in user; redirects to sign-in when there is none. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}
