import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Create your account" };

type SearchParams = Promise<{ next?: string | string[] }>;

async function SignUpFields({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams;
  return <AuthForm mode="sign-up" next={typeof next === "string" ? next : null} />;
}

export default function SignUpPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <>
      <h1 className="font-display text-[44px] leading-none">Start with your CV</h1>
      <p className="mb-8 mt-3 text-[15px] text-muted">
        Create an account, upload your CV, and Nod turns it into facts you confirm. It takes about two minutes.
      </p>
      <Suspense>
        <SignUpFields searchParams={searchParams} />
      </Suspense>
    </>
  );
}
