import { describe, expect, it } from "vitest";
import { searchTerms } from "./search-terms";

describe("searchTerms", () => {
  it("puts the most shared terms first and ignores case and blanks", () => {
    expect(searchTerms([["Data Analyst", " "], ["data analyst", "Designer"], ["Designer", "Data Analyst"]], 4, 0)).toEqual([
      "Data Analyst",
      "Designer",
    ]);
  });

  it("rotates through every term over later rounds", () => {
    const lists = [["a", "b", "c"], ["d", "e"]];
    const seen = new Set([0, 1, 2].flatMap((r) => searchTerms(lists, 2, r)));
    expect(seen).toEqual(new Set(["a", "b", "c", "d", "e"]));
    expect(searchTerms(lists, 2, 0)).toHaveLength(2);
  });
});
