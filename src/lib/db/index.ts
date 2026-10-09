import "server-only";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";
import { seedDemoJobs } from "@/lib/jobs/demo";

export type DB = PgliteDatabase<typeof schema>;

type Holder = { client: PGlite; db: DB; ready: Promise<void> };

// One embedded Postgres per server process. Kept on globalThis so hot reloads
// in development don't open the same data directory twice.
const g = globalThis as unknown as { __nodDb?: Holder };

export function dataDir(...parts: string[]) {
  return path.resolve(process.env.NOD_DATA_DIR ?? "./data", ...parts);
}

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * PGlite is single-process. Two processes writing the same data folder would
 * corrupt it, so the first process takes a lock and any other one fails fast.
 */
function lockDataDir() {
  const lock = dataDir("pglite.lock");
  try {
    const owner = Number(readFileSync(lock, "utf8"));
    if (owner && owner !== process.pid && alive(owner)) {
      throw new Error(
        `The Nod database (${dataDir("pglite")}) is already open in process ${owner}. ` +
          "Run one Nod server at a time, or give each one its own NOD_DATA_DIR.",
      );
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  writeFileSync(lock, String(process.pid));
  process.once("exit", () => {
    try {
      if (Number(readFileSync(lock, "utf8")) === process.pid) unlinkSync(lock);
    } catch {
      /* already gone */
    }
  });
}

function create(): Holder {
  const dir = dataDir("pglite");
  mkdirSync(dir, { recursive: true });
  lockDataDir();
  const client = new PGlite(dir);
  const db = drizzle({ client, schema, casing: "snake_case" });
  const ready = (async () => {
    await migrate(db, {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
    await seedDemoJobs(db);
  })();
  ready.catch((err) => console.error("[nod] database setup failed", err));
  return { client, db, ready };
}

function holder(): Holder {
  g.__nodDb ??= create();
  return g.__nodDb;
}

/** The Drizzle instance, available synchronously (for Better Auth). */
export function dbSync(): DB {
  return holder().db;
}

/** Resolves once migrations and seed data are in place. */
export async function getDb(): Promise<DB> {
  const h = holder();
  await h.ready;
  return h.db;
}

/** Run raw SQL inside one transaction (used for GDPR erasure). */
export async function withClient<T>(fn: (client: PGlite) => Promise<T>) {
  const h = holder();
  await h.ready;
  return fn(h.client);
}

/**
 * PGlite runs Postgres in single-user mode, so autovacuum never runs. After
 * bulk writes (job ingest), mark dead rows reusable and let old WAL recycle.
 * Each statement runs on its own: VACUUM can't run in a transaction block.
 */
export async function compactDb() {
  await withClient(async (client) => {
    await client.exec("VACUUM ANALYZE");
    await client.exec("CHECKPOINT");
  });
}

export { schema };
