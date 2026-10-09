/**
 * Generates a realistic sample CV (PDF + text) for trying Nod end to end.
 *   npm run sample-cv   ->  samples/alex-morgan-cv.pdf, samples/alex-morgan-cv.txt
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";

const CV = {
  name: "Alex Morgan",
  contact: "alex.morgan@example.com · 07700 900123 · London, UK · linkedin.com/in/alexmorgan-dev · github.com/alexmorgan",
  summary:
    "Software engineer with 5 years of experience building Python and TypeScript services for logistics and e-commerce. I enjoy making systems faster and easier to run.",
  roles: [
    {
      title: "Software Engineer",
      org: "Parcelwise",
      dates: "Mar 2021 – Present",
      bullets: [
        "Built Python and TypeScript services that schedule deliveries for 1,200 drivers across the UK.",
        "Cut API response times by 38% by redesigning PostgreSQL indexes and adding Redis caching.",
        "Moved 14 services from virtual machines to Docker containers on AWS, reducing hosting costs by 22%.",
        "Introduced automated testing with pytest and GitHub Actions, raising test coverage from 41% to 83%.",
        "Mentored 3 junior developers through code reviews and pairing.",
      ],
    },
    {
      title: "Junior Developer",
      org: "Brightlane Digital",
      dates: "Sep 2019 – Feb 2021",
      bullets: [
        "Developed React and Node.js features for 6 client e-commerce sites.",
        "Built a product search API in Django that handled 50,000 searches per day.",
        "Fixed accessibility issues to meet WCAG 2.1 AA on 4 client websites.",
      ],
    },
  ],
  skills: "Python, TypeScript, JavaScript, Django, FastAPI, Node.js, React, PostgreSQL, Redis, Docker, AWS, Git, GitHub Actions, pytest, REST APIs",
  education: ["BSc Computer Science, University of Leeds, 2016 – 2019 (2:1)"],
  certifications: ["AWS Certified Developer – Associate (2022)"],
};

function html() {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Georgia,serif;color:#15161a;margin:48px 56px;font-size:11pt;line-height:1.45}
    h1{font-size:24pt;margin:0;font-weight:normal}
    .c{color:#555;font-size:9.5pt;margin:4px 0 18px}
    h2{font-family:Helvetica,Arial,sans-serif;font-size:9pt;letter-spacing:.14em;text-transform:uppercase;border-bottom:1px solid #ccc;padding-bottom:3px;margin:18px 0 8px}
    .r{display:flex;justify-content:space-between;font-weight:bold;margin-top:8px}
    .d{font-weight:normal;color:#555}
    ul{margin:4px 0 0;padding-left:18px} li{margin:2px 0}
  </style></head><body>
  <h1>${esc(CV.name)}</h1><div class="c">${esc(CV.contact)}</div>
  <h2>Profile</h2><p>${esc(CV.summary)}</p>
  <h2>Experience</h2>
  ${CV.roles
    .map(
      (r) => `<div class="r"><span>${esc(r.title)}, ${esc(r.org)}</span><span class="d">${esc(r.dates)}</span></div>
      <ul>${r.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`,
    )
    .join("")}
  <h2>Skills</h2><p>${esc(CV.skills)}</p>
  <h2>Education</h2>${CV.education.map((e) => `<p>${esc(e)}</p>`).join("")}
  <h2>Certifications</h2>${CV.certifications.map((e) => `<p>${esc(e)}</p>`).join("")}
  </body></html>`;
}

function text() {
  return [
    CV.name,
    CV.contact,
    "",
    "PROFILE",
    CV.summary,
    "",
    "EXPERIENCE",
    ...CV.roles.flatMap((r) => [`${r.title}, ${r.org} | ${r.dates}`, ...r.bullets.map((b) => `• ${b}`), ""]),
    "SKILLS",
    CV.skills,
    "",
    "EDUCATION",
    ...CV.education,
    "",
    "CERTIFICATIONS",
    ...CV.certifications,
    "",
  ].join("\n");
}

async function main() {
  const out = path.resolve(process.cwd(), "samples");
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "alex-morgan-cv.txt"), text());
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html(), { waitUntil: "load" });
  writeFileSync(path.join(out, "alex-morgan-cv.pdf"), await page.pdf({ format: "A4", printBackground: true }));
  await browser.close();
  console.log(`Wrote ${path.join(out, "alex-morgan-cv.pdf")} and .txt`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
