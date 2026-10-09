"use client";

import { Bookmark, BookmarkCheck, Loader2, PenLine, ThumbsDown, Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { prepareApplication, setMatchStatus } from "@/app/app/actions/jobs";
import { Button, cn } from "@/components/ui";

const REASONS = ["Wrong level", "Wrong location", "Not interested in the company", "Salary too low", "Missing key skills", "Other"];

export function PrepareButton({ jobId, size = "sm", label = "Prepare application" }: { jobId: string; size?: "sm" | "md" | "lg"; label?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size={size}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await prepareApplication(jobId);
          if (res?.error) toast.error(res.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <PenLine />}
      {pending ? "Drafting from your facts…" : label}
    </Button>
  );
}

export function MatchActions({ jobId, status }: { jobId: string; status: "new" | "shortlisted" | "dismissed" }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const act = (s: "new" | "shortlisted" | "dismissed", reason?: string, msg?: string) =>
    start(async () => {
      await setMatchStatus(jobId, s, reason);
      setOpen(false);
      if (msg) toast(msg);
    });

  if (status === "dismissed") {
    return (
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => act("new", undefined, "Restored")}>
        <Undo2 /> Restore
      </Button>
    );
  }
  return (
    <div className="relative flex items-center gap-1">
      <Button
        size="icon"
        variant="ghost"
        className="size-8"
        disabled={pending}
        aria-label={status === "shortlisted" ? "Remove from saved" : "Save"}
        onClick={() => act(status === "shortlisted" ? "new" : "shortlisted", undefined, status === "shortlisted" ? "Removed from saved" : "Saved")}
      >
        {status === "shortlisted" ? <BookmarkCheck className="text-traced" /> : <Bookmark />}
      </Button>
      <Button size="icon" variant="ghost" className="size-8" aria-label="Not for me" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ThumbsDown />
      </Button>
      {open ? (
        <div className={cn("absolute right-0 top-9 z-30 w-60 rounded-[12px] border border-line bg-card p-1.5 shadow-[var(--shadow-lift)] animate-rise")}>
          <p className="px-2.5 py-1.5 text-[12px] text-muted">Not for me because…</p>
          {REASONS.map((r) => (
            <button key={r} type="button" onClick={() => act("dismissed", r, "Dismissed. Nod will learn from this.")} className="block w-full rounded-[8px] px-2.5 py-1.5 text-left text-[13px] hover:bg-paper-2">
              {r}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
