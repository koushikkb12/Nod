import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-DNS-Prefetch-Control": "off",
};

function policy(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}' 'unsafe-inline'`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function secure(response: NextResponse, csp: string) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(key, value);
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "private, no-store");
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  return response;
}

// This is only an early redirect. Server pages, route handlers, and every
// Server Action still authenticate and authorize using the verified session.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = btoa(crypto.randomUUID());
  const csp = policy(nonce);
  const protectedPage = pathname === "/app" || pathname.startsWith("/app/");
  const protectedApi = ["/api/files", "/api/export", "/api/ingest"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if ((protectedPage || protectedApi) && !getSessionCookie(request)) {
    if (protectedApi) {
      return secure(NextResponse.json({ error: "Not authenticated" }, { status: 401 }), csp);
    }
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", pathname);
    return secure(NextResponse.redirect(url), csp);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  return secure(NextResponse.next({ request: { headers: requestHeaders } }), csp);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|icon\\.|manifest).*)"],
};
