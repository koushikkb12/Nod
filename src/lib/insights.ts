import type { AppStatus } from "@/lib/types";

export type GapInput = { missingSkills: string[] };

export type SkillGap = {
  skill: string;
  /** Matches whose ad asks for this skill and you don't list it. */
  jobs: number;
  /** Matches where this is one of your last two missing skills. */
  closeCalls: number;
};

/** Skills your matches ask for most that aren't in your confirmed facts. */
export function skillGaps(list: GapInput[], limit = 8): SkillGap[] {
  const by = new Map<string, SkillGap>();
  for (const m of list) {
    for (const skill of new Set(m.missingSkills)) {
      const g = by.get(skill) ?? { skill, jobs: 0, closeCalls: 0 };
      g.jobs += 1;
      if (m.missingSkills.length <= 2) g.closeCalls += 1;
      by.set(skill, g);
    }
  }
  return [...by.values()]
    .sort((a, b) => b.jobs - a.jobs || b.closeCalls - a.closeCalls || a.skill.localeCompare(b.skill))
    .slice(0, limit);
}

const APPLIED: AppStatus[] = ["submitted", "interviewing", "offer", "rejected"];

export type Funnel = {
  stages: { label: string; count: number }[];
  responseRate: number | null;
  interviewRate: number | null;
};

/** How far applications got, ignoring ones you withdrew. */
export function funnel(statuses: AppStatus[]): Funnel {
  const live = statuses.filter((s) => s !== "withdrawn");
  const applied = live.filter((s) => APPLIED.includes(s)).length;
  const responded = live.filter((s) => s === "interviewing" || s === "offer" || s === "rejected").length;
  const interviews = live.filter((s) => s === "interviewing" || s === "offer").length;
  const offers = live.filter((s) => s === "offer").length;
  const rate = (n: number) => (applied ? Math.round((100 * n) / applied) : null);
  return {
    stages: [
      { label: "Drafted", count: live.length },
      { label: "Applied", count: applied },
      { label: "Interviewing", count: interviews },
      { label: "Offer", count: offers },
    ],
    responseRate: rate(responded),
    interviewRate: rate(interviews),
  };
}

/** Applications started in each of the last `weeks` weeks, oldest first. */
export function weeklyCounts(dates: Date[], weeks = 8, now = new Date()) {
  const week = 7 * 86_400_000;
  const counts = Array.from({ length: weeks }, () => 0);
  for (const d of dates) {
    const ago = Math.floor((now.getTime() - d.getTime()) / week);
    if (ago >= 0 && ago < weeks) counts[weeks - 1 - ago] += 1;
  }
  return counts;
}
