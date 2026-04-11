import { Pool } from "pg";

let pool: Pool | null = null;

/**
 * URL para jobs/scripts quando só existem PG* (sem DATABASE_URL).
 * Password é codificado para uso em connection string.
 */
export function getPostgresConnectionString(): string | undefined {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    return url;
  }
  const host = process.env.PGHOST?.trim();
  const user = process.env.PGUSER?.trim();
  const database = process.env.PGDATABASE?.trim();
  if (!host || !user || !database) {
    return undefined;
  }
  const port = process.env.PGPORT?.trim() || "5432";
  const password = process.env.PGPASSWORD ?? "";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

function poolMax(): number {
  const n = Number.parseInt(process.env.PMG_PG_POOL_MAX ?? "15", 10);
  if (!Number.isFinite(n) || n < 2) return 15;
  return Math.min(n, 50);
}

function createPool(): Pool {
  const max = poolMax();
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    return new Pool({
      connectionString: url,
      max,
      idleTimeoutMillis: 30_000,
    });
  }
  return new Pool({
    host: process.env.PGHOST ?? "127.0.0.1",
    port: Number.parseInt(process.env.PGPORT ?? "5432", 10),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    max,
    idleTimeoutMillis: 30_000,
  });
}

export function getPool(): Pool {
  if (!pool) {
    pool = createPool();
  }
  return pool;
}
