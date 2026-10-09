import "server-only";
import type { FormQuestion } from "@/lib/types";
import { detectWorkplace, finalize, type NormalizedJob } from "./normalize";
import type { Board } from "./companies";

const UA = "NodJobAgent/0.1 (+consent-first job search; contact: local)";

async function getJson<T>(url: string, timeoutMs = 45_000): Promise<T> {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

const date = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/* ------------------------------ Greenhouse ------------------------------ */

type GhJob = {
  id: number;
  title: string;
  updated_at: string;
  first_published?: string;
  absolute_url: string;
  location?: { name?: string };
  content?: string;
  company_name?: string;
  metadata?: { name: string; value: unknown }[] | null;
};

export async function fetchGreenhouse(board: Board): Promise<NormalizedJob[]> {
  const data = await getJson<{ jobs: GhJob[] }>(
    `https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs?content=true`,
  );
  return data.jobs.map((j) => {
    const location = j.location?.name ?? "";
    return finalize({
      id: `greenhouse:${board.token}:${j.id}`,
      source: "greenhouse",
      sourceCompany: board.token,
      externalId: String(j.id),
      company: board.name,
      title: j.title.trim(),
      location,
      workplace: detectWorkplace(location, j.title),
      employmentType: null,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      rawHtml: j.content ?? "",
      applyUrl: j.absolute_url,
      sourceUrl: j.absolute_url,
      questions: null, // fetched on demand when the user prepares an application
      postedAt: date(j.first_published ?? j.updated_at),
      isDemo: false,
    });
  });
}

type GhQuestion = {
  required: boolean;
  label: string;
  description?: string | null;
  fields: { name: string; type: string; values?: { label: string; value: string | number }[] }[];
};

/** The real application questions for one Greenhouse job. */
export async function fetchGreenhouseQuestions(token: string, jobId: string): Promise<FormQuestion[]> {
  const data = await getJson<{
    questions?: GhQuestion[];
    location_questions?: GhQuestion[];
    compliance?: { type: string; questions: GhQuestion[] }[];
    demographic_questions?: {
      questions?: { id: number; label: string; required: boolean; answer_options?: { id: number; label: string }[] }[];
    } | null;
  }>(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs/${jobId}?questions=true`, 20_000);

  const out: FormQuestion[] = [];
  const add = (q: GhQuestion, sensitive = false) => {
    for (const f of q.fields) {
      const type: FormQuestion["type"] =
        f.type === "input_file" ? "file"
        : f.type === "textarea" ? "textarea"
        : f.type.startsWith("multi_value") ? "select"
        : "text";
      out.push({
        id: f.name,
        label: q.label,
        required: q.required,
        type,
        options: f.values?.map((v) => ({ label: v.label, value: String(v.value) })),
        sensitive,
      });
    }
  };
  data.questions?.forEach((q) => add(q));
  data.location_questions?.forEach((q) => add(q));
  data.compliance?.forEach((c) => c.questions.forEach((q) => add(q, true)));
  data.demographic_questions?.questions?.forEach((q) =>
    out.push({
      id: `demographic_${q.id}`,
      label: q.label,
      required: q.required,
      type: "select",
      options: q.answer_options?.map((o) => ({ label: o.label, value: String(o.id) })),
      sensitive: true,
    }),
  );
  // Greenhouse sends cover letter as both a file and text field; keep text.
  return out.filter((q, i) => !(q.id === "cover_letter" && q.type === "file" && out.some((o, k) => k !== i && o.id === "cover_letter_text")));
}

/* -------------------------------- Lever -------------------------------- */

type LeverJob = {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl: string;
  createdAt: number;
  workplaceType?: string;
  categories?: { location?: string; commitment?: string; allLocations?: string[] };
  description?: string;
  descriptionPlain?: string;
  lists?: { text: string; content: string }[];
  additional?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
};

export async function fetchLever(board: Board): Promise<NormalizedJob[]> {
  const data = await getJson<LeverJob[]>(`https://api.lever.co/v0/postings/${board.token}?mode=json`);
  return data.map((j) => {
    const location = j.categories?.allLocations?.join("; ") || j.categories?.location || "";
    const html = [
      j.description ?? "",
      ...(j.lists ?? []).map((l) => `<h3>${l.text}</h3><ul>${l.content}</ul>`),
      j.additional ?? "",
    ].join("\n");
    const yearly = !j.salaryRange?.interval || /year|annual/i.test(j.salaryRange.interval);
    return finalize({
      id: `lever:${board.token}:${j.id}`,
      source: "lever",
      sourceCompany: board.token,
      externalId: j.id,
      company: board.name,
      title: j.text.trim(),
      location,
      workplace:
        j.workplaceType === "remote" ? "remote"
        : j.workplaceType === "hybrid" ? "hybrid"
        : j.workplaceType === "on-site" ? "onsite"
        : detectWorkplace(location),
      employmentType: j.categories?.commitment ?? null,
      salaryMin: yearly ? (j.salaryRange?.min ?? null) : null,
      salaryMax: yearly ? (j.salaryRange?.max ?? null) : null,
      salaryCurrency: j.salaryRange?.currency ?? null,
      rawHtml: html,
      applyUrl: j.applyUrl,
      sourceUrl: j.hostedUrl,
      questions: null,
      postedAt: date(j.createdAt),
      isDemo: false,
    });
  });
}

/* -------------------------------- Ashby -------------------------------- */

type AshbyJob = {
  id: string;
  title: string;
  location: string;
  secondaryLocations?: { location: string }[];
  employmentType?: string;
  publishedAt?: string;
  isListed?: boolean;
  isRemote?: boolean;
  workplaceType?: string;
  jobUrl: string;
  applyUrl: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  compensation?: {
    summaryComponents?: {
      compensationType: string;
      interval?: string;
      currencyCode?: string;
      minValue?: number;
      maxValue?: number;
    }[];
  };
};

export async function fetchAshby(board: Board): Promise<NormalizedJob[]> {
  const data = await getJson<{ jobs: AshbyJob[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${board.token}?includeCompensation=true`,
  );
  return data.jobs
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const location = [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)].join("; ");
      const salary = j.compensation?.summaryComponents?.find(
        (c) => c.compensationType === "Salary" && (!c.interval || /YEAR/i.test(c.interval)),
      );
      const wt = (j.workplaceType ?? "").toLowerCase();
      return finalize({
        id: `ashby:${board.token}:${j.id}`,
        source: "ashby",
        sourceCompany: board.token,
        externalId: j.id,
        company: board.name,
        title: j.title.trim(),
        location,
        workplace:
          wt === "remote" || j.isRemote ? "remote"
          : wt === "hybrid" ? "hybrid"
          : wt === "onsite" ? "onsite"
          : detectWorkplace(location),
        employmentType: j.employmentType ?? null,
        salaryMin: salary?.minValue ?? null,
        salaryMax: salary?.maxValue ?? null,
        salaryCurrency: salary?.currencyCode ?? null,
        rawHtml: j.descriptionHtml ?? "",
        plainText: j.descriptionPlain,
        applyUrl: j.applyUrl,
        sourceUrl: j.jobUrl,
        questions: null,
        postedAt: date(j.publishedAt),
        isDemo: false,
      });
    });
}

/* -------------------------------- Adzuna ------------------------------- */

type AdzunaJob = {
  id: string;
  title: string;
  description: string;
  created: string;
  redirect_url: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string;
  contract_time?: string;
};

export function adzunaEnabled() {
  return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
}

/** UK search through Adzuna for each preferred title (and location). */
export async function fetchAdzuna(titles: string[], locations: string[]): Promise<NormalizedJob[]> {
  if (!adzunaEnabled()) return [];
  const out: NormalizedJob[] = [];
  const where = locations.find((l) => !/remote/i.test(l)) ?? "";
  for (const what of titles.slice(0, 4)) {
    const params = new URLSearchParams({
      app_id: process.env.ADZUNA_APP_ID!,
      app_key: process.env.ADZUNA_APP_KEY!,
      results_per_page: "50",
      what,
      "content-type": "application/json",
      max_days_old: "30",
    });
    if (where) params.set("where", where);
    const data = await getJson<{ results: AdzunaJob[] }>(
      `https://api.adzuna.com/v1/api/jobs/gb/search/1?${params}`,
    );
    for (const j of data.results) {
      const company = j.company?.display_name?.trim() || "Unknown employer";
      const location = j.location?.display_name ?? "";
      const predicted = j.salary_is_predicted === "1";
      out.push(
        finalize({
          id: `adzuna:gb:${j.id}`,
          source: "adzuna",
          sourceCompany: "gb",
          externalId: String(j.id),
          company,
          title: j.title.replace(/<[^>]+>/g, "").trim(),
          location,
          workplace: detectWorkplace(j.title, j.description, location),
          employmentType: j.contract_time ?? null,
          salaryMin: predicted ? null : (j.salary_min ? Math.round(j.salary_min) : null),
          salaryMax: predicted ? null : (j.salary_max ? Math.round(j.salary_max) : null),
          salaryCurrency: "GBP",
          rawHtml: `<p>${j.description}</p>`,
          applyUrl: j.redirect_url,
          sourceUrl: j.redirect_url,
          questions: null,
          postedAt: date(j.created),
          isDemo: false,
        }),
      );
    }
  }
  return out;
}

/** Is a single job still open at its source? Used right before submitting. */
export async function isStillOpen(job: { source: string; sourceCompany: string; externalId: string }) {
  try {
    if (job.source === "greenhouse") {
      const res = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${job.sourceCompany}/jobs/${job.externalId}`,
        { signal: AbortSignal.timeout(15_000), cache: "no-store" },
      );
      return res.ok;
    }
    if (job.source === "lever") {
      const res = await fetch(
        `https://api.lever.co/v0/postings/${job.sourceCompany}/${job.externalId}`,
        { signal: AbortSignal.timeout(15_000), cache: "no-store" },
      );
      return res.ok;
    }
    if (job.source === "ashby") {
      const data = await getJson<{ jobs: { id: string }[] }>(
        `https://api.ashbyhq.com/posting-api/job-board/${job.sourceCompany}`,
        15_000,
      );
      return data.jobs.some((j) => j.id === job.externalId);
    }
    return true;
  } catch {
    // Network trouble is not proof the job closed; let the adapter decide.
    return true;
  }
}
