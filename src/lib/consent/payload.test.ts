import { describe, expect, it } from "vitest";
import type { Draft } from "@/lib/types";
import { approvalBlockers, buildPayload, payloadHash, shortHash } from "./payload";

const draft = (over: Partial<Draft> = {}): Draft => ({
  generatedBy: "rules",
  generatedAt: "2026-01-01T00:00:00.000Z",
  summary: [{ id: "s1", text: "Analyst with SQL experience.", factIds: ["f1"], kind: "claim", status: "traced" }],
  roles: [],
  skills: ["SQL"],
  education: [],
  coverLetter: [
    { id: "c1", text: "Dear team,", factIds: [], kind: "framing", status: "traced" },
    { id: "c2", text: "Blocked claim.", factIds: [], kind: "claim", status: "blocked" },
  ],
  answers: [
    { questionId: "cover", label: "Cover letter", required: false, type: "textarea", value: "", source: "facts", needsUser: false },
    { questionId: "rtw", label: "Right to work", required: true, type: "text", value: "Yes", source: "user", needsUser: false },
  ],
  injectionWarnings: [],
  ...over,
});

const profile = { fullName: "Alex Morgan", email: "alex@example.com", phone: "", location: "London", links: [] };
const input = (d = draft()) => ({
  applicationId: "app_1",
  mode: "manual" as const,
  draft: d,
  job: { id: "j1", company: "Acme", title: "Analyst", applyUrl: "https://example.com" },
  profile,
  cvFile: null,
});

describe("buildPayload", () => {
  it("only includes traced sentences and fills the cover letter answer", () => {
    const p = buildPayload(input());
    expect(p.coverLetter).toEqual(["Dear team,"]);
    expect(p.answers.find((a) => a.id === "cover")?.value).toBe("Dear team,");
  });

  it("hashes deterministically and changes with content", () => {
    const a = payloadHash(buildPayload(input()));
    expect(payloadHash(buildPayload(input()))).toBe(a);
    expect(payloadHash(buildPayload(input(draft({ skills: ["SQL", "Python"] }))))).not.toBe(a);
    expect(shortHash(a)).toMatch(/^[0-9a-f]{4} [0-9a-f]{4}$/);
  });
});

describe("approvalBlockers", () => {
  it("is empty when ready", () => {
    expect(approvalBlockers(draft(), profile)).toEqual([]);
  });

  it("lists missing profile fields and unanswered questions", () => {
    const d = draft({ answers: [{ questionId: "x", label: "Salary", required: true, type: "text", value: "", source: "unknown", needsUser: true }] });
    expect(approvalBlockers(d, { ...profile, email: "" })).toEqual(["Add your email in your profile.", "Answer “Salary”."]);
  });
});
