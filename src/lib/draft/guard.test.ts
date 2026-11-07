import { describe, expect, it } from "vitest";
import type { Sentence } from "@/lib/types";
import { checkSentence, included, type FactLite } from "./guard";

const fact = (over: Partial<FactLite> = {}): FactLite => ({
  id: "f1",
  text: "Cut report run time by 40% using Python and SQL",
  confirmed: true,
  startDate: "2021",
  endDate: "2023",
  org: "Acme",
  role: "Data Analyst",
  ...over,
});

const facts = (...list: FactLite[]) => new Map(list.map((f) => [f.id, f]));
const ctx = { jobTitle: "Senior Data Analyst", company: "Globex" };
const claim = (text: string, factIds = ["f1"]): Sentence => ({ id: "s1", text, factIds, kind: "claim", status: "traced" });

describe("checkSentence", () => {
  it("passes a claim backed by a confirmed fact", () => {
    expect(checkSentence(claim("Cut report run time by 40% with Python."), facts(fact()), ctx).status).toBe("traced");
  });

  it("blocks a claim with no citation", () => {
    const r = checkSentence(claim("I am great.", []), facts(fact()), ctx);
    expect(r.status).toBe("blocked");
  });

  it("blocks claims citing unconfirmed facts", () => {
    const r = checkSentence(claim("Cut report run time by 40%."), facts(fact({ confirmed: false })), ctx);
    expect(r.reason).toMatch(/haven't confirmed/);
  });

  it("blocks skills that aren't in the cited fact", () => {
    const r = checkSentence(claim("Built dashboards in Tableau."), facts(fact()), ctx);
    expect(r.status).toBe("blocked");
    expect(r.reason).toMatch(/Tableau/);
  });

  it("blocks numbers that aren't in the cited fact", () => {
    const r = checkSentence(claim("Cut report run time by 90%."), facts(fact()), ctx);
    expect(r.reason).toMatch(/90%/);
  });

  it("lets framing sentences mention the job title but not new skills", () => {
    const framing: Sentence = { id: "s2", text: "I'm applying for the Senior Data Analyst role at Globex.", factIds: [], kind: "framing", status: "traced" };
    expect(checkSentence(framing, facts(), ctx).status).toBe("traced");
    expect(checkSentence({ ...framing, text: "I know Kubernetes." }, facts(), ctx).status).toBe("blocked");
  });

  it("treats removed sentences as traced and excludes them", () => {
    const removed = { ...claim("Invented 99 things."), removed: true };
    expect(checkSentence(removed, facts(), ctx).status).toBe("traced");
    expect(included([removed])).toEqual([]);
  });
});
