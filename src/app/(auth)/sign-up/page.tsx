import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Create your account" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="font-display text-[44px] leading-none">Start with your CV</h1>
      <p className="mb-8 mt-3 text-[15px] text-muted">
        Create an account, upload your CV, and Nod turns it into facts you confirm. It takes about two minutes.
      </p>
      <Suspense>
        <AuthForm mode="sign-up" />
      </Suspense>
    </>
  );
}
