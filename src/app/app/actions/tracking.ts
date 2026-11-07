"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { getDb } from "@/lib/db";
import { applications, interviews } from "@/lib/db/schema";
import { logEvent } from "@/lib/apps";
import { newId } from "@/lib/server-utils";
import { requireUser } from "@/lib/session";

const MAX_NOTES = 20_000;

async function ownedApplication(userId: string, applicationId: string) {
  const db = await getDb();
  const [app] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)));
  if (!app) throw new Error("Application not found");
  return app;
}

const dateOrNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error("That date isn't valid.");
  return d;
};

// Notes and reminders deliberately leave updatedAt alone: it marks the last
// status change, which follow-up suggestions are based on.

export async function saveNotes(formData: FormData) {
  const user = await requireUser();
  const app = await ownedApplication(user.id, String(formData.get("applicationId")));
  const notes = String(formData.get("notes") ?? "").slice(0, MAX_NOTES);
  const db = await getDb();
  await db.update(applications).set({ notes }).where(eq(applications.id, app.id));
  refresh();
}

export async function setFollowUp(formData: FormData) {
  const user = await requireUser();
  const app = await ownedApplication(user.id, String(formData.get("applicationId")));
  const followUpAt = dateOrNull(formData.get("followUpAt"));
  const db = await getDb();
  await db.update(applications).set({ followUpAt }).where(eq(applications.id, app.id));
  refresh();
}

export async function addInterview(formData: FormData) {
  const user = await requireUser();
  const app = await ownedApplication(user.id, String(formData.get("applicationId")));
  const startsAt = dateOrNull(formData.get("startsAt"));
  if (!startsAt) throw new Error("Choose a date and time.");
  const duration = Math.round(Number(formData.get("durationMinutes")));
  const title = String(formData.get("title") ?? "").trim().slice(0, 200) || "Interview";
  const db = await getDb();
  await db.insert(interviews).values({
    id: newId("iv"),
    applicationId: app.id,
    userId: user.id,
    title,
    startsAt,
    durationMinutes: Number.isFinite(duration) ? Math.min(480, Math.max(5, duration)) : 60,
    location: String(formData.get("location") ?? "").trim().slice(0, 500),
  });
  await logEvent(user.id, app.id, "interview", `Added “${title}” on ${startsAt.toISOString().slice(0, 10)}.`);
  refresh();
}

export async function deleteInterview(interviewId: string) {
  const user = await requireUser();
  const db = await getDb();
  const [gone] = await db
    .delete(interviews)
    .where(and(eq(interviews.id, interviewId), eq(interviews.userId, user.id)))
    .returning({ applicationId: interviews.applicationId, title: interviews.title });
  if (gone) await logEvent(user.id, gone.applicationId, "interview", `Removed “${gone.title}”.`);
  refresh();
}
