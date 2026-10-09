"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { refreshJobs } from "@/app/app/actions/jobs";
import { Button } from "@/components/ui";

type Status = { running: boolean; run: { status: string; total: number; closed: number; errors: string[] } | null };

export function RefreshJobsButton({ initiallyRunning = false, label = "Find new jobs", variant = "primary" as const }: { initiallyRunning?: boolean; label?: string; variant?: "primary" | "outline" | "nod" }) {
  const router = useRouter();
  const [running, setRunning] = useState(initiallyRunning);
  const [count, setCount] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    const poll = async () => {
      const res = await fetch("/api/ingest", { cache: "no-store" });
      if (!res.ok) return;
      const s: Status = await res.json();
      setCount(s.run?.total ?? null);
      if (!s.running) {
        setRunning(false);
        if (timer.current) clearInterval(timer.current);
        // Matching runs right after the fetch; give it a moment.
        setTimeout(() => router.refresh(), 600);
        if (s.run?.status === "done") {
          toast.success(`Checked ${s.run.total.toLocaleString("en-GB")} open jobs`, {
            description: `${s.run.closed ? `${s.run.closed} closed jobs removed. ` : ""}Your matches are up to date.`,
          });
        } else if (s.run) {
          toast.error("Some sources failed", { description: s.run.errors[0] });
        }
      }
    };
    timer.current = setInterval(poll, 1500);
    poll();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [running, router]);

  return (
    <Button
      variant={variant}
      disabled={running || isPending}
      onClick={() =>
        startTransition(async () => {
          await refreshJobs();
          setCount(0);
          setRunning(true);
        })
      }
    >
      {running || isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      {running ? `Reading company boards${count ? ` · ${count.toLocaleString("en-GB")} jobs` : "…"}` : label}
    </Button>
  );
}
