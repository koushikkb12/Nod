"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { explainMatch } from "@/app/app/actions/jobs";
import { Button } from "@/components/ui";

export function MatchSummary({ jobId, summary }: { jobId: string; summary: string | null }) {
  const [pending, start] = useTransition();
  const ask = () =>
    start(async () => {
      const r = await explainMatch(jobId);
      if ("error" in r) toast.error(r.error);
    });
  return (
    <div className="mt-4 rounded-[12px] border border-line bg-paper-2/50 p-3">
      <p className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.1em] text-muted">
        <Sparkles className="size-3" /> Why this fits
      </p>
      {summary ? <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{summary}</p> : null}
      <Button variant="link" size="sm" className="mt-1 h-6 text-[12px]" disabled={pending} onClick={ask}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        {summary ? "Rewrite" : "Ask AI to explain"}
      </Button>
      <p className="text-[11px] text-muted">Checked against your confirmed facts. Anything it can&apos;t back up is left out.</p>
    </div>
  );
}
