export type Workplace = "remote" | "hybrid" | "onsite";

export type FactKind =
  | "role"
  | "achievement"
  | "education"
  | "skill"
  | "certification"
  | "project"
  | "other";

export type AnswerCategory =
  | "work_auth"
  | "sponsorship"
  | "notice"
  | "salary"
  | "relocation"
  | "links"
  | "sensitive"
  | "other";

/** A question on an employer's application form, in one standard shape. */
export type FormQuestion = {
  id: string; // field name on the form
  label: string;
  required: boolean;
  type: "text" | "textarea" | "select" | "file" | "boolean";
  options?: { label: string; value: string }[];
  /** EEO / diversity questions are special category data. */
  sensitive?: boolean;
};

/**
 * One sentence of generated content. Every claim must cite the facts it came
 * from; "framing" sentences (greetings, the role being applied for) make no
 * claims about the candidate.
 */
export type Sentence = {
  id: string;
  text: string;
  factIds: string[];
  kind: "claim" | "framing";
  status: "traced" | "blocked";
  reason?: string;
  /** Edited by the user after generation. */
  edited?: boolean;
  /** User chose to leave this sentence out. */
  removed?: boolean;
};

export type DraftAnswer = {
  questionId: string;
  label: string;
  required: boolean;
  type: FormQuestion["type"];
  options?: { label: string; value: string }[];
  value: string;
  source:
    | "profile"
    | "preferences"
    | "library"
    | "facts"
    | "user"
    | "sensitive-default"
    | "file"
    | "unknown";
  factIds?: string[];
  sensitive?: boolean;
  /** True when Nod could not answer and the user must. */
  needsUser: boolean;
  /** Why the answer needs attention, shown on the review screen. */
  note?: string;
};

export type DraftRole = {
  roleFactId: string;
  heading: string; // "Data Analyst · Acme · 2021 - 2023"
  bullets: Sentence[];
};

export type Draft = {
  generatedBy: "ai" | "rules";
  model?: string;
  generatedAt: string;
  summary: Sentence[];
  roles: DraftRole[];
  skills: string[];
  education: string[];
  coverLetter: Sentence[];
  answers: DraftAnswer[];
  /** Anything suspicious found in the job ad (possible prompt injection). */
  injectionWarnings: string[];
};

export type AppStatus =
  | "drafted" // draft ready, waiting for the user's review
  | "approved" // approved, payload frozen and hashed
  | "manual_kit" // approved for "I'll apply myself"
  | "submitting" // agent is submitting the approved payload
  | "needs_user" // something changed; back to the user
  | "submitted"
  | "interviewing"
  | "offer"
  | "rejected"
  | "withdrawn"
  | "failed";

export const APP_STATUS_LABEL: Record<AppStatus, string> = {
  drafted: "Waiting for your review",
  approved: "Approved",
  manual_kit: "Kit ready, apply yourself",
  submitting: "Sending",
  needs_user: "Needs you",
  submitted: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  failed: "Failed",
};
