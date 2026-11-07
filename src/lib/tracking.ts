import type { AppStatus } from "@/lib/types";

/** Days after applying with no news before Nod suggests a follow-up. */
export const FOLLOW_UP_AFTER_DAYS = 10;

export type FollowUpInput = { status: AppStatus; followUpAt: Date | null; updatedAt: Date };

/**
 * Should the user chase this application? Yes when the reminder they set has
 * passed, or, if they set none, when an application has sat at "Applied" for
 * {@link FOLLOW_UP_AFTER_DAYS} days.
 */
export function followUpDue(app: FollowUpInput, now = new Date()) {
  if (!["submitted", "interviewing"].includes(app.status)) return false;
  if (app.followUpAt) return app.followUpAt.getTime() <= now.getTime();
  return app.status === "submitted" && now.getTime() - app.updatedAt.getTime() >= FOLLOW_UP_AFTER_DAYS * 86_400_000;
}

export type CalendarEvent = {
  id: string;
  title: string;
  startsAt: Date;
  durationMinutes: number;
  location: string;
  description?: string;
};

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Escape a text value per RFC 5545 §3.3.11. */
const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");

/** Fold lines longer than 75 octets, as RFC 5545 §3.1 requires. */
function fold(line: string) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      size = 0;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** An iCalendar file with one VEVENT per interview. */
export function toIcs(list: CalendarEvent[], now = new Date()) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nod//Interviews//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of list) {
    const end = new Date(e.startsAt.getTime() + e.durationMinutes * 60_000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@nod`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(e.startsAt)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${esc(e.title)}`,
      ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
      ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
