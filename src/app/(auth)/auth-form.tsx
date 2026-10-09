"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input } from "@/components/ui";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next")?.startsWith("/app") ? params.get("next")! : "/app";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({ email, password, name: String(f.get("name") || email.split("@")[0]) })
        : await authClient.signIn.email({ email, password });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Something went wrong. Try again.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
