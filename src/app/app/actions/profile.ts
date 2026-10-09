"use server";

import { and, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { getDb } from "@/lib/db";
import { answers, facts, profiles } from "@/lib/db/schema";
import { extractCvText } from "@/lib/cv/extract";
import { parseCv } from "@/lib/cv/parse";
import { categoryOf, classify, normLabel } from "@/lib/draft/answers";
import { computeMatches } from "@/lib/match/score";
import { newId, putFile } from "@/lib/server-utils";
import { requireUser } from "@/lib/session";
import { extractSkills } from "@/lib/skills";
import type { AnswerCategory, FactKind } from "@/lib/types";

export type CvUploadState =
  | { ok: true; message: string; facts: number; by: "ai" | "rules" }
  | { ok: false; message: string }
  | null;

/** Upload a CV, extract its text, and turn it into unconfirmed facts. */
export async function uploadCv(_prev: CvUploadState, formData: FormData): Promise<CvUploadState> {
  const user = await requireUser();
  const file = formData.get("cv");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a CV file to upload." };

  let text: string;
  try {
    text = await extractCvText(file);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Couldn't read that file." };
  }
  if (text.length < 80) {
    return { ok: false, message: "Nod couldn't find much text in that file. If it's a scanned PDF, try a Word or text version." };
  }

  const { cv, by, note } = await parseCv(text);
  const db = await getDb();
  await putFile(`${user.id}/cv/original-${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`, Buffer.from(await file.arrayBuffer()));

  const [existing] = await db.select().from(profiles).where(eq(profiles.userId, user.id));
  const profileValues = {
    // Keep anything the user already typed in; fill the gaps from the CV.
    fullName: existing?.fullName || cv.fullName || user.name,
    email: existing?.email || cv.email || user.email,
    phone: existing?.phone || cv.phone,
    location: existing?.location || cv.location,
    headline: existing?.headline || cv.headline || cv.roles[0]?.role || "",
    summary: cv.summary,
    links: existing?.links?.length ? existing.links : cv.links,
    cvFileName: file.name,
    cvText: text,
    parsedBy: by,
    updatedAt: new Date(),
  };
  await db
    .insert(profiles)
    .values({ userId: user.id, ...profileValues })
    .onConflictDoUpdate({ target: profiles.userId, set: profileValues });

  // Replace facts that came from a previous CV; keep facts the user added.
  await db.delete(facts).where(and(eq(facts.userId, user.id), eq(facts.source, "cv")));

  type NewFact = typeof facts.$inferInsert;
  const rows: NewFact[] = [];
  let position = 0;
  const add = (f: Omit<NewFact, "userId" | "id" | "position"> & { id?: string }) => {
    const row: NewFact = { id: f.id ?? newId("f", 10), userId: user.id, position: position++, ...f };
    rows.push(row);
    return row.id;
  };

  if (cv.summary.trim().length > 40) {
    add({ kind: "other", text: cv.summary.trim(), skills: extractSkills(cv.summary) });
  }
  for (const r of cv.roles) {
    if (!r.role && !r.org) continue;
    const dates = [r.startDate, r.endDate].filter(Boolean).join(" – ");
    const roleId = add({
      kind: "role",
      text: `${r.role}${r.org ? ` at ${r.org}` : ""}${dates ? ` (${dates})` : ""}`,
      role: r.role,
      org: r.org,
      startDate: r.startDate || null,
      endDate: r.endDate || null,
      skills: extractSkills(r.role),
    });
    for (const a of r.achievements) {
      if (a.trim().length < 8) continue;
      add({
        kind: "achievement",
        parentId: roleId,
        text: a.trim(),
        role: r.role,
        org: r.org,
        startDate: r.startDate || null,
        endDate: r.endDate || null,
        skills: extractSkills(a),
      });
    }
  }
  for (const e of cv.education) if (e.trim()) add({ kind: "education", text: e.trim(), skills: [] });
  for (const c of cv.certifications) if (c.trim()) add({ kind: "certification", text: c.trim(), skills: extractSkills(c) });
  for (const p of cv.projects) if (p.trim()) add({ kind: "project", text: p.trim(), skills: extractSkills(p) });
  const skillNames = [...new Set([...extractSkills(cv.skills.join(", ")), ...cv.skills.filter((s) => s.length < 32)])];
  if (skillNames.length) {
    const text = `Skills: ${skillNames.join(", ")}`;
    add({ kind: "skill", text, skills: extractSkills(text) });
  }
  if (rows.length) await db.insert(facts).values(rows);

  refresh();
  return {
    ok: true,
    by,
    facts: rows.length,
    message: `${note ? `${note} ` : ""}Found ${rows.length} facts in ${file.name}. Check them below, then confirm the ones that are true.`,
  };
}

export async function saveProfile(formData: FormData) {
  const user = await requireUser();
  const db = await getDb();
  const s = (k: string) => String(formData.get(k) ?? "").trim();
  const links = [
    { label: "LinkedIn", url: s("linkedin") },
    { label: "GitHub", url: s("github") },
    { label: "Website", url: s("website") },
  ]
    .filter((l) => l.url)
    .map((l) => ({ ...l, url: /^https?:\/\//.test(l.url) ? l.url : `https://${l.url}` }));
  const values = {
    fullName: s("fullName"),
    email: s("email"),
    phone: s("phone"),
    location: s("location"),
    headline: s("headline"),
    links,
    updatedAt: new Date(),
  };
  await db.insert(profiles).values({ userId: user.id, ...values }).onConflictDoUpdate({ target: profiles.userId, set: values });
  refresh();
}

/* ------------------------------ Facts ------------------------------- */

async function ownFact(userId: string, id: string) {
  const db = await getDb();
  const [f] = await db.select().from(facts).where(and(eq(facts.id, id), eq(facts.userId, userId)));
  if (!f) throw new Error("Fact not found");
  return f;
}

export async function setFactConfirmed(id: string, confirmed: boolean) {
  const user = await requireUser();
  await ownFact(user.id, id);
  const db = await getDb();
  await db.update(facts).set({ confirmed }).where(eq(facts.id, id));
  refresh();
}

export async function confirmAllFacts() {
  const user = await requireUser();
  const db = await getDb();
  await db.update(facts).set({ confirmed: true }).where(eq(facts.userId, user.id));
  await computeMatches(user.id);
  refresh();
}

export async function updateFact(id: string, text: string) {
  const user = await requireUser();
  await ownFact(user.id, id);
  const clean = text.trim();
  if (!clean) throw new Error("A fact can't be empty");
  const db = await getDb();
  await db.update(facts).set({ text: clean, skills: extractSkills(clean) }).where(eq(facts.id, id));
  refresh();
}

export async function deleteFact(id: string) {
  const user = await requireUser();
  await ownFact(user.id, id);
  const db = await getDb();
  // Deleting a role deletes its achievements too.
  const children = await db.select({ id: facts.id }).from(facts).where(and(eq(facts.userId, user.id), eq(facts.parentId, id)));
  await db.delete(facts).where(and(eq(facts.userId, user.id), inArray(facts.id, [id, ...children.map((c) => c.id)])));
  refresh();
}

export async function addFact(formData: FormData) {
  const user = await requireUser();
  const text = String(formData.get("text") ?? "").trim();
  const kind = (String(formData.get("kind") ?? "achievement") || "achievement") as FactKind;
  const parentId = String(formData.get("parentId") ?? "") || null;
  if (!text) return;
  const db = await getDb();
  let parent = null;
  if (parentId) parent = await ownFact(user.id, parentId);
  await db.insert(facts).values({
    id: newId("f", 10),
    userId: user.id,
    kind,
    parentId,
    text,
    role: parent?.role ?? null,
    org: parent?.org ?? null,
    startDate: parent?.startDate ?? null,
    endDate: parent?.endDate ?? null,
    skills: extractSkills(text),
    confirmed: true, // the user typed it in themselves
    source: "user",
    position: 10_000 + Date.now() % 100_000,
  });
  refresh();
}

/* -------------------------- Answer library -------------------------- */

export async function saveAnswer(formData: FormData) {
  const user = await requireUser();
  const label = String(formData.get("label") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  if (!label || !answer) return;
  const kind = classify({ id: "", label, required: false, type: "text" });
  const category = (String(formData.get("category") ?? "") || categoryOf(kind)) as AnswerCategory;
  const db = await getDb();
  await db
    .insert(answers)
    .values({ id: newId("ans"), userId: user.id, label, normLabel: normLabel(label), category, answer, sensitive: category === "sensitive" })
    .onConflictDoUpdate({ target: [answers.userId, answers.normLabel], set: { answer, category, updatedAt: new Date() } });
  refresh();
}

export async function deleteAnswer(id: string) {
  const user = await requireUser();
  const db = await getDb();
  await db.delete(answers).where(and(eq(answers.id, id), eq(answers.userId, user.id)));
  refresh();
}
