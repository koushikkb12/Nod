import "server-only";
import { z } from "zod";
import { generateStructured, hasAI } from "@/lib/ai";
import { extractSkills } from "@/lib/skills";

export type ParsedCv = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  summary: string;
  links: { label: string; url: string }[];
  roles: {
    role: string;
    org: string;
    startDate: string;
    endDate: string;
    achievements: string[];
  }[];
  education: string[];
  certifications: string[];
  projects: string[];
  skills: string[];
};

const CvSchema = z.object({
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  headline: z.string().describe("Current or most recent job title, as written"),
  summary: z.string().describe("The CV's own profile/summary text, verbatim; empty if none"),
  links: z.array(z.object({ label: z.string(), url: z.string() })),
  roles: z.array(
    z.object({
      role: z.string(),
      org: z.string(),
      startDate: z.string(),
      endDate: z.string().describe('"Present" if current'),
      achievements: z
        .array(z.string())
        .describe("Each bullet point as written, one fact per item"),
    }),
  ),
  education: z.array(z.string()),
  certifications: z.array(z.string()),
  projects: z.array(z.string()),
  skills: z.array(z.string()),
});

const SYSTEM = `You convert CVs into structured data for a fact bank. Copy facts exactly as the CV states them: keep every number, date, name and claim unchanged. Never add, infer, embellish or merge facts. Split multi-claim bullets only where the CV itself separates them. Leave fields empty when the CV does not state them.`;

export async function parseCv(text: string): Promise<{ cv: ParsedCv; by: "ai" | "rules"; note?: string }> {
  if (hasAI()) {
    try {
      const { data } = await generateStructured({
        schema: CvSchema,
        system: SYSTEM,
        prompt: `CV text:\n"""\n${text.slice(0, 30000)}\n"""`,
      });
      return { cv: data, by: "ai" };
    } catch (err) {
      console.error("[nod] AI CV parsing failed, using rules", err);
      return { cv: parseCvRules(text), by: "rules", note: "AI parsing failed, so Nod used its rule-based parser." };
    }
  }
  return { cv: parseCvRules(text), by: "rules" };
}

/* ------------------------------------------------------------------ */
/* Rule-based parser                                                   */
/* ------------------------------------------------------------------ */

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE = `(?:${MONTH}\\s+)?(?:\\d{1,2}[/.-])?(?:19|20)\\d{2}`;
const DATE_RANGE = new RegExp(
  `(${DATE})\\s*(?:-|–|—|to|until)\\s*(${DATE}|present|current|now|today)`,
  "i",
);

const HEADINGS: [RegExp, Section][] = [
  [/^(professional\s+)?(summary|profile|about( me)?|personal statement|objective)$/i, "summary"],
  [/^(work\s+|professional\s+|relevant\s+)?(experience|employment( history)?|career history|work history)$/i, "experience"],
  [/^(education|qualifications|academic background)$/i, "education"],
  [/^(technical\s+|core\s+|key\s+)?skills( & tools| and tools)?$|^(tools|technologies|tech stack)$/i, "skills"],
  [/^(projects|selected projects|personal projects)$/i, "projects"],
  [/^(certifications?|certificates|licen[cs]es)$/i, "certifications"],
  [/^(interests|hobbies|references|languages|volunteering)$/i, "other"],
];

type Section = "header" | "summary" | "experience" | "education" | "skills" | "projects" | "certifications" | "other";

const BULLET = /^[•·▪●◦\-*–]\s*/;

/**
 * PDF exports of styled CVs often letter-space headings ("P R O F I L E"),
 * sometimes with kerning pairs left together ("E D U C AT I O N").
 */
function unspace(line: string) {
  const tokens = line.split(" ");
  if (tokens.length >= 4 && tokens.every((t) => /^[A-Za-z&]{1,2}$/.test(t))) return tokens.join("");
  return line;
}

const COUNTRY = "UK|United Kingdom|England|Scotland|Wales|Northern Ireland|Ireland|USA|US|United States|Canada|Germany|France|Netherlands|Spain|India|Australia";

export function parseCvRules(text: string): ParsedCv {
  // Re-join words a PDF wrapped at a hyphen ("e-\ncommerce").
  const lines = text
    .replace(/-\n(?=[a-z])/g, "-")
    .split("\n")
    .map((l) => unspace(l.trim()))
    .filter(Boolean);

  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? "";
  const phone =
    text.match(/(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,5}\)?[\s-]?)\d{3,4}[\s-]?\d{3,4}/)?.[0]?.trim() ?? "";
  const links: ParsedCv["links"] = [];
  for (const m of text.matchAll(/((?:https?:\/\/)?(?:www\.)?(linkedin\.com|github\.com|gitlab\.com|behance\.net|dribbble\.com)\/[^\s,|)]+|https?:\/\/[^\s,|)]+)/gi)) {
    const url = m[1].startsWith("http") ? m[1] : `https://${m[1]}`;
    const host = url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
    const label = host.includes("linkedin") ? "LinkedIn" : host.includes("github") ? "GitHub" : "Website";
    if (!links.some((l) => l.url === url)) links.push({ label, url });
  }

  const sections: Record<Section, string[]> = {
    header: [], summary: [], experience: [], education: [], skills: [], projects: [], certifications: [], other: [],
  };
  let current: Section = "header";
  for (const line of lines) {
    const bare = line.replace(/[:#*_]/g, "").trim();
    const heading = bare.length < 40 ? HEADINGS.find(([re]) => re.test(bare)) : undefined;
    if (heading) {
      current = heading[1];
      continue;
    }
    sections[current].push(line);
  }

  const header = sections.header;
  const fullName =
    header.find(
      (l) => /^[A-Za-zÀ-ÿ'’.-]+(\s+[A-Za-zÀ-ÿ'’.-]+){1,3}$/.test(l) && !l.includes("@"),
    ) ?? "";
  const contactLine = header.find((l) => l.includes("@") || /\d{4}/.test(l)) ?? "";
  const location =
    contactLine.match(new RegExp(`\\b([A-Z][a-zA-Z]+(?:[ -][A-Z][a-zA-Z]+)?),\\s*(${COUNTRY})\\b`))?.[0] ??
    contactLine
      .split(/[|•·,]/)
      .map((s) => s.trim())
      .find((s) => /^[A-Z][a-zA-Z\s]+$/.test(s) && !s.includes("@") && s !== fullName) ?? "";
  const roles = parseRoles(sections.experience);
  // A short line under the name is the CV's own headline; otherwise use the
  // most recent job title.
  const headline =
    header.find((l) => l !== fullName && l !== contactLine && !l.includes("@") && l.length < 80 && !/\d{4}/.test(l)) ??
    roles[0]?.role ??
    "";

  // If there was no explicit summary heading, use the longest header paragraph.
  const summary =
    sections.summary.join(" ") ||
    header.filter((l) => l.length > 120).join(" ");

  return {
    fullName,
    email,
    phone: phone.length >= 7 ? phone : "",
    location,
    headline,
    summary,
    links,
    roles,
    education: mergeEntries(sections.education),
    certifications: mergeEntries(sections.certifications),
    projects: parseBullets(sections.projects),
    skills: parseSkills(sections.skills, text),
  };
}

function parseRoles(lines: string[]): ParsedCv["roles"] {
  const roles: ParsedCv["roles"] = [];
  let pendingTitle = "";
  const ROLE_SPLIT = /\s+[|•·@–—-]\s+|,\s+|\s+at\s+/;
  const partsBesideDate = (line: string, range: RegExpMatchArray) =>
    line
      .replace(range[0], "")
      .replace(/[()]/g, "")
      .split(ROLE_SPLIT)
      .map((s) => s.trim())
      .filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const range = line.match(DATE_RANGE);
    if (range && !BULLET.test(line)) {
      const rest = partsBesideDate(line, range);
      let role = rest[0] ?? "";
      let org = rest[1] ?? "";
      if (!role && pendingTitle) {
        const parts = pendingTitle.split(ROLE_SPLIT);
        role = parts[0] ?? "";
        org = parts[1] ?? "";
      } else if (!org && pendingTitle) {
        org = role;
        role = pendingTitle;
      }
      roles.push({ role, org, startDate: range[1], endDate: range[2], achievements: [] });
      pendingTitle = "";
      continue;
    }
    const current = roles[roles.length - 1];
    if (BULLET.test(line)) {
      if (current) current.achievements.push(line.replace(BULLET, ""));
      continue;
    }
    // A line followed by a bare date line ("Mar 2021 – Present", or just an
    // employer and dates) is that role's title.
    const next = lines[i + 1] ?? "";
    const nextRange = next.match(DATE_RANGE);
    if (nextRange && !BULLET.test(next) && line.length < 90 && partsBesideDate(next, nextRange).length < 2) {
      pendingTitle = line;
      continue;
    }
    if (current && current.achievements.length && /^[a-z(]/.test(line)) {
      current.achievements[current.achievements.length - 1] += ` ${line}`;
    } else if (current && line.length > 40) {
      current.achievements.push(line);
    }
  }
  return roles;
}

function parseBullets(lines: string[]) {
  const out: string[] = [];
  for (const line of lines) {
    if (BULLET.test(line) || !out.length) out.push(line.replace(BULLET, ""));
    else if (/^[a-z(]/.test(line)) out[out.length - 1] += ` ${line}`;
    else out.push(line);
  }
  return out.filter((l) => l.length > 3);
}

function mergeEntries(lines: string[]) {
  // Group short consecutive lines ("BSc Economics", "University of Leeds, 2019").
  const out: string[] = [];
  let buf = "";
  for (const line of lines) {
    const clean = line.replace(BULLET, "");
    if (!buf) buf = clean;
    else if (buf.length + clean.length < 140 && !BULLET.test(line)) buf += ` · ${clean}`;
    else {
      out.push(buf);
      buf = clean;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function parseSkills(lines: string[], fullText: string) {
  const listed = lines
    .flatMap((l) => l.replace(/^[^:]{0,30}:\s*/, "").split(/[,;|•·]/))
    .map((s) => s.replace(BULLET, "").trim())
    .filter((s) => s.length > 1 && s.length < 40);
  const known = extractSkills(fullText);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...listed, ...known]) {
    const k = s.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}
