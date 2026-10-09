import "server-only";
import type { Browser } from "playwright";
import type { ApplicationPayload } from "@/lib/consent/payload";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";

const g = globalThis as unknown as { __nodBrowser?: Promise<Browser> };

/** One shared headless Chromium per server process. */
export async function browser(): Promise<Browser> {
  if (g.__nodBrowser) {
    const b = await g.__nodBrowser.catch(() => null);
    if (b?.isConnected()) return b;
  }
  g.__nodBrowser = import("playwright").then(({ chromium }) => chromium.launch({ headless: true }));
  return g.__nodBrowser;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function cvHtml(p: Pick<ApplicationPayload, "applicant" | "cv">) {
  const contact = [p.applicant.email, p.applicant.phone, p.applicant.location, ...p.applicant.links.map((l) => l.url.replace(/^https?:\/\/(www\.)?/, ""))]
    .filter(Boolean)
    .map(esc)
    .join("  ·  ");
  const roles = p.cv.roles
    .map((r) => {
      const [title, ...rest] = r.heading.split(" · ");
      return `<section class="role"><div class="rh"><strong>${esc(title ?? "")}</strong><span>${esc(rest.join(" · "))}</span></div>${
        r.bullets.length ? `<ul>${r.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""
      }</section>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 16mm 16mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #15161a; font-size: 10.2pt; line-height: 1.45; margin: 0; }
  h1 { font-family: Georgia, "Times New Roman", serif; font-weight: 400; font-size: 25pt; margin: 0 0 2pt; letter-spacing: -0.01em; }
  .contact { color: #555; font-size: 9pt; margin-bottom: 12pt; }
  h2 { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .12em; color: #6b6b6b; border-bottom: 1px solid #ddd; padding-bottom: 3pt; margin: 14pt 0 6pt; }
  p { margin: 0 0 4pt; }
  .role { margin-bottom: 8pt; break-inside: avoid; }
  .rh { display: flex; justify-content: space-between; gap: 12pt; }
  .rh span { color: #555; font-size: 9pt; white-space: nowrap; }
  ul { margin: 3pt 0 0 0; padding-left: 13pt; }
  li { margin-bottom: 2pt; }
  .skills { color: #333; }
</style></head><body>
  <h1>${esc(p.applicant.fullName)}</h1>
  <div class="contact">${contact}</div>
  ${p.cv.summary.length ? `<h2>Profile</h2><p>${p.cv.summary.map(esc).join(" ")}</p>` : ""}
  ${roles ? `<h2>Experience</h2>${roles}` : ""}
  ${p.cv.skills.length ? `<h2>Skills</h2><p class="skills">${p.cv.skills.map(esc).join(" · ")}</p>` : ""}
  ${p.cv.education.length ? `<h2>Education</h2>${p.cv.education.map((e) => `<p>${esc(e)}</p>`).join("")}` : ""}
</body></html>`;
}

/** Render the tailored CV to an A4 PDF. */
export async function renderCvPdf(p: Pick<ApplicationPayload, "applicant" | "cv">): Promise<Buffer> {
  const b = await browser();
  const page = await b.newPage();
  try {
    await page.setContent(cvHtml(p), { waitUntil: "load" });
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await page.close();
  }
}
