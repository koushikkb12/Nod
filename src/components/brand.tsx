import Link from "next/link";
import { cn } from "./ui";

/** "nod" with the o as a chartreuse dot that nods now and then. */
export function Wordmark({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("group inline-flex items-baseline font-display text-[30px] leading-none text-ink", className)} aria-label="Nod home">
      <span>n</span>
      <span
        aria-hidden
        className="mx-[0.02em] inline-block size-[0.5em] translate-y-[0.02em] rounded-full bg-nod ring-[0.07em] ring-ink animate-nod"
      />
      <span>d</span>
    </Link>
  );
}

/** Round approval stamp, used for approved receipts. */
export function NodStamp({ label = "Nodded", sub, className }: { label?: string; sub?: string; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex size-[92px] -rotate-8 flex-col items-center justify-center rounded-full border-[2.5px] border-traced text-traced animate-stamp",
        className,
      )}
    >
      <span className="font-display text-[22px] leading-none">{label}</span>
      {sub ? <span className="mt-1 font-mono text-[9px] uppercase tracking-widest">{sub}</span> : null}
    </div>
  );
}

/** Fact citation chip, e.g. [F3]. */
export function FactChip({ n, title, className }: { n: number | string; title?: string; className?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-[18px] min-w-[22px] items-center justify-center rounded-[5px] border border-traced/30 bg-traced-bg px-1 align-[1px] font-mono text-[10px] font-medium text-traced",
        className,
      )}
    >
      F{n}
    </span>
  );
}

/** Match score shown as a ring. */
export function ScoreRing({ score, size = 46 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const color = pct >= 70 ? "var(--color-traced)" : pct >= 50 ? "var(--color-ink)" : "var(--color-muted)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`Match score ${pct} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={3} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[13px] font-medium text-ink">{pct}</span>
    </div>
  );
}

/** Company initial tile. */
export function CompanyTile({ name, className }: { name: string; className?: string }) {
  const clean = name.replace(/\s*\(demo\)$/i, "");
  const initials = clean
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  let hash = 0;
  for (const ch of clean) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const palettes = [
    ["#e9e4d6", "#3b3c42"],
    ["#dfe8dc", "#2f5a3a"],
    ["#e4e2f0", "#3d3a6b"],
    ["#f1e0d6", "#7a3b1f"],
    ["#dde7ee", "#28506e"],
    ["#efe6c9", "#6b5410"],
  ];
  const [bg, fg] = palettes[hash % palettes.length];
  return (
    <div
      className={cn("flex size-10 shrink-0 items-center justify-center rounded-[10px] font-mono text-[13px] font-semibold", className)}
      style={{ background: bg, color: fg }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
