# Nod

**The job agent that waits for your nod.** Nod reads your CV, finds jobs that fit your preferences, and drafts each application using only facts you've confirmed. It shows you exactly what would be sent, and nothing leaves without your approval.

This is the first build of the plan in `outputs/job-agent-research-plan.md`. It runs entirely on your machine: an embedded Postgres database, a local file store and a headless browser. No cloud account is needed.

## Quick start

Requirements: Node.js 20.9 or newer (developed on Node 24) and npm.

```bash
cd nod
npm install
npx playwright install chromium     # browser used for CV PDFs and form submission
cp .env.example .env.local          # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
npx next typegen                    # generates route types used by npm run typecheck
npm run dev                         # http://localhost:3000
```

A sample CV is included at `samples/alex-morgan-cv.pdf`; `npm run sample-cv` regenerates it. To try Nod end to end:

1. Sign up, then upload the CV under **CV & facts**. Check the facts Nod extracted and confirm them.
2. Set your target titles, locations, salary and right-to-work details under **Preferences**.
3. On **Jobs**, press **Find new jobs**. Nod reads about 9,500 live postings from 61 employer job boards (about 15 seconds) and ranks them against your facts.
4. Open a match and press **Prepare application**. Review the tailored CV, cover letter and form answers, then approve.
5. The three *(demo)* employers use Hirefield, a demo applicant tracking system built into the app, so you can watch Nod submit for real. Receipts appear on the application page, and the employer's side is at `/demo-ats/inbox`. One demo employer changes its form after you approve, to show that Nod stops and asks you again.

## What it does

| Area | What Nod does |
|---|---|
| **CV intake** | Parses PDF, DOCX or TXT into a **fact bank**: roles, achievements, skills, education and certifications. Every fact starts unconfirmed, and Nod won't use it until you confirm it. |
| **Job discovery** | Reads the public posting APIs of employers' applicant tracking systems: Greenhouse, Lever and Ashby. Adzuna (UK aggregator) is optional. It deduplicates postings, marks closed ones, and sanitises job ad HTML. You can paste a single Greenhouse, Lever or Ashby job link, or add a whole company board in Preferences (your boards are private to you). Jobs from boards nobody follows any more are closed on the next refresh. While the server runs it refreshes jobs every 6 hours (`NOD_REFRESH_HOURS`), and the Jobs page marks postings that are new since your last visit. |
| **Matching** | Applies hard filters (location, workplace, salary floor, excluded companies, sponsorship), then scores skills, title and seniority, with a small boost for your preference keywords. Each score is explained: matched and missing skills, reasons and warnings. The Jobs page filters by workplace, recency, score, source, stated salary and licensed sponsors. With an AI key, a "Why this fits" summary is written for any match and filtered through the fact guard. |
| **Insights** | Shows the skills your matches ask for most that aren't in your facts, your strongest skills, an application funnel (drafted, applied, interviewing, offer) with response rates, and weekly activity. |
| **Signals** | Checks employers against the UK Home Office register of licensed sponsors. Flags scam wording (upfront fees, payment requests, off-platform contact), stale or very short ads, and hidden instructions aimed at AI tools. |
| **Drafting** | Builds a tailored CV, a cover letter and form answers. Every sentence cites the facts it relies on. A guard blocks any sentence with numbers, skills, employers or titles that aren't in your confirmed facts. |
| **Form answers** | Fills answers from your profile, preferences and answer library. It never guesses: unknown questions are marked *Needs you*, and diversity questions default to "prefer not to say". |
| **Consent** | Approving stores the exact payload and its SHA-256 hash in an **append-only ledger**, enforced by a database trigger. You can withdraw an approval until it's sent. |
| **Submission** | Playwright fills the employer's form with exactly the approved payload. It re-checks the hash first, and stops with *Needs you* if the live form asks anything new. It saves screenshots as receipts. |
| **Manual mode** | For real employers, Nod gives you a kit (PDF CV, cover letter and answers) to apply yourself. You then mark the application as applied. |
| **Controls & data** | Agent pause switch, a daily submission limit and a per-company monthly limit. Also an application tracker with event history, a full JSON export and account deletion. |
| **Tracking & interviews** | Each sent application has private notes (never sent to the employer), a follow-up date, and interviews you can download as an `.ics` calendar file. The dashboard lists upcoming interviews and suggests a follow-up after 10 days with no news. A prep pack lists likely questions, with talking points taken word for word from your confirmed facts. |

## Safety switches

- **Real employer submission is off by default.** The agent only submits to the built-in demo ATS, and real jobs use "I'll apply myself". `NOD_ALLOW_REAL_SUBMISSIONS=true` exists for adapter development only. Read the legal and platform section of the plan before turning it on: LinkedIn and Indeed prohibit automation, and each ATS has its own terms.
- **No LinkedIn or Indeed scraping.** Jobs come only from public employer APIs that are meant to be read.
- **Prompt injection.** Job ads are treated as untrusted data. Hidden instructions are flagged, shown to you and ignored, and the fact guard blocks any claim they try to introduce.

## Database and deployment security

- PGlite is for local development. Production database initialization fails closed unless `DATABASE_URL` points to PostgreSQL, `BETTER_AUTH_SECRET` has at least 32 bytes of entropy, `BETTER_AUTH_URL` and `NOD_BASE_URL` are HTTPS URLs on the same origin, and `NOD_DATA_DIR` is set.
- Remote PostgreSQL connections verify TLS certificates. Do not add credentials to source files or `NEXT_PUBLIC_` variables; supply them through the deployment's secret environment settings.
- PostgreSQL stores account and application records. CVs, generated PDFs and screenshots remain files under `NOD_DATA_DIR`; the app restricts these directories/files to the service account. Production must mount private persistent storage there, enable the host's at-rest volume encryption, and back it up with the database. Files are not encrypted separately by the app.
- Auth request throttling uses the database, so limits are shared across app processes. The migration creates the `rate_limit` table.
- Production responses set security headers, a per-response CSP nonce, HSTS and `no-store`. The demo ATS is local-only because this build has no separate employer identity. Locally, the inbox and CV downloads require sign-in and show only the signed-in user's submissions; Nod's submit worker uses a short-lived signed HttpOnly cookie, and deleting an account also deletes its demo ATS copies.
- The password input is sent to Better Auth in the request body, not in a URL. Better Auth stores a password hash. In production, the app requires HTTPS for its configured public URLs; do not expose the development server directly to the internet.

The repository cannot provision a managed PostgreSQL service or deployment secrets by itself. Before a production deployment, create a PostgreSQL database and private persistent file volume, then set the required environment variables in the hosting provider.

## AI is optional

With no AI key, Nod uses its rule-based parser, matcher and drafter, and everything above still works. To use a model, add one key to `.env.local`: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY`. Nod then uses the [AI SDK](https://ai-sdk.dev) for CV parsing and drafting. Choose the provider or model with `NOD_AI_PROVIDER` and `NOD_AI_MODEL`. AI output goes through the same fact guard as rule-based output.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack, Cache Components, server actions), React 19, TypeScript |
| UI | Tailwind CSS 4, hand-built components, Instrument Serif and Geist type, lucide icons, sonner toasts |
| Data | PGlite (Postgres compiled to WebAssembly, stored in `data/`) with Drizzle ORM and SQL migrations |
| Auth | Better Auth (email and password, database sessions) |
| AI | Vercel AI SDK 7 with OpenAI, Anthropic or Google; Zod schemas for structured output |
| Documents | unpdf (PDF text), mammoth (DOCX), sanitize-html (job ads) |
| Automation | Playwright (CV PDF rendering, form filling, screenshots) |

## Project layout

```
src/
  app/
    page.tsx                  landing page
    (auth)/                   sign in and sign up
    app/                      the signed-in product
      page.tsx                home: next steps and activity
      profile/                CV upload, fact bank, answer library
      preferences/            targets, filters, limits, agent pause
      jobs/, jobs/[jobId]/    ranked matches and job detail
      applications/           tracker, and the review and approve screen
      ledger/                 consent ledger, export, account deletion
      actions/                server actions
    demo-ats/                 Hirefield demo employer forms and inbox
    api/                      auth, files, export, ingest status, demo ATS
  lib/
    cv/                       text extraction and parsing
    jobs/                     connectors, normalising, risk flags, sponsors, ingest
    match/                    filters, scoring and explanations
    draft/                    drafter, fact guard, form-answer mapper
    consent/                  approval payload, hashing, blockers
    submit/                   PDF renderer and submission engine
    db/                       schema and PGlite client
drizzle/                      migrations (0001 makes the ledger append-only)
scripts/                      board validation and sample CV generator
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the app on port 3000 |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm test` | Unit tests (Vitest) for matching, the fact guard, form answers and payload hashing |
| `npm run db:generate` | Generate a migration after editing `src/lib/db/schema.ts` |
| `npm run boards:check` | Re-validate the company board list against the live APIs |
| `npm run sample-cv` | Regenerate the sample CV in `samples/` |

## Notes and limits

- PGlite is single-process, so only one Nod server can use a `data/` folder at a time. Nod holds a lock (`data/pglite.lock`) and refuses to open a folder that another running process is using. To start over, stop the server and delete `data/pglite` and `data/files`.
- Ingest runs inside the web server. That's fine on one machine; a production deployment would move ingest, matching and submission to a job queue (see the roadmap in the plan).
- Email reply tracking (Gmail and Outlook) isn't built yet. Google requires a paid security assessment for the restricted Gmail scopes, as the plan explains.
- Without an AI key, the drafter only rearranges and quotes your confirmed facts. Cover letters are accurate but plain.
