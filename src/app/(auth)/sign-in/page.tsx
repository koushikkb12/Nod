import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Sign in" };

type SearchParams = Promise<{ next?: string | string[] }>;

async function SignInFields({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams;
  return <AuthForm mode="sign-in" next={typeof next === "string" ? next : null} />;
}

export default function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <>
      <h1 className="font-display text-[44px] leading-none">Welcome back</h1>
      <p className="mb-8 mt-3 text-[15px] text-muted">Sign in to see your matches and anything waiting for your nod.</p>
      <Suspense>
        <SignInFields searchParams={searchParams} />
      </Suspense>
    </>
  );
}
