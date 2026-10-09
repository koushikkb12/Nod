import { ArrowRight, Check, FileCheck2, Fingerprint, Radar, ShieldBan, X } from "lucide-react";
import Link from "next/link";
import { FactChip, NodStamp, Wordmark } from "@/components/brand";
import { buttonVariants, cn } from "@/components/ui";
import { BOARDS } from "@/lib/jobs/companies";

function HeroReceipt() {
  return (
    <div className="relative mx-auto w-full max-w-[460px]">
      <div className="absolute -inset-6 -z-10 rounded-[28px] bg-nod/40 blur-2xl" />
      <div className="rotate-[1.2deg] rounded-[18px] border border-line bg-card shadow-[var(--shadow-lift)]">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Draft · waiting for your nod</p>
            <p className="mt-0.5 text-[15px] font-medium">Software Engineer, Fleet Platform</p>
          </div>
          <span className="rounded-full bg-paper-2 px-2.5 py-1 font-mono text-[11px] text-ink-2">Northwind</span>
        </div>
        <div className="space-y-3 px-5 py-4 text-[14px] leading-relaxed text-ink-2">
          <p>
            Built Python and TypeScript services that scheduled deliveries for 1,200 drivers <FactChip n={4} />
          </p>
          <p>
            Cut API response times by 38% by redesigning PostgreSQL indexes <FactChip n={6} />
          </p>
          <div className="rounded-[10px] border border-blocked/25 bg-blocked-bg px-3 py-2.5">
            <p className="text-blocked line-through decoration-blocked/50">10 years of Kubernetes experience leading 40 engineers.</p>
            <p className="mt-1 flex items-center gap-1.5 text-[12px] font-medium text-blocked">
              <ShieldBan className="size-3.5" /> Blocked: not in your facts. Came from hidden text in the job ad.
            </p>
          </div>
          <p>
            I'd welcome the chance to bring this experience to Northwind. <span className="font-mono text-[10px] text-muted">framing</span>
          </p>
        </div>
        <div className="perforated border-t border-dashed border-line-2 bg-paper-2/60 px-5 py-4">
          <div className="flex items-end justify-between">
            <div className="font-mono text-[11px] leading-5 text-muted">
              <p>payload sha256</p>
              <p className="text-ink">8f3a91c2 e04b7d15 …</p>
              <p>11 answers · CV.pdf · 0 guesses</p>
            </div>
            <NodStamp sub="approved" className="-mb-1" />
          </div>
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  {
    icon: FileCheck2,
    title: "Your CV becomes facts",
    body: "Upload a PDF or Word CV. Nod splits it into facts (roles, achievements, skills) and you confirm each one. Drafts can only use confirmed facts.",
  },
  {
    icon: Radar,
    title: "Nod reads employers directly",
    body: `Jobs come straight from ${BOARDS.length}+ company boards through public APIs (Greenhouse, Lever, Ashby), plus Adzuna when it's set up. Nod doesn't scrape LinkedIn or Indeed.`,
  },
  {
    icon: Fingerprint,
    title: "Every sentence is traced",
    body: "Tailored CV bullets, cover letters and form answers link back to the facts they came from. Anything Nod can't back up is blocked before you even see it.",
  },
  {
    icon: Check,
    title: "You nod. Then it sends.",
    body: "Approve the exact payload, which is hashed and recorded in your consent ledger. Nod submits only that, and keeps screenshots as receipts.",
  },
];

const WONT = [
  "Apply to anything you haven't approved",
  "Invent skills, numbers or job titles",
  "Guess your right to work or visa status",
  "Answer diversity questions unless you choose to",
  "Run bots on LinkedIn or Indeed",
  "Mass-apply to hit a number",
];

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Wordmark />
        <nav className="flex items-center gap-1 text-sm">
          <a href="#how" className="hidden rounded-full px-3 py-2 text-ink-2 hover:bg-paper-2 sm:block">
            How it works
          </a>
          <a href="#promises" className="hidden rounded-full px-3 py-2 text-ink-2 hover:bg-paper-2 sm:block">
            Promises
          </a>
          <Link href="/sign-in" className="rounded-full px-3 py-2 text-ink-2 hover:bg-paper-2">
            Sign in
          </Link>
          <Link href="/sign-up" className={cn(buttonVariants({ size: "sm" }), "ml-1")}>
            Get started
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 pb-20 pt-10 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
          <div className="animate-rise">
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-line-2 bg-card px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-2">
              <span className="size-1.5 rounded-full bg-traced" /> Consent-first job agent
            </p>
            <h1 className="font-display text-[56px] leading-[0.98] tracking-[-0.02em] sm:text-[76px]">
              The job agent that <em className="italic">waits</em> for your <span className="relative inline-block">nod<span className="absolute -bottom-1 left-0 right-0 -z-10 h-[0.32em] bg-nod" /></span>.
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-2">
              Nod finds jobs that fit your CV and preferences, then drafts each application using only facts you've confirmed. It shows you exactly what would be sent. Nothing leaves without your approval.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
                Upload your CV <ArrowRight />
              </Link>
              <a href="#how" className={buttonVariants({ variant: "outline", size: "lg" })}>
                See how it works
              </a>
            </div>
            <p className="mt-6 font-mono text-[12px] text-muted">
              {BOARDS.length} company boards · UK sponsor register · 0 applications sent without approval
            </p>
          </div>
          <HeroReceipt />
        </section>

        <section id="how" className="border-y border-line bg-card/60">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="max-w-2xl font-display text-[44px] leading-[1.02]">Less spraying. More applications you'd actually sign.</h2>
            <div className="mt-12 grid gap-px overflow-hidden rounded-[18px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <div key={s.title} className="bg-card p-6">
                  <div className="flex items-center justify-between">
                    <s.icon className="size-5 text-ink" />
                    <span className="font-mono text-[11px] text-muted">0{i + 1}</span>
                  </div>
                  <h3 className="mt-8 text-[17px] font-semibold">{s.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="promises" className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-[44px] leading-[1.02]">Built so recruiters get fewer, better applications.</h2>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-ink-2">
              Auto-apply bots flood hiring teams with generic applications and get accounts banned. Nod goes the other way. You set daily and per-company limits, every claim is checked, and every submission comes with a receipt you can show anyone.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                ["Consent ledger", "Append-only record of every approval and withdrawal"],
                ["Receipts", "Screenshots of the filled form and the employer's confirmation"],
                ["Your data", "Export everything or delete your account in one click"],
              ].map(([t, b]) => (
                <div key={t} className="rounded-[14px] border border-line bg-card p-4">
                  <p className="text-sm font-semibold">{t}</p>
                  <p className="mt-1 text-[13px] leading-snug text-muted">{b}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[18px] bg-ink p-8 text-paper">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-paper/60">Nod will never</p>
            <ul className="mt-5 space-y-3.5">
              {WONT.map((w) => (
                <li key={w} className="flex items-start gap-3 text-[16px]">
                  <X className="mt-0.5 size-4 shrink-0 text-nod" /> {w}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="flex flex-col items-start justify-between gap-6 rounded-[22px] border border-line bg-nod px-8 py-10 sm:flex-row sm:items-center">
            <p className="font-display text-[38px] leading-none">Ready when you are.</p>
            <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
              Get started <ArrowRight />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-[13px] text-muted">
          <Wordmark className="text-[22px]" />
          <p>
            Job data from employer ATS APIs. Try the{" "}
            <Link href="/demo-ats/inbox" className="underline underline-offset-4">
              demo employer inbox
            </Link>
            .
          </p>
        </div>
      </footer>
    </div>
  );
}
