import { and, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { Wordmark } from "@/components/brand";
import { aiConfig } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { applications, preferences } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";
import { NavLinks, NavList, SignOutButton } from "./nav";

async function Sidebar() {
  const user = await getCurrentUser();
  let needsYou = 0;
  let paused = false;
  if (user) {
    const db = await getDb();
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(applications)
      .where(and(eq(applications.userId, user.id), inArray(applications.status, ["drafted", "needs_user"])));
    needsYou = row?.n ?? 0;
    const [p] = await db.select({ paused: preferences.agentPaused }).from(preferences).where(eq(preferences.userId, user.id));
    paused = p?.paused ?? false;
  }
  const ai = aiConfig();
  return (
    <>
      <NavLinks needsYou={needsYou} />
      <div className="mt-auto hidden space-y-4 lg:block">
        <div className="rounded-[12px] border border-line bg-card p-3 text-[12px] leading-relaxed text-muted">
          <p className="flex items-center gap-2 font-medium text-ink">
            <span className={paused ? "size-2 rounded-full bg-warn" : "size-2 rounded-full bg-traced animate-pulse-dot"} />
            {paused ? "Agent paused" : "Agent ready"}
          </p>
          <p className="mt-1">{ai ? `Drafting with ${ai.label}` : "Rule-based drafting (no AI key set)"}</p>
          {process.env.NODE_ENV !== "production" ? (
            <Link href="/demo-ats/inbox" target="_blank" className="mt-1 inline-block underline underline-offset-2 hover:text-ink">
              Demo employer inbox ↗
            </Link>
          ) : null}
        </div>
        {user ? (
          <div className="flex items-center justify-between px-1">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">{user.name}</p>
              <p className="truncate text-[12px] text-muted">{user.email}</p>
            </div>
            <SignOutButton />
          </div>
        ) : null}
      </div>
    </>
  );
}

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[252px_1fr]">
      <aside className="sticky top-0 z-20 flex flex-col gap-4 border-b border-line bg-paper/90 px-4 py-4 backdrop-blur lg:h-screen lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
        <div className="flex items-center justify-between px-2 lg:mb-4">
          <Wordmark href="/app" />
        </div>
        <Suspense fallback={<NavList path="" />}>
          <Sidebar />
        </Suspense>
      </aside>
      <main className="min-w-0 px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
