import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "@/lib/db";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/** Short, URL-safe random id with a readable prefix, e.g. "app_8k2m...". */
export function newId(prefix: string, length = 14) {
  const bytes = randomBytes(length);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${prefix}_${out}`;
}

export function sha256(data: string | Buffer | Uint8Array) {
  return createHash("sha256").update(data).digest("hex");
}

/** Short-lived proof that a demo ATS request came from Nod's submission worker. */
export function createDemoSubmissionToken(userId: string, applicationId: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) throw new Error("A strong BETTER_AUTH_SECRET is required.");
  const payload = Buffer.from(JSON.stringify({ userId, applicationId, exp: Math.floor(Date.now() / 1000) + 300 })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyDemoSubmissionToken(token: string | null) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!token || !secret || Buffer.byteLength(secret, "utf8") < 32) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId?: unknown;
      applicationId?: unknown;
      exp?: unknown;
    };
    if (typeof data.userId !== "string" || typeof data.applicationId !== "string" || typeof data.exp !== "number") return null;
    if (data.exp <= Math.floor(Date.now() / 1000) || data.exp > Math.floor(Date.now() / 1000) + 300) return null;
    return { userId: data.userId, applicationId: data.applicationId };
  } catch {
    return null;
  }
}

/** JSON with sorted keys, so the same payload always hashes the same way. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
    .join(",")}}`;
}

/* Local file storage under NOD_DATA_DIR/files/<userId>/... */

const FILES_ROOT = () => dataDir("files");

/** Store a file and return its storage key (relative path). */
export async function putFile(key: string, data: Buffer | Uint8Array) {
  const safe = safeFileKey(key);
  const full = path.resolve(FILES_ROOT(), safe);
  const parent = path.dirname(full);
  await mkdir(FILES_ROOT(), { recursive: true, mode: 0o700 });
  await chmod(FILES_ROOT(), 0o700);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  await chmod(parent, 0o700);
  await writeFile(full, data, { mode: 0o600 });
  // Tighten permissions on existing files too; writeFile's mode only applies
  // when it creates a new file.
  await chmod(full, 0o600);
  return safe;
}

function safeFileKey(key: string) {
  if (!key || key.includes("\0")) throw new Error("Invalid file key");
  const root = path.resolve(FILES_ROOT());
  const full = path.resolve(root, key);
  if (!full.startsWith(`${root}${path.sep}`)) throw new Error("Invalid file key");
  return path.relative(root, full);
}

export function filePath(key: string) {
  return path.resolve(FILES_ROOT(), safeFileKey(key));
}

export async function getFile(key: string) {
  return readFile(filePath(key));
}
