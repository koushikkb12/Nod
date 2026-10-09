"use client";

import { Pause, Play } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { setAgentPaused } from "@/app/app/actions/jobs";
import { cn } from "@/components/ui";

export function PauseSwitch({ paused }: { paused: boolean }) {
  const [optimistic, set] = useOptimistic(paused);
  const [, start] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!optimistic}
      onClick={() =>
        start(async () => {
          set(!optimistic);
          await setAgentPaused(!optimistic);
          toast(optimistic ? "Agent resumed" : "Agent paused", {
            description: optimistic ? "Approved applications can be sent again." : "Nothing will be sent until you resume.",
          });
        })
      }
      className={cn(
        "flex w-full items-center gap-3 rounded-[12px] border px-4 py-3 text-left transition-colors",
        optimistic ? "border-warn/40 bg-warn-bg" : "border-traced/30 bg-traced-bg",
      )}
    >
      <span className={cn("flex size-9 items-center justify-center rounded-full", optimistic ? "bg-warn text-paper" : "bg-traced text-paper")}>
        {optimistic ? <Play className="size-4" /> : <Pause className="size-4" />}
      </span>
      <span className="flex-1">
        <span className="block text-[14px] font-medium">{optimistic ? "Agent is paused" : "Agent is active"}</span>
        <span className="block text-[12px] text-muted">{optimistic ? "Tap to resume sending approved applications" : "Tap to stop all sending immediately"}</span>
      </span>
    </button>
  );
}
