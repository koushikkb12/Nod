import { describe, expect, it } from "vitest";
import { followUpDue, toIcs } from "./tracking";

const now = new Date("2026-03-20T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("followUpDue", () => {
  it("suggests a follow-up after ten quiet days at Applied", () => {
    expect(followUpDue({ status: "submitted", followUpAt: null, updatedAt: daysAgo(11) }, now)).toBe(true);
    expect(followUpDue({ status: "submitted", followUpAt: null, updatedAt: daysAgo(3) }, now)).toBe(false);
  });

  it("uses the user's reminder date when set", () => {
    expect(followUpDue({ status: "submitted", followUpAt: daysAgo(-2), updatedAt: daysAgo(30) }, now)).toBe(false);
    expect(followUpDue({ status: "interviewing", followUpAt: daysAgo(1), updatedAt: daysAgo(1) }, now)).toBe(true);
  });

  it("ignores drafts and closed applications", () => {
    expect(followUpDue({ status: "drafted", followUpAt: daysAgo(1), updatedAt: daysAgo(30) }, now)).toBe(false);
    expect(followUpDue({ status: "rejected", followUpAt: daysAgo(1), updatedAt: daysAgo(30) }, now)).toBe(false);
  });
});

describe("toIcs", () => {
  it("writes a valid VEVENT in UTC with escaped text", () => {
    const ics = toIcs(
      [{ id: "iv_1", title: "Interview: Analyst, Acme; round 1", startsAt: new Date("2026-04-01T09:30:00Z"), durationMinutes: 45, location: "Zoom" }],
      now,
    );
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("UID:iv_1@nod\r\n");
    expect(ics).toContain("DTSTART:20260401T093000Z\r\n");
    expect(ics).toContain("DTEND:20260401T101500Z\r\n");
    expect(ics).toContain("SUMMARY:Interview: Analyst\\, Acme\\; round 1\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("folds long lines", () => {
    const ics = toIcs([{ id: "x", title: "a".repeat(200), startsAt: now, durationMinutes: 60, location: "" }], now);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});
