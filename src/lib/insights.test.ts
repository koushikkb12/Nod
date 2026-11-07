import { describe, expect, it } from "vitest";
import { funnel, skillGaps, weeklyCounts } from "./insights";

describe("skillGaps", () => {
  it("ranks missing skills by how many matches want them", () => {
    const gaps = skillGaps([
      { missingSkills: ["dbt", "Airflow", "Spark"] },
      { missingSkills: ["dbt"] },
      { missingSkills: ["dbt", "Airflow"] },
      { missingSkills: ["Looker"] },
    ]);
    expect(gaps[0]).toEqual({ skill: "dbt", jobs: 3, closeCalls: 2 });
    expect(gaps[1]).toEqual({ skill: "Airflow", jobs: 2, closeCalls: 1 });
    expect(gaps.map((g) => g.skill)).toEqual(["dbt", "Airflow", "Looker", "Spark"]);
  });

  it("respects the limit", () => {
    expect(skillGaps([{ missingSkills: ["a", "b", "c"] }], 2)).toHaveLength(2);
  });
});

describe("funnel", () => {
  it("counts stages and rates, ignoring withdrawn", () => {
    const f = funnel(["drafted", "submitted", "submitted", "interviewing", "offer", "rejected", "withdrawn"]);
    expect(f.stages.map((s) => s.count)).toEqual([6, 5, 2, 1]);
    expect(f.responseRate).toBe(60);
    expect(f.interviewRate).toBe(40);
  });

  it("has no rates before anything is sent", () => {
    expect(funnel(["drafted"]).responseRate).toBeNull();
  });
});

describe("weeklyCounts", () => {
  it("buckets dates into weeks, oldest first", () => {
    const now = new Date("2026-03-01T12:00:00Z");
    const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
    expect(weeklyCounts([daysAgo(0), daysAgo(1), daysAgo(8), daysAgo(100)], 4, now)).toEqual([0, 0, 1, 2]);
  });
});
