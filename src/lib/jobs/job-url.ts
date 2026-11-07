export type JobRef = { source: "greenhouse" | "lever" | "ashby"; token: string; jobId: string };

const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Recognise a public Greenhouse, Lever or Ashby job link. */
export function parseJobUrl(input: string): JobRef | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io" || host === "job-boards.eu.greenhouse.io") {
    // Embedded form: /embed/job_app?for=<board>&token=<job id>
    if (parts[0] === "embed") {
      const token = url.searchParams.get("for") ?? "";
      const jobId = url.searchParams.get("token") ?? "";
      return SLUG.test(token) && /^\d+$/.test(jobId) ? { source: "greenhouse", token, jobId } : null;
    }
    const [token, jobs, jobId] = parts;
    return token && jobs === "jobs" && /^\d+$/.test(jobId ?? "") && SLUG.test(token) ? { source: "greenhouse", token, jobId } : null;
  }

  if (host === "jobs.lever.co") {
    const [token, jobId] = parts;
    return token && SLUG.test(token) && UUID.test(jobId ?? "") ? { source: "lever", token, jobId } : null;
  }

  if (host === "jobs.ashbyhq.com") {
    const [token, jobId] = parts;
    return token && SLUG.test(decodeURIComponent(token)) && UUID.test(jobId ?? "")
      ? { source: "ashby", token: decodeURIComponent(token), jobId }
      : null;
  }
  return null;
}
