import {
  bigserial,
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type {
  AnswerCategory,
  AppStatus,
  Draft,
  FactKind,
  FormQuestion,
  Workplace,
} from "@/lib/types";

const ts = () => timestamp({ withTimezone: true });

/* ------------------------------------------------------------------ */
/* Better Auth core tables                                             */
/* ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text().primaryKey(),
  expiresAt: ts().notNull(),
  token: text().notNull().unique(),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
  ipAddress: text(),
  userAgent: text(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text().primaryKey(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: ts(),
  refreshTokenExpiresAt: ts(),
  scope: text(),
  password: text(),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: ts().notNull(),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});

/** Better Auth's persistent rate limit store (timestamps are epoch milliseconds). */
export const rateLimit = pgTable("rate_limit", {
  id: text().primaryKey().default(sql`gen_random_uuid()::text`),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});

/* ------------------------------------------------------------------ */
/* Profile, fact bank, preferences, answer library                    */
/* ------------------------------------------------------------------ */

export const profiles = pgTable("profiles", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  fullName: text().notNull().default(""),
  email: text().notNull().default(""),
  phone: text().notNull().default(""),
  location: text().notNull().default(""),
  headline: text().notNull().default(""),
  summary: text().notNull().default(""),
  links: jsonb().$type<{ label: string; url: string }[]>().notNull().default([]),
  cvFileName: text(),
  cvText: text(),
  parsedBy: text().$type<"ai" | "rules">(),
  updatedAt: ts().notNull().defaultNow(),
});

export const facts = pgTable(
  "facts",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text().$type<FactKind>().notNull(),
    // Achievements point at the role they belong to.
    parentId: text(),
    text: text().notNull(),
    org: text(),
    role: text(),
    startDate: text(),
    endDate: text(),
    skills: jsonb().$type<string[]>().notNull().default([]),
    confirmed: boolean().notNull().default(false),
    source: text().$type<"cv" | "user">().notNull().default("cv"),
    position: integer().notNull().default(0),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.position)],
);

export const preferences = pgTable("preferences", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  titles: jsonb().$type<string[]>().notNull().default([]),
  locations: jsonb().$type<string[]>().notNull().default([]),
  workplace: jsonb().$type<Workplace[]>().notNull().default([]),
  seniority: jsonb().$type<string[]>().notNull().default([]),
  minSalary: integer(),
  salaryCurrency: text().notNull().default("GBP"),
  keywords: jsonb().$type<string[]>().notNull().default([]),
  excludeCompanies: jsonb().$type<string[]>().notNull().default([]),
  needsSponsorship: boolean(),
  rightToWork: text().notNull().default(""),
  noticePeriod: text().notNull().default(""),
  willingToRelocate: boolean().notNull().default(false),
  dailyCap: integer().notNull().default(10),
  perCompanyMonthlyCap: integer().notNull().default(2),
  agentPaused: boolean().notNull().default(false),
  updatedAt: ts().notNull().defaultNow(),
});

export const answers = pgTable(
  "answers",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    label: text().notNull(),
    normLabel: text().notNull(),
    category: text().$type<AnswerCategory>().notNull().default("other"),
    answer: text().notNull(),
    sensitive: boolean().notNull().default(false),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [uniqueIndex().on(t.userId, t.normLabel)],
);

/* ------------------------------------------------------------------ */
/* Jobs and matching                                                   */
/* ------------------------------------------------------------------ */

export const jobs = pgTable(
  "jobs",
  {
    id: text().primaryKey(),
    source: text()
      .$type<"greenhouse" | "lever" | "ashby" | "adzuna" | "demo">()
      .notNull(),
    sourceCompany: text().notNull(),
    externalId: text().notNull(),
    company: text().notNull(),
    title: text().notNull(),
    location: text().notNull().default(""),
    workplace: text().$type<Workplace | "unknown">().notNull().default("unknown"),
    employmentType: text(),
    salaryMin: integer(),
    salaryMax: integer(),
    salaryCurrency: text(),
    descriptionHtml: text().notNull().default(""),
    descriptionText: text().notNull().default(""),
    skills: jsonb().$type<string[]>().notNull().default([]),
    applyUrl: text().notNull(),
    sourceUrl: text().notNull(),
    questions: jsonb().$type<FormQuestion[] | null>(),
    postedAt: ts(),
    firstSeenAt: ts().notNull().defaultNow(),
    lastCheckedAt: ts().notNull().defaultNow(),
    isOpen: boolean().notNull().default(true),
    dedupeKey: text().notNull(),
    riskScore: integer().notNull().default(0),
    riskFlags: jsonb().$type<string[]>().notNull().default([]),
    sponsorMatch: text(),
    isDemo: boolean().notNull().default(false),
  },
  (t) => [index().on(t.dedupeKey), index().on(t.isOpen)],
);

export const ingestRuns = pgTable("ingest_runs", {
  id: bigserial({ mode: "number" }).primaryKey(),
  startedAt: ts().notNull().defaultNow(),
  finishedAt: ts(),
  status: text().$type<"running" | "done" | "failed">().notNull(),
  stats: jsonb()
    .$type<{
      sources: Record<string, { boards: number; jobs: number; errors: number }>;
      total: number;
      closed: number;
      errors: string[];
    }>()
    .notNull(),
});

export const matches = pgTable(
  "matches",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobId: text()
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    score: integer().notNull(),
    matchedSkills: jsonb().$type<string[]>().notNull().default([]),
    missingSkills: jsonb().$type<string[]>().notNull().default([]),
    reasons: jsonb().$type<string[]>().notNull().default([]),
    warnings: jsonb().$type<string[]>().notNull().default([]),
    status: text()
      .$type<"new" | "shortlisted" | "dismissed">()
      .notNull()
      .default("new"),
    dismissReason: text(),
    aiSummary: text(),
    computedAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.score)],
);

/* ------------------------------------------------------------------ */
/* Applications, consent ledger, submissions                           */
/* ------------------------------------------------------------------ */

export const applications = pgTable(
  "applications",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobId: text()
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    status: text().$type<AppStatus>().notNull(),
    mode: text().$type<"manual" | "agent">().notNull().default("manual"),
    draft: jsonb().$type<Draft>().notNull(),
    approvedHash: text(),
    cvPdfPath: text(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.updatedAt)],
);

/**
 * The consent ledger. Rows can only be inserted: a database trigger
 * (see drizzle/ migrations) rejects UPDATE and DELETE unless the session
 * explicitly enables erasure for a user's right-to-be-forgotten request.
 */
export const approvals = pgTable(
  "approvals",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    applicationId: text().notNull(),
    userId: text().notNull(),
    kind: text().$type<"approve" | "revoke">().notNull(),
    payloadHash: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    userAgent: text(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.createdAt), index().on(t.applicationId)],
);

export const submissions = pgTable("submissions", {
  id: text().primaryKey(),
  applicationId: text()
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  attempt: integer().notNull().default(1),
  adapter: text().notNull(),
  status: text()
    .$type<"running" | "succeeded" | "needs_user" | "failed">()
    .notNull(),
  payloadHash: text().notNull(),
  needs: jsonb().$type<{ field: string; label: string; reason: string; options?: { label: string; value: string }[] }[]>(),
  formScreenshot: text(),
  confirmationScreenshot: text(),
  confirmationText: text(),
  error: text(),
  startedAt: ts().notNull().defaultNow(),
  finishedAt: ts(),
});

export const events = pgTable(
  "events",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    applicationId: text(),
    type: text().notNull(),
    message: text().notNull(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.applicationId, t.createdAt)],
);

/** Applications received by the built-in demo ATS (the "employer" side). */
export const demoAtsApplications = pgTable("demo_ats_applications", {
  id: text().primaryKey(),
  jobId: text().notNull(),
  applicationId: text().unique().references(() => applications.id, { onDelete: "cascade" }),
  ownerUserId: text().references(() => user.id, { onDelete: "cascade" }),
  fields: jsonb().$type<Record<string, string>>().notNull(),
  resumeFile: text(),
  resumeSha256: text(),
  receivedAt: ts().notNull().defaultNow(),
});
