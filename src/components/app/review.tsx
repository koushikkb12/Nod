"use client";

import { Check, CircleAlert, Eye, Loader2, Pencil, RotateCcw, ShieldBan, Trash2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  approveApplication,
  editAnswer,
  editSentence,
  markApplied,
  previewSentence,
  regenerateDraft,
  revokeApproval,
  sentenceToFact,
  setApplicationStatus,
  toggleSentence,
} from "@/app/app/actions/applications";
import { FactChip, NodStamp } from "@/components/brand";
import { Badge, Button, cn, Input, Select, Textarea } from "@/components/ui";
import type { AppStatus, DraftAnswer, Sentence } from "@/lib/types";

export type FactRef = { n: number; text: string; confirmed: boolean };

function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok?: string) =>
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  return [pending, run] as const;
}

/* ---------------------------- Sentences ------------------------------ */

export function SentenceRow({
  appId,
  s,
  facts,
  editable,
  bullet,
}: {
  appId: string;
  s: Sentence;
  facts: Record<string, FactRef>;
  editable: boolean;
  bullet?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(s.text);
  const [live, setLive] = useState<{ status: string; reason: string | null } | null>(null);
  const [pending, run] = useAction();
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editing) return;
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(async () => setLive(await previewSentence(appId, s.id, text)), 350);
    return () => {
      if (t.current) clearTimeout(t.current);
    };
  }, [text, editing, appId, s.id]);

  const blocked = s.status === "blocked" && !s.removed;
  const cited = s.factIds.map((id) => ({ id, ...facts[id] })).filter((f) => f.n);

  return (
    <div
      className={cn(
        "group relative rounded-[10px] px-3 py-2 transition-colors",
        blocked && "border border-blocked/25 bg-blocked-bg",
        s.removed && "opacity-55",
        !blocked && !s.removed && editable && "hover:bg-paper-2/70",
        pending && "opacity-60",
      )}
    >
      {editing ? (
        <div className="space-y-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-20 text-[14px]" autoFocus />
          {live ? (
            <p className={cn("flex items-center gap-1.5 text-[12px]", live.status === "traced" ? "text-traced" : "text-blocked")}>
              {live.status === "traced" ? <Check className="size-3.5" /> : <ShieldBan className="size-3.5" />}
              {live.status === "traced" ? "Backed by the cited facts" : live.reason}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!text.trim()}
              onClick={() =>
                run(async () => {
                  await editSentence(appId, s.id, text);
                  setEditing(false);
                }, "Saved")
              }
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setText(s.text); setEditing(false); setLive(null); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          {bullet ? <span className={cn("mt-[9px] size-1 shrink-0 rounded-full", blocked ? "bg-blocked" : "bg-ink-2")} /> : null}
          <div className="min-w-0 flex-1">
            <p className={cn("text-[14px] leading-relaxed", blocked ? "text-blocked line-through decoration-blocked/40" : "text-ink-2", s.removed && "line-through")}>
              {s.text}{" "}
              <span className="inline-flex flex-wrap gap-1 align-middle">
                {cited.map((f) => (
                  <FactChip key={f.id} n={f.n} title={f.text} />
                ))}
                {s.kind === "framing" && !blocked ? <span className="font-mono text-[10px] text-muted">framing</span> : null}
                {s.edited ? <span className="font-mono text-[10px] text-info">edited</span> : null}
              </span>
            </p>
            {blocked ? (
              <p className="mt-1 flex items-start gap-1.5 text-[12px] font-medium text-blocked">
                <ShieldBan className="mt-px size-3.5 shrink-0" /> Blocked: {s.reason}. It won't be sent.
              </p>
            ) : null}
          </div>
          {editable ? (
            <div className={cn("flex shrink-0 gap-0.5", blocked ? "" : "opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100")}>
              {s.removed ? (
                <Button size="sm" variant="ghost" onClick={() => run(() => toggleSentence(appId, s.id, false))}>
                  <Undo2 /> Restore
                </Button>
              ) : (
                <>
                  {blocked && s.kind === "claim" ? (
                    <Button size="sm" variant="outline" className="h-7" title="Save this sentence as a confirmed fact" onClick={() => run(() => sentenceToFact(appId, s.id), "Saved as a fact. Sentence unblocked.")}>
                      It's true
                    </Button>
                  ) : null}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label="Edit sentence"
                    onClick={() => {
                      setText(s.text);
                      setLive(null);
                      setEditing(true);
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-7 hover:text-blocked" aria-label="Leave out" onClick={() => run(() => toggleSentence(appId, s.id, true))}>
                    <Trash2 />
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Answers ------------------------------- */

const SOURCE: Record<DraftAnswer["source"], { label: string; tone: "neutral" | "traced" | "info" | "warn" | "outline" }> = {
  profile: { label: "From your profile", tone: "neutral" },
  preferences: { label: "From your preferences", tone: "neutral" },
  library: { label: "Answer library", tone: "info" },
  facts: { label: "From your facts", tone: "traced" },
  user: { label: "Your answer", tone: "info" },
  "sensitive-default": { label: "Private by default", tone: "outline" },
  file: { label: "Attachment", tone: "neutral" },
  unknown: { label: "Needs you", tone: "warn" },
};

export function AnswerRow({ appId, a, editable, isCover }: { appId: string; a: DraftAnswer; editable: boolean; isCover: boolean }) {
  const [editing, setEditing] = useState(a.needsUser && editable);
  const [value, setValue] = useState(a.value);
  const [remember, setRemember] = useState(!a.sensitive);
  const [pending, run] = useAction();
  const display = a.options?.find((o) => o.value === a.value)?.label ?? a.value;
  const src = SOURCE[a.source];

  return (
    <div className={cn("rounded-[12px] border px-4 py-3", a.needsUser ? "border-warn/50 bg-warn-bg/60" : "border-line bg-card", pending && "opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-ink">
          {a.label}
          {a.required ? <span className="text-blocked"> *</span> : null}
        </p>
        <div className="flex gap-1">
          {a.sensitive ? <Badge tone="warn">Diversity question</Badge> : null}
          <Badge tone={src.tone}>{src.label}</Badge>
        </div>
      </div>
      {a.type === "file" ? (
        <p className="mt-1 text-[13px] text-ink-2">Your tailored CV (PDF), rendered from the draft on the left, is attached when you approve.</p>
      ) : isCover ? (
        <p className="mt-1 text-[13px] text-ink-2">Uses the cover letter above, with only traced sentences.</p>
      ) : editing ? (
        <div className="mt-2 space-y-2">
          {a.options?.length ? (
            <Select value={value} onChange={(e) => setValue(e.target.value)} aria-label={a.label}>
              <option value="">Choose…</option>
              {a.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          ) : a.type === "textarea" ? (
            <Textarea value={value} onChange={(e) => setValue(e.target.value)} aria-label={a.label} />
          ) : (
            <Input value={value} onChange={(e) => setValue(e.target.value)} aria-label={a.label} />
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              disabled={a.required && !value.trim()}
              onClick={() =>
                run(async () => {
                  await editAnswer(appId, a.questionId, value, remember);
                  setEditing(false);
                }, remember ? "Saved and added to your answer library" : "Saved")
              }
            >
              Save answer
            </Button>
            {!a.needsUser ? (
              <Button size="sm" variant="ghost" onClick={() => { setValue(a.value); setEditing(false); }}>
                Cancel
              </Button>
            ) : null}
            <label className="flex items-center gap-1.5 text-[12px] text-muted">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-ink" />
              Remember for future forms
            </label>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex items-start justify-between gap-3">
          <p className="whitespace-pre-wrap text-[14px] text-ink-2">{display || <span className="text-muted">Left blank</span>}</p>
          {editable ? (
            <button
              type="button"
              onClick={() => {
                setValue(a.value);
                setEditing(true);
              }}
              className="shrink-0 text-[12px] text-muted underline underline-offset-2 hover:text-ink"
            >
              Change
            </button>
          ) : null}
        </div>
      )}
      {a.note ? (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] text-warn">
          <CircleAlert className="mt-px size-3.5 shrink-0" /> {a.note}
        </p>
      ) : null}
    </div>
  );
}

/* ----------------------------- Approval ------------------------------ */

export function ApprovePanel({
  appId,
  status,
  canAgent,
  blockers,
  approvedHash,
  summary,
  applyUrl,
}: {
  appId: string;
  status: AppStatus;
  canAgent: boolean;
  blockers: string[];
  approvedHash: string | null;
  summary: { bullets: number; cover: number; answers: number; blocked: number; removed: number };
  applyUrl: string;
}) {
  const [mode, setMode] = useState<"agent" | "manual">(canAgent ? "agent" : "manual");
  const [pending, run] = useAction();
  const [stamp, setStamp] = useState(false);
  const router = useRouter();
  const waiting = status === "drafted" || status === "needs_user";

  if (status === "approved" || status === "submitting") {
    return (
      <div className="space-y-4 text-center">
        <NodStamp sub="approved" className="mx-auto" />
        <p className="flex items-center justify-center gap-2 text-[14px] font-medium">
          <Loader2 className="size-4 animate-spin" /> Nod is submitting exactly what you approved
        </p>
        <p className="font-mono text-[11px] text-muted">sha256 {approvedHash?.slice(0, 16)}…</p>
        {status === "approved" ? (
          <Button variant="danger" size="sm" disabled={pending} onClick={() => run(() => revokeApproval(appId), "Approval withdrawn")}>
            <RotateCcw /> Stop, withdraw my approval
          </Button>
        ) : null}
      </div>
    );
  }

  if (status === "manual_kit") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <NodStamp sub="kit ready" label="Ready" />
          <div className="text-[13px] text-ink-2">
            <p className="font-medium text-ink">Your application kit is ready</p>
            <p>Apply on the employer's site using the CV, cover letter and answers here.</p>
          </div>
        </div>
        <a href={applyUrl} target="_blank" rel="noreferrer" className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-ink text-sm font-medium text-paper hover:bg-ink-2">
          Open the employer's application form ↗
        </a>
        <Button variant="nod" className="w-full" disabled={pending} onClick={() => run(() => markApplied(appId), "Marked as applied")}>
          <Check /> I've applied
        </Button>
        <Button variant="ghost" size="sm" className="w-full" disabled={pending} onClick={() => run(() => revokeApproval(appId), "Approval withdrawn")}>
          <RotateCcw /> Withdraw approval and edit
        </Button>
        <p className="text-center font-mono text-[11px] text-muted">sha256 {approvedHash?.slice(0, 16)}…</p>
      </div>
    );
  }

  if (!waiting) return null;

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium">What will be sent</p>
        <ul className="mt-2 space-y-1.5 text-[13px] text-ink-2">
          <li className="flex justify-between"><span>Tailored CV</span><span className="font-mono">{summary.bullets} bullets · PDF</span></li>
          <li className="flex justify-between"><span>Cover letter</span><span className="font-mono">{summary.cover} sentences</span></li>
          <li className="flex justify-between"><span>Form answers</span><span className="font-mono">{summary.answers}</span></li>
          {summary.blocked ? (
            <li className="flex justify-between text-blocked"><span>Blocked, not sent</span><span className="font-mono">{summary.blocked}</span></li>
          ) : null}
          {summary.removed ? (
            <li className="flex justify-between text-muted"><span>Left out by you</span><span className="font-mono">{summary.removed}</span></li>
          ) : null}
        </ul>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-[13px] font-medium text-ink-2">How should it be sent?</legend>
        {[
          { v: "agent" as const, t: "Nod submits it for me", d: canAgent ? "Fills the employer's form with exactly this, then saves receipts." : "Not available for this employer yet.", disabled: !canAgent },
          { v: "manual" as const, t: "I'll apply myself", d: "Get the CV, cover letter and answers to paste into the employer's form.", disabled: false },
        ].map((o) => (
          <label
            key={o.v}
            className={cn(
              "flex cursor-pointer gap-3 rounded-[12px] border px-3 py-2.5 transition-colors",
              mode === o.v ? "border-ink bg-paper-2/70" : "border-line hover:bg-paper-2/40",
              o.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input type="radio" name="mode" value={o.v} checked={mode === o.v} disabled={o.disabled} onChange={() => setMode(o.v)} className="mt-1 accent-ink" />
            <span>
              <span className="block text-[14px] font-medium">{o.t}</span>
              <span className="block text-[12px] text-muted">{o.d}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {blockers.length ? (
        <div className="rounded-[10px] bg-warn-bg px-3 py-2.5 text-[13px] text-warn">
          <p className="font-medium">Before you can approve:</p>
          <ul className="mt-1 space-y-0.5">
            {blockers.map((b) => (
              <li key={b}>· {b}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {stamp ? (
        <div className="flex justify-center py-2">
          <NodStamp sub="approved" />
        </div>
      ) : (
        <Button
          variant="nod"
          size="lg"
          className="w-full text-[15px]"
          disabled={pending || blockers.length > 0}
          onClick={() =>
            run(async () => {
              const res = await approveApplication(appId, mode);
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              setStamp(true);
              toast.success(mode === "agent" ? "Approved. Nod is submitting now." : "Approved. Your kit is ready.", {
                description: `Recorded in your consent ledger · ${res.hash.slice(0, 12)}`,
              });
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Check />}
          {mode === "agent" ? "Nod: approve and send" : "Nod: approve the kit"}
        </Button>
      )}
      <p className="text-center text-[11px] leading-relaxed text-muted">
        Approving records a fingerprint (SHA-256) of exactly this content. If anything changes before sending, Nod stops and asks you again.
      </p>
      <Button variant="ghost" size="sm" className="w-full" disabled={pending} onClick={() => run(() => regenerateDraft(appId), "Redrafted from your facts")}>
        <RotateCcw /> Redraft from my facts
      </Button>
    </div>
  );
}

/* ----------------------------- Tracking ------------------------------ */

export function StatusMenu({ appId, status }: { appId: string; status: AppStatus }) {
  const [pending, run] = useAction();
  const options: AppStatus[] = ["submitted", "interviewing", "offer", "rejected", "withdrawn"];
  return (
    <Select
      value={status}
      disabled={pending}
      onChange={(e) => run(() => setApplicationStatus(appId, e.target.value as AppStatus), "Status updated")}
      className="h-8 w-auto rounded-full text-[13px]"
      aria-label="Application status"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o === "submitted" ? "Applied" : o[0].toUpperCase() + o.slice(1)}
        </option>
      ))}
    </Select>
  );
}

/** Keeps the page fresh while the agent works in the background. */
export function AutoRefresh({ every = 1500 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), every);
    return () => clearInterval(t);
  }, [router, every]);
  return null;
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check /> : <Eye className="hidden" />}
      {done ? "Copied" : label}
    </Button>
  );
}
