import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  const safe = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
  const full = path.join(FILES_ROOT(), safe);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return safe;
}

export function filePath(key: string) {
  const full = path.resolve(FILES_ROOT(), key);
  if (!full.startsWith(path.resolve(FILES_ROOT()) + path.sep)) {
    throw new Error("Invalid file key");
  }
  return full;
}

export async function getFile(key: string) {
  return readFile(filePath(key));
}
