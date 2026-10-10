"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input } from "@/components/ui";

/** Only allow relative paths under /app — prevent open redirects. */
function safeNextUrl(raw: string | null): string {
  if (!raw) return "/app";
  try {
    // Parse against a dummy base to extract just the pathname
    const url = new URL(raw, "http://n");
    if (url.pathname === "/app" || url.pathname.startsWith("/app/")) return url.pathname;
  } catch {
    // malformed URL — ignore
  }
  return "/app";
}

export function AuthForm({ mode, next: rawNext }: { mode: "sign-in" | "sign-up"; next?: string | null }) {
  const router = useRouter();
  const next = safeNextUrl(rawNext ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    try {
      const result =
        mode === "sign-up"
          ? await authClient.signUp.email({ email, password, name: String(f.get("name") || email.split("@")[0]) })
          : await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? "Something went wrong. Try again.");
        return;
      }
      formRef.current?.reset();
      router.replace(next);
      router.refresh();
    } catch {
      setError("We couldn't reach the sign-in service. Check your connection and try again.");
    } finally {
      setPending(false);
      // Clear credentials on both handled errors and network failures.
      const pwInput = formRef.current?.querySelector<HTMLInputElement>('input[name="password"]');
      if (pwInput) pwInput.value = "";
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4" autoComplete="on">
      {mode === "sign-up" ? (
        <Field label="Your name" htmlFor="name">
          <Input id="name" name="name" autoComplete="name" required />
        </Field>
      ) : null}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" hint={mode === "sign-up" ? "At least 8 characters." : undefined}>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={8}
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          required
        />
      </Field>
      {error ? <p className="rounded-lg bg-blocked-bg px-3 py-2 text-sm text-blocked">{error}</p> : null}
      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        {pending ? <Loader2 className="animate-spin" /> : null}
        {mode === "sign-up" ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted">
        {mode === "sign-up" ? (
          <>
            Already have an account?{" "}
            <Link href="/sign-in" className="text-ink underline underline-offset-4">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to Nod?{" "}
            <Link href="/sign-up" className="text-ink underline underline-offset-4">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
