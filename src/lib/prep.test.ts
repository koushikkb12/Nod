import { describe, expect, it } from "vitest";
import { buildPrep, type PrepFact } from "./prep";

const facts: PrepFact[] = [
  { id: "r1", kind: "role", text: "Analyst at Acme", skills: [], role: "Data Analyst", org: "Acme" },
  { id: "a1", kind: "achievement", text: "Built SQL dashboards used by 40 managers", skills: ["SQL"], role: null, org: null },
  { id: "a2", kind: "achievement", text: "Automated reporting in Python", skills: [], role: null, org: null },
];

describe("buildPrep", () => {
  const prep = buildPrep(facts, { title: "Senior Analyst", company: "Monzo", skills: ["SQL", "Python", "dbt"] });

  it("uses only confirmed facts, word for word, as talking points", () => {
    const byId = new Map(facts.map((f) => [f.id, f]));
    for (const q of prep.questions)
      for (const p of q.points) {
        const f = byId.get(p.factId)!;
        expect(f).toBeDefined();
        if (f.kind === "achievement") expect(p.text).toBe(f.text);
      }
  });

  it("asks about matched skills with the facts that show them", () => {
    const sql = prep.questions.find((q) => q.question.includes("used SQL"))!;
    expect(sql.points.map((p) => p.factId)).toEqual(["a1"]);
    const py = prep.questions.find((q) => q.question.includes("used Python"))!;
    expect(py.points.map((p) => p.factId)).toEqual(["a2"]);
  });

  it("flags gaps without inventing answers", () => {
    const dbt = prep.questions.find((q) => q.question.includes("dbt"))!;
    expect(dbt.points).toEqual([]);
    expect(dbt.hint).toMatch(/isn't in your confirmed facts/);
  });

  it("includes background, measurable win and questions to ask", () => {
    expect(prep.questions[0].points[0].text).toBe("Data Analyst at Acme");
    expect(prep.questions.some((q) => q.question.startsWith("What's an achievement"))).toBe(true);
    expect(prep.askThem[0]).toContain("Senior Analyst");
  });
});
