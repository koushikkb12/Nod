"use client";

import { Link2, Loader2 } from "lucide-react";
import { useActionState } from "react";
import { addJobFromUrl } from "@/app/app/actions/jobs";
import { Button, Input } from "@/components/ui";

export function AddJobForm() {
  const [state, action, pending] = useActionState(addJobFromUrl, null);
  return (
    <form action={action} className="space-y-1.5">
      <div className="flex gap-2">
        <div className="relative w-full">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            name="url"
            type="url"
            required
            placeholder="Paste a Greenhouse, Lever or Ashby job link"
            aria-label="Job link"
            className="h-9 pl-9 text-sm"
          />
        </div>
        <Button type="submit" variant="outline" size="sm" className="h-9" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Add job
        </Button>
      </div>
      {state?.error ? (
        <p role="alert" className="text-[13px] text-blocked">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
