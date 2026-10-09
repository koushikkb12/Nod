export function timeAgo(date: Date | string | null | undefined, now = Date.now()) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const s = Math.round((now - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

export function salaryRange(min: number | null, max: number | null, currency: string | null) {
  if (!min && !max) return null;
  const sym = currency === "GBP" ? "£" : currency === "EUR" ? "€" : currency === "USD" ? "$" : "";
  const fmt = (n: number) => `${sym}${n >= 1000 ? `${Math.round(n / 1000)}k` : n}`;
  const body = [min, max].filter(Boolean).map((n) => fmt(n!)).join("–");
  return sym ? body : `${body} ${currency ?? ""}`.trim();
}

export function cleanCompany(name: string) {
  return name.replace(/\s*\(demo\)$/i, "");
}

export const SOURCE_LABEL: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  adzuna: "Adzuna",
  demo: "Demo ATS",
};

/** Plain-English explanations for the risk flags set during ingest. */
export const RISK_LABELS: Record<string, string> = {
  "scam-language": "Uses wording common in job scams, such as upfront fees or payment requests. Never pay to apply.",
  "hidden-instructions": "Contains text aimed at AI tools rather than people. Nod ignored it.",
  stale: "Posted more than 60 days ago, so it may already be filled.",
  "thin-description": "Very short description. Check the role is real before spending time on it.",
  "via-aggregator": "Listed through a job aggregator, not the employer's own careers site.",
};

export function riskLabel(flag: string) {
  return RISK_LABELS[flag] ?? flag;
}
