"use client";

import { Loader2, X } from "lucide-react";
import { useActionState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { addCustomBoard, removeCustomBoard } from "@/app/app/actions/jobs";
import { Button, Input } from "@/components/ui";
import { SOURCE_LABEL } from "@/lib/format";

type Board = { id: string; name: string; source: string; token: string };

export function CustomBoards({ boards }: { boards: Board[] }) {
  const [state, action, adding] = useActionState(addCustomBoard, null);
  const [removing, start] = useTransition();
  useEffect(() => {
    if (state?.ok) toast.success(state.ok);
  }, [state]);
  return (
    <div className="space-y-3">
      {boards.length ? (
        <ul className="space-y-1.5">
          {boards.map((b) => (
            <li key={b.id} className="flex items-center gap-2 rounded-[10px] border border-line px-3 py-1.5 text-[13px]">
              <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
              <span className="text-[11px] text-muted">{SOURCE_LABEL[b.source]}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label={`Remove ${b.name}`}
                disabled={removing}
                onClick={() => start(() => removeCustomBoard(b.id))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <form action={action} className="space-y-2">
        <Input name="url" type="url" required placeholder="https://jobs.lever.co/company" aria-label="Board link" className="h-9 text-[13px]" />
        <Input name="name" placeholder="Company name (optional)" aria-label="Company name" className="h-9 text-[13px]" />
        <Button type="submit" variant="outline" size="sm" className="w-full" disabled={adding}>
          {adding ? <Loader2 className="animate-spin" /> : null}
          {adding ? "Reading board…" : "Add board"}
        </Button>
        {state?.error ? (
          <p role="alert" className="text-[12px] text-blocked">
            {state.error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
