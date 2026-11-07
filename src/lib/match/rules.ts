import { RISK_LABEL } from "@/lib/jobs/normalize";
import type { jobs, preferences } from "@/lib/db/schema";
import { SENIORITY_LEVELS, normalise, seniorityOf, titleTokens } from "@/lib/skills";

export const MIN_SCORE = 30;
const KEYWORD_BONUS = 5;
const KEYWORD_BONUS_MAX = 10;

export type Prefs = typeof preferences.$inferSelect;
export type JobRow = Pick<
  typeof jobs.$inferSelect,
  | "id" | "title" | "company" | "location" | "workplace" | "salaryMin" | "salaryMax"
  | "salaryCurrency" | "skills" | "postedAt" | "riskFlags" | "sponsorMatch" | "isDemo" | "source"
>;

/* ------------------------------ Regions ------------------------------- */

const REGION_WORDS: Record<string, RegExp> = {
  uk: /\b(uk|united kingdom|england|scotland|wales|northern ireland|london|manchester|birmingham|leeds|bristol|edinburgh|glasgow|cambridge|oxford|cardiff|belfast|liverpool|newcastle|sheffield|nottingham|brighton|reading|emea|europe)\b/i,
  ie: /\b(ireland|dublin|cork|emea|europe)\b/i,
  eu: /\b(europe|eu|emea|germany|berlin|munich|france|paris|netherlands|amsterdam|spain|madrid|barcelona|lisbon|portugal|poland|warsaw|sweden|stockholm|denmark|copenhagen|italy|milan|zurich|switzerland)\b/i,
  us: /\b(us|usa|united states|america|americas|north america|new york|nyc|san francisco|sf|seattle|austin|boston|chicago|los angeles|denver|atlanta|[a-z]+, (ca|ny|wa|tx|ma|il|co|ga|or|nc|va|fl|nj|pa|ut|az))\b/i,
  ca: /\b(canada|toronto|vancouver|montreal|ottawa|americas|north america)\b/i,
  apac: /\b(apac|asia|india|bangalore|bengaluru|singapore|tokyo|japan|sydney|melbourne|australia|hong kong|seoul)\b/i,
  latam: /\b(latam|brazil|são paulo|sao paulo|mexico|argentina|colombia|americas)\b/i,
};

export function regionsOf(location: string): Set<string> {
  const out = new Set<string>();
  for (const [r, re] of Object.entries(REGION_WORDS)) if (re.test(location)) out.add(r);
  if (/\b(anywhere|global|worldwide)\b/i.test(location)) out.add("global");
  return out;
}

/* ------------------------------- Boards -------------------------------- */

export const boardKey = (source: string, token: string) => `${source}:${token.toLowerCase()}`;

/**
 * Jobs from Greenhouse, Lever and Ashby boards only reach users who follow the
 * board: the built-in ones, plus boards the user added. Custom boards stay private.
 */
export function onFollowedBoard(job: { source: string; sourceCompany: string }, followed: Set<string>) {
  const ats = job.source === "greenhouse" || job.source === "lever" || job.source === "ashby";
  return !ats || followed.has(boardKey(job.source, job.sourceCompany));
}

/* ----------------------------- Scoring --------------------------------- */

export type Scored = {
  jobId: string;
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  reasons: string[];
  warnings: string[];
};

const money = (n: number, cur: string | null) => {
  const sym = cur === "GBP" ? "£" : cur === "EUR" ? "€" : cur === "USD" ? "$" : "";
  return `${sym}${Math.round(n / 1000)}k${sym ? "" : ` ${cur ?? ""}`}`.trim();
};

export type ScoreContext = {
  prefs: Prefs | null;
  userSkills: Set<string>;
  userRegions: Set<string>;
  excluded: Set<string>;
  /** Preference keywords found in each job's title, company or ad text. */
  keywordHits?: Map<string, string[]>;
};

export function scoreJob(job: JobRow, ctx: ScoreContext): Scored | null {
  const { prefs, userSkills, userRegions } = ctx;
  const reasons: string[] = [];
  const warnings: string[] = [];

  // ---- Hard filters (deal-breakers) ----
  if (ctx.excluded.has(normalise(job.company).replace(/ \(demo\)$/, ""))) return null;

  const W = prefs?.workplace ?? [];
  const prefLocations = (prefs?.locations ?? []).filter((l) => !/^remote$/i.test(l.trim()));
  const jobIsRemote = job.workplace === "remote" || /remote/i.test(job.location);
  const locMatch = prefLocations.find((l) => job.location.toLowerCase().includes(l.toLowerCase().trim()));
  const jobRegions = regionsOf(job.location);
  const regionOk =
    jobRegions.size === 0 || jobRegions.has("global") || userRegions.size === 0 ||
    [...jobRegions].some((r) => userRegions.has(r));

  let placeReason = "";
  if (prefLocations.length || W.length) {
    const officeKinds = W.filter((w) => w !== "remote");
    const wantRemote = W.length === 0 || W.includes("remote");
    const wantOffice = W.length === 0 || officeKinds.length > 0;
    // Office rule: in one of your places, with a workplace type you accept.
    const workplaceOk =
      W.length === 0 || job.workplace === "unknown" ||
      officeKinds.includes(job.workplace as "hybrid" | "onsite") ||
      (job.workplace === "hybrid" && officeKinds.includes("onsite"));
    const placeOk = prefLocations.length ? Boolean(locMatch) : regionOk;
    const officeOk = wantOffice && !jobIsRemote && placeOk && workplaceOk;
    // Remote rule: remote, and open to people in your region.
    const remoteOk = wantRemote && jobIsRemote && regionOk;
    if (!officeOk && !remoteOk && !job.isDemo) return null;
    const kind = job.workplace === "unknown" ? "" : `${job.workplace[0].toUpperCase()}${job.workplace.slice(1)} in `;
    placeReason = remoteOk ? `Remote (${job.location || "location not stated"})` : `${kind}${locMatch ?? job.location}`;
  } else if (!regionOk) {
    warnings.push(`Location: ${job.location}`);
  }

  // Salary floor, only when the ad states a yearly salary in the same currency.
  if (prefs?.minSalary && job.salaryMax && job.salaryMax > 1000) {
    const sameCurrency = !job.salaryCurrency || job.salaryCurrency === prefs.salaryCurrency;
    if (sameCurrency && job.salaryMax < prefs.minSalary && !job.isDemo) return null;
  }

  // ---- Title ----
  let title = 0.5;
  if (prefs?.titles.length) {
    const jt = new Set(titleTokens(job.title));
    let best = 0;
    let bestTitle = "";
    for (const t of prefs.titles) {
      const pt = titleTokens(t);
      if (!pt.length) continue;
      const hit = pt.filter((x) => jt.has(x)).length / pt.length;
      if (hit > best) {
        best = hit;
        bestTitle = t;
      }
    }
    title = best;
    if (best >= 0.99) reasons.push(`Title matches “${bestTitle}”`);
    else if (best >= 0.5) reasons.push(`Title is close to “${bestTitle}”`);
  }

  // ---- Skills ----
  const jobSkills = job.skills;
  const matched = jobSkills.filter((s) => userSkills.has(s));
  const missing = jobSkills.filter((s) => !userSkills.has(s));
  const skill = jobSkills.length ? Math.min(1, matched.length / Math.min(jobSkills.length, 7)) : 0.4;
  if (jobSkills.length) {
    reasons.push(
      `${matched.length} of ${jobSkills.length} skills the ad mentions${matched.length ? `: ${matched.slice(0, 5).join(", ")}${matched.length > 5 ? "…" : ""}` : ""}`,
    );
  }

  // ---- Seniority ----
  const level = seniorityOf(job.title);
  let seniority = 1;
  if (prefs?.seniority.length) {
    const idx = SENIORITY_LEVELS.indexOf(level as (typeof SENIORITY_LEVELS)[number]);
    const dist = Math.min(
      ...prefs.seniority.map((s) => Math.abs(SENIORITY_LEVELS.indexOf(s as (typeof SENIORITY_LEVELS)[number]) - idx)),
    );
    seniority = dist === 0 ? 1 : dist === 1 ? 0.5 : 0;
    if (dist >= 1) warnings.push(`Seniority: this looks like a ${level}-level role`);
  }

  // ---- Freshness ----
  let fresh = 0.3;
  if (job.postedAt) {
    const days = (Date.now() - job.postedAt.getTime()) / 86_400_000;
    fresh = days <= 14 ? 1 : days <= 30 ? 0.6 : days <= 60 ? 0.3 : 0;
  }

  if (placeReason) reasons.push(placeReason);
  if (job.salaryMin || job.salaryMax) {
    const range = [job.salaryMin, job.salaryMax].filter(Boolean).map((n) => money(n!, job.salaryCurrency)).join("–");
    reasons.push(
      prefs?.minSalary && job.salaryMax && job.salaryMax >= prefs.minSalary
        ? `Salary ${range}, meets your minimum`
        : `Salary ${range}`,
    );
  }

  for (const f of job.riskFlags) if (RISK_LABEL[f] && f !== "via-aggregator") warnings.push(RISK_LABEL[f]);
  if (prefs?.needsSponsorship && !job.sponsorMatch && /uk|united kingdom|england|scotland|wales|london|manchester/i.test(job.location)) {
    warnings.push("Visa: company not found on the UK sponsor register");
  }

  const hits = ctx.keywordHits?.get(job.id) ?? [];
  if (hits.length) reasons.push(`Mentions ${hits.join(", ")}`);

  let score = Math.round(100 * (0.42 * title + 0.38 * skill + 0.12 * seniority + 0.08 * fresh));
  if (prefs?.titles.length && title < 0.5) score = Math.min(score, 45);
  score = Math.min(100, score + Math.min(KEYWORD_BONUS_MAX, hits.length * KEYWORD_BONUS));
  if (job.riskFlags.includes("scam-language")) score = Math.round(score * 0.5);
  if (job.isDemo) score = Math.max(score, MIN_SCORE);
  return { jobId: job.id, score, matchedSkills: matched, missingSkills: missing, reasons, warnings };
}

/** A case-insensitive whole-word Postgres regex for one keyword. */
export function keywordPattern(keyword: string) {
  const k = keyword.trim();
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const start = /^\w/.test(k) ? "\\m" : "";
  const end = /\w$/.test(k) ? "\\M" : "";
  return `${start}${escaped}${end}`;
}
