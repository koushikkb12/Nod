import "server-only";
import sanitizeHtml from "sanitize-html";
import type { FormQuestion, Workplace } from "@/lib/types";
import { extractSkills, normalise } from "@/lib/skills";

/** The one job shape every connector produces. */
export type NormalizedJob = {
  id: string;
  source: "greenhouse" | "lever" | "ashby" | "adzuna" | "demo";
  sourceCompany: string;
  externalId: string;
  company: string;
  title: string;
  location: string;
  workplace: Workplace | "unknown";
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  descriptionHtml: string;
  descriptionText: string;
  skills: string[];
  applyUrl: string;
  sourceUrl: string;
  questions: FormQuestion[] | null;
  postedAt: Date | null;
  dedupeKey: string;
  riskScore: number;
  riskFlags: string[];
  isDemo: boolean;
};

const MAX_HTML = 40_000;

export function decodeEntities(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

/**
 * Job ads are untrusted HTML. Keep basic formatting, drop scripts, styles,
 * iframes and attributes. Hidden text becomes visible, which is deliberate:
 * nothing in an ad should be invisible to the person applying.
 */
export function cleanHtml(html: string) {
  return sanitizeHtml(html.slice(0, MAX_HTML), {
    allowedTags: ["p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "h2", "h3", "h4", "a", "blockquote"],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      h1: "h2",
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }),
    },
  });
}

export function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<(br|\/p|\/li|\/h\d|\/div)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export function detectWorkplace(...hints: (string | null | undefined)[]): Workplace | "unknown" {
  const s = hints.filter(Boolean).join(" ").toLowerCase();
  if (/hybrid/.test(s)) return "hybrid";
  if (/remote|anywhere|distributed|work from home/.test(s)) return "remote";
  if (/on-?site|in[- ]office|onsite/.test(s)) return "onsite";
  return "unknown";
}

export function dedupeKey(company: string, title: string, location: string) {
  return [company, title, location.split(/[,;]/)[0]].map(normalise).join("|");
}

/* ------------------------------------------------------------------ */
/* Risk scoring: scams, ghost jobs, hidden instructions                */
/* ------------------------------------------------------------------ */

const SCAM_PATTERNS = [
  /\b(telegram|whatsapp)\b.{0,40}\b(interview|contact|apply|message)\b/i,
  /\b(upfront|registration|training|starter[- ]kit)\s+(fee|payment|cost)\b/i,
  /\bpay (for|your own) (training|equipment|background check)\b/i,
  /\b(wire|bitcoin|crypto|gift card)s?\b.{0,40}\b(transfer|payment|deposit)\b/i,
  /\bcheck (deposit|cashing)\b/i,
  /\bno experience (needed|required)\b.{0,60}\b(earn|£|\$)\s?\d/i,
];

export const INJECTION_PATTERNS = [
  /ignore (all |any )?(previous|prior|above|earlier) (instructions|prompts|directions)/i,
  /\b(ai|llm|gpt|chatgpt)\s+(assistants?|agents?|tools?|models?|systems?)\b[^.]{0,60}\b(must|should|are instructed to|please)\b[^.]{0,40}\b(say|state|claim|mention|include|write|add|respond|ignore)\b/i,
  /disregard (the|your|all) (system|previous|prior)/i,
  /\bsystem prompt\b/i,
  /\b(if|when) you are an? (ai|llm|language model|automated)\b/i,
  /\bnote to (ai|llm|automated|bots?)\b/i,
];

/** Inline styles that hide text from humans but not from scrapers. */
const HIDDEN_STYLE = /style\s*=\s*["'][^"']*(display\s*:\s*none|font-size\s*:\s*0|visibility\s*:\s*hidden|color\s*:\s*(#fff\b|#ffffff|white))[^"']*["']/i;

export function assessRisk(input: {
  rawHtml: string;
  text: string;
  postedAt: Date | null;
  source: NormalizedJob["source"];
}) {
  const flags: string[] = [];
  let score = 0;
  if (SCAM_PATTERNS.some((re) => re.test(input.text))) {
    flags.push("scam-language");
    score += 60;
  }
  if (HIDDEN_STYLE.test(input.rawHtml) || INJECTION_PATTERNS.some((re) => re.test(input.text))) {
    flags.push("hidden-instructions");
    score += 40;
  }
  if (input.postedAt) {
    const days = (Date.now() - input.postedAt.getTime()) / 86_400_000;
    if (days > 60) {
      flags.push("stale");
      score += 20;
    }
  }
  if (input.text.length < 400 && input.source !== "adzuna") {
    flags.push("thin-description");
    score += 15;
  }
  if (input.source === "adzuna") flags.push("via-aggregator");
  return { riskScore: Math.min(100, score), riskFlags: flags };
}

export const RISK_LABEL: Record<string, string> = {
  "scam-language": "Scam warning: asks for fees, chat apps or payments",
  "hidden-instructions": "Hidden text aimed at AI tools found in this ad",
  stale: "Posted over 60 days ago, may be a ghost job",
  "thin-description": "Very short description",
  "via-aggregator": "Listed via an aggregator, so check the employer's site",
};

/** Build the full normalized record from connector output. */
export function finalize(
  partial: Omit<NormalizedJob, "descriptionHtml" | "descriptionText" | "skills" | "dedupeKey" | "riskScore" | "riskFlags"> & {
    rawHtml: string;
    plainText?: string;
  },
): NormalizedJob {
  const { rawHtml, plainText, ...rest } = partial;
  const decoded = decodeEntities(rawHtml);
  const descriptionHtml = cleanHtml(decoded);
  const descriptionText = (plainText?.trim() || htmlToText(decoded)).slice(0, 20_000);
  const risk = assessRisk({ rawHtml: decoded, text: descriptionText, postedAt: rest.postedAt, source: rest.source });
  return {
    ...rest,
    descriptionHtml,
    descriptionText,
    skills: extractSkills(`${rest.title}\n${descriptionText}`),
    dedupeKey: dedupeKey(rest.company, rest.title, rest.location),
    ...risk,
  };
}
