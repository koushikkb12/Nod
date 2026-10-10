import "server-only";
import { chmodSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { isNull } from "drizzle-orm";
import * as schema from "./schema";
import { demoAtsApplications } from "./schema";
import { seedDemoJobs } from "@/lib/jobs/demo";

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

/** Local development may use PGlite; production must use a real PostgreSQL server. */
const USE_EXTERNAL_PG = !!process.env.DATABASE_URL;

function validateRuntimeConfig() {
  if (process.env.NODE_ENV !== "production") return;
  if (!USE_EXTERNAL_PG) {
    throw new Error("DATABASE_URL must point to persistent PostgreSQL in production; PGlite is development-only.");
  }
  if (!process.env.NOD_DATA_DIR) {
    throw new Error("NOD_DATA_DIR must point to persistent private storage in production for CVs and receipts.");
  }
  const authSecret = process.env.BETTER_AUTH_SECRET ?? "";
  if (Buffer.byteLength(authSecret, "utf8") < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 bytes in production.");
  }
  for (const name of ["BETTER_AUTH_URL", "NOD_BASE_URL"] as const) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} must be set in production.`);
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`${name} must be a valid absolute URL in production.`);
    }
    if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS in production.`);
  }
  if (new URL(process.env.BETTER_AUTH_URL!).origin !== new URL(process.env.NOD_BASE_URL!).origin) {
    throw new Error("BETTER_AUTH_URL and NOD_BASE_URL must use the same origin in production.");
  }
}

/* ------------------------------------------------------------------ */
/* Exported type                                                       */
/* ------------------------------------------------------------------ */

/**
 * Both PGlite and node-postgres Drizzle instances share the same query API.
 * We use the PGlite type as the canonical type and cast when using node-postgres.
 */
export type DB = PgliteDatabase<typeof schema>;

type RawClient = {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
  exec: (sql: string) => Promise<unknown>;
  transaction: <T>(fn: (tx: RawClient) => Promise<T>) => Promise<T>;
};

/* ------------------------------------------------------------------ */
/* Internal state                                                      */
/* ------------------------------------------------------------------ */

interface Holder {
  db: DB;
  ready: Promise<void>;
  mode: "pglite" | "external";
  /** Raw PGlite client — only present in PGlite mode. */
  pgliteClient?: import("@electric-sql/pglite").PGlite;
  /** Connection pool — only present in external mode. */
  pgPool?: import("pg").Pool;
}

const g = globalThis as unknown as { __nodDb?: Holder };
let initPromise: Promise<Holder> | undefined;

/* ------------------------------------------------------------------ */
/* Data directory helpers (PGlite mode)                                */
/* ------------------------------------------------------------------ */

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
  writeFileSync(lock, String(process.pid), { mode: 0o600 });
  chmodSync(lock, 0o600);
  process.once("exit", () => {
    try {
      if (Number(readFileSync(lock, "utf8")) === process.pid) unlinkSync(lock);
    } catch {
      /* already gone */
    }
  });
}

async function prepareDatabase(db: DB, migrate: (db: DB, options: { migrationsFolder: string }) => Promise<void>) {
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

  // Older demo ATS entries were not linked to the Nod account that approved
  // them. Remove those unowned copies and their uploaded CVs after migrating.
  const legacy = await db.select().from(demoAtsApplications).where(isNull(demoAtsApplications.ownerUserId));
  const filesRoot = path.resolve(dataDir("files"));
  for (const row of legacy) {
    if (!row.resumeFile) continue;
    const full = path.resolve(filesRoot, row.resumeFile);
    if (full.startsWith(`${filesRoot}${path.sep}`)) await rm(full, { force: true });
  }
  if (legacy.length) {
    await db.delete(demoAtsApplications).where(isNull(demoAtsApplications.ownerUserId));
  }
  await seedDemoJobs(db);
}

/* ------------------------------------------------------------------ */
/* PGlite initialisation                                               */
/* ------------------------------------------------------------------ */

async function initPglite(): Promise<Holder> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  const dir = dataDir("pglite");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  lockDataDir();

  const client = new PGlite(dir);
  const db = drizzle({ client, schema, casing: "snake_case" }) as DB;

  const ready = prepareDatabase(db, migrate as unknown as (db: DB, options: { migrationsFolder: string }) => Promise<void>);

  const holder: Holder = { db, ready, mode: "pglite", pgliteClient: client };
  ready.catch((err) => console.error("[nod] database setup failed", err));
  return holder;
}

/* ------------------------------------------------------------------ */
/* External PostgreSQL initialisation                                  */
/* ------------------------------------------------------------------ */

async function initExternal(): Promise<Holder> {
  // Dynamic import handles CJS/ESM interop for the pg package
  const pgModule = await import("pg");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const PgPool = (pgModule as any).Pool ?? (pgModule as any).default?.Pool;
  if (!PgPool) {
    throw new Error(
      "Could not import pg.Pool. Run: npm install pg @types/pg",
    );
  }

  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");

  let dbUrl: URL;
  try {
    dbUrl = new URL(process.env.DATABASE_URL!);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  if (dbUrl.protocol !== "postgres:" && dbUrl.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres:// or postgresql:// scheme.");
  }
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(dbUrl.hostname);
  // Configure TLS explicitly below so connection-string sslmode parameters
  // cannot silently replace certificate verification options.
  dbUrl.searchParams.delete("sslmode");
  dbUrl.searchParams.delete("ssl");
  dbUrl.searchParams.delete("sslrootcert");
  dbUrl.searchParams.delete("sslcert");
  dbUrl.searchParams.delete("sslkey");
  const connectionString = dbUrl.toString();

  const pool = new PgPool({
    connectionString,
    // Verify the server certificate for remote PostgreSQL. Never silently
    // disable certificate validation for a production database connection.
    ssl: isLocal ? false : { rejectUnauthorized: true },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on("error", (err: Error) =>
    console.error("[nod] database pool error", err),
  );

  // Verify connectivity
  const testClient = await pool.connect();
  testClient.release();
  console.log("[nod] \u2713 connected to PostgreSQL");

  const db = drizzle({
    client: pool,
    schema,
    casing: "snake_case",
  }) as unknown as DB;

  const ready = prepareDatabase(db, migrate as unknown as (db: DB, options: { migrationsFolder: string }) => Promise<void>);

  const holder: Holder = { db, ready, mode: "external", pgPool: pool };
  ready.catch((err) => console.error("[nod] database setup failed", err));
  return holder;
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

async function init(): Promise<Holder> {
  validateRuntimeConfig();
  if (g.__nodDb) return g.__nodDb;
  if (!initPromise) {
    initPromise = (USE_EXTERNAL_PG ? initExternal() : initPglite()).then(
      (h) => {
        g.__nodDb = h;
        return h;
      },
    );
  }
  return initPromise;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * The Drizzle instance, available synchronously (for Better Auth).
 * Every code path calls getDb() before getAuth(), so the holder is
 * always populated by the time this runs.
 */
export function dbSync(): DB {
  if (!g.__nodDb) {
    throw new Error(
      "dbSync() called before the database was initialised. Call getDb() first.",
    );
  }
  return g.__nodDb.db;
}

/** Resolves once the database, migrations and seed data are in place. */
export async function getDb(): Promise<DB> {
  const h = await init();
  await h.ready;
  return h.db;
}

/**
 * Run raw SQL. For PGlite, passes the raw client. For external PostgreSQL,
 * acquires a pooled connection and wraps it in a PGlite-compatible interface
 * so callers (e.g. GDPR erasure in account.ts) work unchanged.
 */
export async function withClient<T>(
  fn: (client: RawClient) => Promise<T>,
): Promise<T> {
  const h = await init();
  await h.ready;

  if (h.mode === "external" && h.pgPool) {
    const pgClient = await h.pgPool.connect();
    try {
      // Wrap pg Client to match PGlite's API shape
      const wrapper: RawClient = {
        query: (sql: string, params?: unknown[]) =>
          pgClient.query(sql, params) as Promise<unknown>,
        exec: async (sql: string) => {
          await pgClient.query(sql);
        },
        transaction: async <R>(txFn: (tx: RawClient) => Promise<R>): Promise<R> => {
          await pgClient.query("BEGIN");
          try {
            const result = await txFn(wrapper);
            await pgClient.query("COMMIT");
            return result;
          } catch (err) {
            await pgClient.query("ROLLBACK");
            throw err;
          }
        },
      };
      return await fn(wrapper);
    } finally {
      pgClient.release();
    }
  }

  // PGlite mode — pass the raw client
  return fn(h.pgliteClient! as unknown as RawClient);
}

/**
 * PGlite runs Postgres in single-user mode, so autovacuum never runs. After
 * bulk writes (job ingest), mark dead rows reusable and let old WAL recycle.
 * Each statement runs on its own: VACUUM can't run in a transaction block.
 *
 * For external PostgreSQL, autovacuum handles this automatically.
 */
export async function compactDb() {
  const h = await init();
  await h.ready;
  if (h.mode === "external") return; // autovacuum handles this
  await withClient(async (client) => {
    await client.exec("VACUUM ANALYZE");
    await client.exec("CHECKPOINT");
  });
}

export { schema };
