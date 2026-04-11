import { Pool } from "pg";

let hubPool: Pool | null = null;

function createHubPool(): Pool {
  const url = process.env.HUB_DATABASE_URL?.trim();
  if (!url) {
    throw new Error("HUB_DATABASE_URL não definido");
  }
  return new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30_000 });
}

/** Pool read-only para metadados do Hub (tabelas Prisma "Sector", "Group", "Client"). */
export function getHubPool(): Pool {
  if (!hubPool) {
    hubPool = createHubPool();
  }
  return hubPool;
}

export function isHubDatabaseConfigured(): boolean {
  return Boolean(process.env.HUB_DATABASE_URL?.trim());
}
