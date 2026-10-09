import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { dbSync } from "@/lib/db";
import { account, session, user, verification } from "@/lib/db/schema";

function createAuth() {
  return betterAuth({
    appName: "Nod",
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    database: drizzleAdapter(dbSync(), {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 8,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
    },
    // nextCookies must be last so server actions can set auth cookies.
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const g = globalThis as unknown as { __nodAuth?: Auth };

/**
 * Created on first use, not at import time. Next.js imports route modules in
 * helper processes (for example to collect static params); opening the
 * embedded database there would clash with the main server process.
 */
export function getAuth(): Auth {
  g.__nodAuth ??= createAuth();
  return g.__nodAuth;
}
