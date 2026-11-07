"use client";

import { CalendarPlus, MessageCircleQuestion, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { addInterview, deleteInterview, saveNotes, setFollowUp } from "@/app/app/actions/tracking";
import { SubmitButton } from "@/components/submit-button";
import { Button, Input, Textarea } from "@/components/ui";

type Interview = { id: string; title: string; startsAt: string; durationMinutes: number; location: string };

const run = async (fn: () => Promise<unknown>, ok: string) => {
  try {
    await fn();
    toast.success(ok);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Something went wrong");
  }
};

/** `datetime-local` and `date` inputs are in the browser's time zone; send UTC. */
const localToIso = (fd: FormData, from: string, to: string) => {
  const v = String(fd.get(from) ?? "");
  // A bare date ("2026-12-01") would otherwise be read as UTC midnight.
  fd.set(to, v ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00` : v).toISOString() : "");
  return fd;
};

const toDateInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function TrackingPanel({
  appId,
  notes,
  followUpAt,
  followUpDue,
  interviews,
  defaultTitle,
}: {
  appId: string;
  notes: string;
  followUpAt: string | null;
  followUpDue: boolean;
  interviews: Interview[];
  defaultTitle: string;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium">Interviews</p>
          <Link href={`/app/applications/${appId}/prep`} className="inline-flex items-center gap-1 text-[12px] text-muted underline underline-offset-2 hover:text-ink">
            <MessageCircleQuestion className="size-3.5" /> Prep pack
          </Link>
        </div>
        {interviews.length ? (
          <ul className="mt-2 space-y-2">
            {interviews.map((iv) => (
              <li key={iv.id} className="flex items-start gap-2 rounded-[10px] border border-line px-3 py-2 text-[13px]">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{iv.title}</p>
                  <p className="text-[12px] text-muted" suppressHydrationWarning>
                    {new Date(iv.startsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · {iv.durationMinutes} min
                    {iv.location ? ` · ${iv.location}` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Delete ${iv.title}`}
                  disabled={pending}
                  onClick={() => start(() => run(() => deleteInterview(iv.id), "Interview removed"))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <form
          action={(fd) => run(() => addInterview(localToIso(fd, "startsLocal", "startsAt")), "Interview added")}
          className="mt-2 space-y-2"
        >
          <input type="hidden" name="applicationId" value={appId} />
          <Input name="title" defaultValue={defaultTitle} aria-label="Interview title" className="h-9 text-[13px]" />
          <div className="flex gap-2">
            <Input name="startsLocal" type="datetime-local" required aria-label="Date and time" className="h-9 text-[13px]" />
            <Input name="durationMinutes" type="number" min={5} max={480} step={5} defaultValue={60} aria-label="Minutes" className="h-9 w-20 text-[13px]" />
          </div>
          <Input name="location" placeholder="Where (address or video link)" aria-label="Location" className="h-9 text-[13px]" />
          <div className="flex items-center gap-3">
            <SubmitButton size="sm" variant="outline">
              <CalendarPlus /> Add interview
            </SubmitButton>
            {interviews.length ? (
              <a href={`/app/applications/${appId}/calendar.ics`} className="text-[12px] text-muted underline underline-offset-2 hover:text-ink">
                Download for your calendar (.ics)
              </a>
            ) : null}
          </div>
        </form>
      </div>

      <form action={(fd) => run(() => setFollowUp(localToIso(fd, "followUpLocal", "followUpAt")), "Reminder saved")} className="border-t border-line pt-4">
        <input type="hidden" name="applicationId" value={appId} />
        <label htmlFor="followUpLocal" className="text-[13px] font-medium">
          Follow up on
        </label>
        {followUpDue ? <p className="mt-0.5 text-[12px] text-warn">Time to check in with the employer.</p> : null}
        <div className="mt-2 flex gap-2">
          <Input id="followUpLocal" name="followUpLocal" type="date" defaultValue={toDateInput(followUpAt)} className="h-9 text-[13px]" suppressHydrationWarning />
          <SubmitButton size="sm" variant="outline" className="h-9">
            Save
          </SubmitButton>
        </div>
      </form>

      <form action={(fd) => run(() => saveNotes(fd), "Notes saved")} className="border-t border-line pt-4">
        <input type="hidden" name="applicationId" value={appId} />
        <label htmlFor="notes" className="text-[13px] font-medium">
          Private notes
        </label>
        <p className="text-[12px] text-muted">Recruiter names, questions to ask, how it went. Never sent to the employer.</p>
        <Textarea id="notes" name="notes" defaultValue={notes} rows={5} maxLength={20000} className="mt-2 text-[13px]" />
        <SubmitButton size="sm" variant="outline" className="mt-2">
          Save notes
        </SubmitButton>
      </form>
    </div>
  );
}
