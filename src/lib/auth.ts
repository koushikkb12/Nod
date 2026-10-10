import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { dbSync } from "@/lib/db";
import { account, rateLimit, session, user, verification } from "@/lib/db/schema";

function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("BETTER_AUTH_SECRET must be set to a random value of at least 32 bytes.");
  }
  const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return betterAuth({
    appName: "Nod",
    secret,
    baseURL,
    trustedOrigins: [baseURL],
    database: drizzleAdapter(dbSync(), {
      provider: "pg",
      schema: { user, session, account, verification, rateLimit },
    }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 8,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14, // 14 days
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 15 * 60, max: 10 },
        "/sign-up/email": { window: 60 * 60, max: 5 },
      },
    },
    advanced: {
      // Use Secure cookies in production (HTTPS only, __Secure- prefix)
      useSecureCookies: process.env.NODE_ENV === "production",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      },
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
