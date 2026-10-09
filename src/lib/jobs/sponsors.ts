import "server-only";
import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "@/lib/db";

/**
 * The UK Home Office "Register of licensed sponsors: workers" is published as
 * a CSV on gov.uk and updated daily. We keep a normalized name list on disk.
 */
const PAGE = "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers";
const FILE = () => dataDir("sponsors.json");
const MAX_AGE_MS = 7 * 86_400_000;

let cache: { names: Set<string>; byFirst: Map<string, string[]> } | null = null;

export function normaliseOrg(name: string) {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(ltd|limited|plc|llp|llc|inc|incorporated|uk|gb|group|holdings|the|t a|trading as)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function download(): Promise<string[]> {
  const page = await fetch(PAGE, { signal: AbortSignal.timeout(20_000) }).then((r) => r.text());
  const href = page.match(/https:\/\/assets\.publishing\.service\.gov\.uk\/[^"']+\.csv/)?.[0];
  if (!href) throw new Error("Could not find the sponsor register CSV link");
  const csv = await fetch(href, { signal: AbortSignal.timeout(60_000) }).then((r) => r.text());
  const names = new Set<string>();
  for (const line of csv.split("\n").slice(1)) {
    // First column is "Organisation Name", possibly quoted.
    const m = line.match(/^"((?:[^"]|"")*)"|^([^,]*)/);
    const raw = (m?.[1] ?? m?.[2] ?? "").replace(/""/g, '"');
    const n = normaliseOrg(raw);
    if (n) names.add(n);
  }
  return [...names];
}

/** Refresh the local copy if it is missing or older than a week. */
export async function ensureSponsorRegister(): Promise<{ count: number; refreshed: boolean }> {
  let fresh = false;
  try {
    const s = await stat(FILE());
    fresh = Date.now() - s.mtimeMs < MAX_AGE_MS;
  } catch {}
  if (!fresh) {
    const names = await download();
    await mkdir(path.dirname(FILE()), { recursive: true });
    await writeFile(FILE(), JSON.stringify(names));
    cache = null;
  }
  const set = await load();
  return { count: set?.names.size ?? 0, refreshed: !fresh };
}

async function load() {
  if (cache) return cache;
  try {
    const names: string[] = JSON.parse(await readFile(FILE(), "utf8"));
    const byFirst = new Map<string, string[]>();
    for (const n of names) {
      const first = n.split(" ")[0];
      const list = byFirst.get(first) ?? [];
      list.push(n);
      byFirst.set(first, list);
    }
    cache = { names: new Set(names), byFirst };
    return cache;
  } catch {
    return null;
  }
}

/**
 * Register name that matches a company, or null. Matches the exact
 * normalized name, or a register entry that starts with it ("monzo" ->
 * "monzo bank"). This is a name match, not legal confirmation.
 */
export async function sponsorMatch(company: string): Promise<string | null> {
  const reg = await load();
  if (!reg) return null;
  const n = normaliseOrg(company);
  if (!n || n.length < 3) return null;
  if (reg.names.has(n)) return n;
  const candidates = reg.byFirst.get(n.split(" ")[0]) ?? [];
  return candidates.find((c) => c.startsWith(`${n} `)) ?? null;
}

export async function sponsorRegisterLoaded() {
  return (await load()) !== null;
}
