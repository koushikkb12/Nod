import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <>
      <h1 className="font-display text-[44px] leading-none">Welcome back</h1>
      <p className="mb-8 mt-3 text-[15px] text-muted">Sign in to see your matches and anything waiting for your nod.</p>
      <Suspense>
        <AuthForm mode="sign-in" />
      </Suspense>
    </>
  );
}
