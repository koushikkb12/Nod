import { describe, expect, it } from "vitest";
import { keywordPattern, regionsOf, scoreJob, type JobRow, type Prefs, type ScoreContext } from "./rules";

const job = (over: Partial<JobRow> = {}): JobRow => ({
  id: "j1",
  title: "Data Analyst",
  company: "Acme",
  location: "London, UK",
  workplace: "hybrid",
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  skills: ["SQL", "Python", "Tableau"],
  postedAt: new Date(),
  riskFlags: [],
  sponsorMatch: null,
  isDemo: false,
  source: "greenhouse",
  ...over,
});

const prefs = (over: Partial<Prefs> = {}): Prefs => ({
  userId: "u1",
  titles: ["Data Analyst"],
  locations: ["London"],
  workplace: [],
  seniority: [],
  minSalary: null,
  salaryCurrency: "GBP",
  keywords: [],
  excludeCompanies: [],
  needsSponsorship: null,
  rightToWork: "",
  noticePeriod: "",
  willingToRelocate: false,
  dailyCap: 10,
  perCompanyMonthlyCap: 2,
  agentPaused: false,
  updatedAt: new Date(),
  ...over,
});

const ctx = (over: Partial<ScoreContext> = {}): ScoreContext => ({
  prefs: prefs(),
  userSkills: new Set(["SQL", "Python"]),
  userRegions: regionsOf("London"),
  excluded: new Set(),
  ...over,
});

describe("regionsOf", () => {
  it("maps places to regions", () => {
    expect(regionsOf("London, UK").has("uk")).toBe(true);
    expect(regionsOf("Remote - Worldwide").has("global")).toBe(true);
    expect(regionsOf("Somewhere").size).toBe(0);
  });
});

describe("scoreJob", () => {
  it("explains matched and missing skills", () => {
    const s = scoreJob(job(), ctx())!;
    expect(s.matchedSkills).toEqual(["SQL", "Python"]);
    expect(s.missingSkills).toEqual(["Tableau"]);
    expect(s.reasons.some((r) => r.startsWith("Title matches"))).toBe(true);
    expect(s.score).toBeGreaterThan(60);
  });

  it("drops excluded companies", () => {
    expect(scoreJob(job(), ctx({ excluded: new Set(["acme"]) }))).toBeNull();
  });

  it("drops jobs outside the user's places", () => {
    expect(scoreJob(job({ location: "Berlin, Germany" }), ctx())).toBeNull();
  });

  it("applies the salary floor in the same currency", () => {
    const c = ctx({ prefs: prefs({ minSalary: 60_000 }) });
    expect(scoreJob(job({ salaryMax: 45_000, salaryCurrency: "GBP" }), c)).toBeNull();
    expect(scoreJob(job({ salaryMax: 45_000, salaryCurrency: "USD" }), c)).not.toBeNull();
  });

  it("caps the score when the title doesn't fit", () => {
    const s = scoreJob(job({ title: "Office Manager" }), ctx())!;
    expect(s.score).toBeLessThanOrEqual(45);
  });

  it("halves the score for scam wording", () => {
    const clean = scoreJob(job(), ctx())!;
    const scam = scoreJob(job({ riskFlags: ["scam-language"] }), ctx())!;
    expect(scam.score).toBeLessThan(clean.score);
  });

  it("boosts and explains preference keywords", () => {
    const base = scoreJob(job({ title: "Analyst" }), ctx())!;
    const hits = new Map([["j1", ["climate", "fintech", "health"]]]);
    const boosted = scoreJob(job({ title: "Analyst" }), ctx({ keywordHits: hits }))!;
    expect(boosted.score).toBe(Math.min(100, base.score + 10));
    expect(boosted.reasons).toContain("Mentions climate, fintech, health");
  });
});

describe("keywordPattern", () => {
  it("builds whole-word patterns and escapes regex characters", () => {
    expect(keywordPattern("climate")).toBe("\\mclimate\\M");
    expect(keywordPattern("c++")).toBe("\\mc\\+\\+");
    expect(keywordPattern("machine  learning")).toBe("\\mmachine\\s+learning\\M");
  });
});
