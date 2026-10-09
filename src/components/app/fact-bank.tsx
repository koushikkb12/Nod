"use client";

import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addFact, confirmAllFacts, deleteFact, setFactConfirmed, updateFact } from "@/app/app/actions/profile";
import { FactChip } from "@/components/brand";
import { Badge, Button, cn, Textarea } from "@/components/ui";
import type { FactKind } from "@/lib/types";

export type FactView = {
  id: string;
  n: number;
  kind: FactKind;
  parentId: string | null;
  text: string;
  confirmed: boolean;
  source: "cv" | "user";
  skills: string[];
};

function FactRow({ f, nested }: { f: FactView; nested?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(f.text);
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

  return (
    <li className={cn("group flex items-start gap-3 rounded-[10px] px-3 py-2.5 transition-colors", nested && "ml-6", pending && "opacity-60", !f.confirmed && "bg-warn-bg/40")}>
      <button
        type="button"
        aria-label={f.confirmed ? "Mark as not confirmed" : "Confirm this fact"}
        onClick={() => run(() => setFactConfirmed(f.id, !f.confirmed))}
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors",
          f.confirmed ? "border-traced bg-traced text-paper" : "border-line-2 bg-card hover:border-ink",
        )}
      >
        {f.confirmed ? <Check className="size-3.5" /> : null}
      </button>
      <FactChip n={f.n} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="space-y-2">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-16 text-[14px]" autoFocus />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => run(async () => { await updateFact(f.id, text); setEditing(false); }, "Fact updated")}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setText(f.text); setEditing(false); }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className={cn("text-[14px] leading-relaxed", f.kind === "role" ? "font-medium text-ink" : "text-ink-2")}>{f.text}</p>
        )}
        {!editing && (f.skills.length || f.source === "user") ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {f.source === "user" ? <Badge tone="info">Added by you</Badge> : null}
            {f.skills.slice(0, 6).map((s) => (
              <Badge key={s} tone="outline" className="text-[11px]">
                {s}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
      {!editing ? (
        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Button size="icon" variant="ghost" className="size-8" aria-label="Edit" onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
          <Button size="icon" variant="ghost" className="size-8 hover:text-blocked" aria-label="Delete" onClick={() => run(() => deleteFact(f.id), "Fact removed")}>
            <Trash2 />
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function AddFact({ parentId, kind, label }: { parentId?: string; kind: FactKind; label: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  if (!open)
    return (
      <li>
        <button type="button" onClick={() => setOpen(true)} className={cn("flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[13px] text-muted hover:bg-paper-2 hover:text-ink", parentId && "ml-6")}>
          <Plus className="size-3.5" /> {label}
        </button>
      </li>
    );
  return (
    <li>
    <form
      action={(fd) =>
        start(async () => {
          await addFact(fd);
          setOpen(false);
          toast.success("Fact added and confirmed");
        })
      }
      className={cn("space-y-2 px-3 py-2", parentId && "ml-6")}
    >
      <input type="hidden" name="kind" value={kind} />
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
      <Textarea name="text" placeholder="One fact, in your own words. Include real numbers only." className="min-h-16 text-[14px]" autoFocus required />
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={pending}>
          Add fact
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
          <X /> Cancel
        </Button>
      </div>
    </form>
    </li>
  );
}

const GROUPS: { kind: FactKind; title: string; add?: string }[] = [
  { kind: "other", title: "Summary", add: "Add a summary fact" },
  { kind: "skill", title: "Skills", add: "Add skills" },
  { kind: "education", title: "Education", add: "Add education" },
  { kind: "certification", title: "Certifications", add: "Add a certification" },
  { kind: "project", title: "Projects", add: "Add a project" },
];

export function FactBank({ facts }: { facts: FactView[] }) {
  const [pending, start] = useTransition();
  const confirmed = facts.filter((f) => f.confirmed).length;
  const roles = facts.filter((f) => f.kind === "role");
  const byParent = (id: string) => facts.filter((f) => f.parentId === id);
  const orphans = facts.filter((f) => f.kind === "achievement" && !roles.some((r) => r.id === f.parentId));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-line bg-paper-2/60 px-4 py-3">
        <div>
          <p className="text-[14px] font-medium">
            {confirmed} of {facts.length} facts confirmed
          </p>
          <div className="mt-1.5 h-1.5 w-56 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-traced transition-all" style={{ width: `${facts.length ? (confirmed / facts.length) * 100 : 0}%` }} />
          </div>
        </div>
        {confirmed < facts.length ? (
          <Button
            variant="nod"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await confirmAllFacts();
                toast.success("All facts confirmed", { description: "Matches updated." });
              })
            }
          >
            <Check /> I've checked them, confirm all
          </Button>
        ) : null}
      </div>
      <p className="text-[13px] text-muted">
        Unconfirmed facts are highlighted. Drafts can only use confirmed facts, and every sentence Nod writes cites one, like <FactChip n={3} />.
      </p>

      {roles.length ? (
        <section>
          <h3 className="mb-2 px-3 text-[12px] font-medium uppercase tracking-[0.12em] text-muted">Experience</h3>
          <div className="space-y-2">
            {roles.map((r) => (
              <ul key={r.id} className="rounded-[12px] border border-line bg-card py-1.5">
                <FactRow f={r} />
                {byParent(r.id).map((a) => (
                  <FactRow key={a.id} f={a} nested />
                ))}
                <AddFact parentId={r.id} kind="achievement" label="Add an achievement" />
              </ul>
            ))}
          </div>
        </section>
      ) : null}
      {orphans.length ? (
        <ul className="rounded-[12px] border border-line bg-card py-1.5">
          {orphans.map((f) => (
            <FactRow key={f.id} f={f} />
          ))}
        </ul>
      ) : null}

      {GROUPS.map((g) => {
        const list = facts.filter((f) => f.kind === g.kind);
        return (
          <section key={g.kind}>
            <h3 className="mb-2 px-3 text-[12px] font-medium uppercase tracking-[0.12em] text-muted">{g.title}</h3>
            <ul className="rounded-[12px] border border-line bg-card py-1.5">
              {list.map((f) => (
                <FactRow key={f.id} f={f} />
              ))}
              {g.add ? <AddFact kind={g.kind} label={g.add} /> : null}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
