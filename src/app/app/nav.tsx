"use client";

import { BarChart3, Briefcase, FileText, Home, LogOut, ScrollText, SlidersHorizontal, Send } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/components/ui";

const LINKS = [
  { href: "/app", label: "Home", icon: Home, exact: true },
  { href: "/app/jobs", label: "Jobs", icon: Briefcase },
  { href: "/app/applications", label: "Applications", icon: Send },
  { href: "/app/insights", label: "Insights", icon: BarChart3 },
  { href: "/app/profile", label: "CV & facts", icon: FileText },
  { href: "/app/preferences", label: "Preferences", icon: SlidersHorizontal },
  { href: "/app/ledger", label: "Consent ledger", icon: ScrollText },
] as const;

export function NavLinks({ needsYou }: { needsYou?: number }) {
  return <NavList path={usePathname()} needsYou={needsYou} />;
}

/** Plain nav without the current-page highlight, for loading states. */
export function NavList({ path, needsYou }: { path: string; needsYou?: number }) {
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col">
      {LINKS.map((l) => {
        const active = "exact" in l && l.exact ? path === l.href : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "flex items-center gap-2.5 whitespace-nowrap rounded-[10px] px-3 py-2 text-[14px] transition-colors",
              active ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2 hover:text-ink",
            )}
          >
            <l.icon className="size-4" />
            <span className="flex-1">{l.label}</span>
            {l.href === "/app/applications" && needsYou ? (
              <span className={cn("rounded-full px-1.5 font-mono text-[11px]", active ? "bg-nod text-ink" : "bg-nod text-ink")}>{needsYou}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await authClient.signOut();
        router.push("/");
        router.refresh();
      }}
      className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
    >
      <LogOut className="size-3.5" /> Sign out
    </button>
  );
}
