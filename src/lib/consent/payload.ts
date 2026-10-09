import "server-only";
import type { Draft } from "@/lib/types";
import { canonicalJson, sha256 } from "@/lib/server-utils";
import { classify } from "@/lib/draft/answers";
import { included } from "@/lib/draft/guard";

/**
 * Exactly what will be sent to the employer. This object is what the user
 * approves; its SHA-256 is stored in the consent ledger and checked again
 * immediately before submission.
 */
export type ApplicationPayload = {
  version: 1;
  applicationId: string;
  mode: "manual" | "agent";
  job: { id: string; company: string; title: string; applyUrl: string };
  applicant: {
    fullName: string;
    email: string;
    phone: string;
    location: string;
    links: { label: string; url: string }[];
  };
  cv: {
    summary: string[];
    roles: { heading: string; bullets: string[] }[];
    skills: string[];
    education: string[];
  };
  coverLetter: string[];
  answers: { id: string; label: string; value: string; sensitive?: boolean }[];
  files: { cv: { name: string; sha256: string } | null };
};

type ProfileLite = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  links: { label: string; url: string }[];
};

export function coverLetterText(draft: Draft) {
  return included(draft.coverLetter).map((s) => s.text).join("\n\n");
}

export function buildPayload(input: {
  applicationId: string;
  mode: "manual" | "agent";
  draft: Draft;
  job: { id: string; company: string; title: string; applyUrl: string };
  profile: ProfileLite;
  cvFile: { name: string; sha256: string } | null;
}): ApplicationPayload {
  const { draft } = input;
  const cover = coverLetterText(draft);
  return {
    version: 1,
    applicationId: input.applicationId,
    mode: input.mode,
    job: input.job,
    applicant: {
      fullName: input.profile.fullName,
      email: input.profile.email,
      phone: input.profile.phone,
      location: input.profile.location,
      links: input.profile.links,
    },
    cv: {
      summary: included(draft.summary).map((s) => s.text),
      roles: draft.roles
        .map((r) => ({ heading: r.heading, bullets: included(r.bullets).map((s) => s.text) }))
        .filter((r) => r.bullets.length || r.heading),
      skills: draft.skills,
      education: draft.education,
    },
    coverLetter: included(draft.coverLetter).map((s) => s.text),
    answers: draft.answers
      .filter((a) => a.type !== "file")
      .map((a) => {
        const isCover = classify({ id: a.questionId, label: a.label, required: a.required, type: a.type }) === "cover_letter";
        return {
          id: a.questionId,
          label: a.label,
          value: isCover ? cover : a.value,
          ...(a.sensitive ? { sensitive: true } : {}),
        };
      }),
    files: { cv: input.cvFile },
  };
}

export function payloadHash(payload: ApplicationPayload) {
  return sha256(canonicalJson(payload));
}

/** Reasons the user can't approve yet. Empty means ready. */
export function approvalBlockers(draft: Draft, profile: ProfileLite) {
  const out: string[] = [];
  if (!profile.fullName) out.push("Add your name in your profile.");
  if (!profile.email) out.push("Add your email in your profile.");
  for (const a of draft.answers) {
    if (a.needsUser || (a.required && !a.value && a.type !== "file" && a.source !== "facts")) {
      out.push(`Answer “${a.label}”.`);
    }
  }
  const coverQ = draft.answers.find((a) => classify({ id: a.questionId, label: a.label, required: a.required, type: a.type }) === "cover_letter");
  if (coverQ?.required && !coverLetterText(draft)) out.push("The cover letter is empty.");
  return [...new Set(out)];
}

/** Human-readable short form of a hash, e.g. "8f3a 91c2". */
export function shortHash(hash: string | null | undefined) {
  if (!hash) return "";
  return `${hash.slice(0, 4)} ${hash.slice(4, 8)}`;
}
