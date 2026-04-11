/**
 * TRUNCATE no mirror (North) + cópia linha a linha (batched SELECT na prod).
 * Produção: só SELECT.
 */
import "dotenv/config";
import { getPostgresConnectionString } from "../src/lib/db";
import {
  ERP_MIRROR_INSERT_ORDER,
  erpMirrorTruncateSql,
} from "../src/lib/erp-mirror/tables";
import { Pool } from "pg";

function qIdent(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

function qualifyTable(schema: string, table: string): string {
  return schema === "public" ? qIdent(table) : `${qIdent(schema)}.${qIdent(table)}`;
}

function mirrorTargetUrl(): string | undefined {
  return (
    process.env.PMG_MIRROR_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    getPostgresConnectionString()
  );
}

async function getColumnNames(
  pool: Pool,
  schema: string,
  table: string
): Promise<string[]> {
  const { rows } = await pool.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [schema, table]
  );
  return rows.map((r) => r.column_name);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function insertBatch(
  target: Pool,
  schema: string,
  table: string,
  cols: string[],
  rows: Record<string, unknown>[]
): Promise<void> {
  if (!rows.length) {
    return;
  }
  const tq = qualifyTable(schema, table);
  const colList = cols.map((c) => qIdent(c)).join(", ");
  const insertRows = 200;
  for (const batch of chunk(rows, insertRows)) {
    let paramIndex = 1;
    const placeholders = batch
      .map(() => {
        const ps = cols.map(() => `$${paramIndex++}`);
        return `(${ps.join(", ")})`;
      })
      .join(", ");
    const values: unknown[] = [];
    for (const row of batch) {
      for (const c of cols) {
        values.push(row[c] ?? null);
      }
    }
    await target.query(
      `INSERT INTO ${tq} (${colList}) VALUES ${placeholders}`,
      values
    );
  }
}

async function copyTable(
  source: Pool,
  target: Pool,
  schema: string,
  table: string,
  batchSize: number
): Promise<number> {
  const cols = await getColumnNames(target, schema, table);
  if (!cols.length) {
    throw new Error(`Mirror sem colunas para ${schema}.${table} — corra introspect + DDL.`);
  }
  const sq = qualifyTable(schema, table);
  let offset = 0;
  let total = 0;
  for (;;) {
    const { rows } = await source.query<Record<string, unknown>>(
      `SELECT * FROM ${sq} ORDER BY 1 LIMIT $1 OFFSET $2`,
      [batchSize, offset]
    );
    if (!rows.length) {
      break;
    }
    await insertBatch(target, schema, table, cols, rows);
    total += rows.length;
    offset += rows.length;
    if (rows.length < batchSize) {
      break;
    }
  }
  return total;
}

async function main(): Promise<void> {
  const sourceUrl = process.env.PMG_SOURCE_DATABASE_URL?.trim();
  const targetUrl = mirrorTargetUrl();
  if (!sourceUrl) {
    throw new Error("PMG_SOURCE_DATABASE_URL é obrigatório (leitura na produção).");
  }
  if (!targetUrl) {
    throw new Error(
      "Defina destino do espelho: PMG_MIRROR_DATABASE_URL, DATABASE_URL ou PGHOST+PGUSER+PGDATABASE."
    );
  }
  const schema = process.env.PMG_SOURCE_SCHEMA?.trim() || "public";
  const batchSize = Math.max(
    100,
    Math.min(
      20_000,
      Number.parseInt(process.env.PMG_MIRROR_BATCH_SIZE ?? "5000", 10) || 5000
    )
  );

  const source = new Pool({ connectionString: sourceUrl, max: 2 });
  const target = new Pool({ connectionString: targetUrl, max: 2 });
  const started = Date.now();
  try {
    await target.query("BEGIN");
    await target.query(erpMirrorTruncateSql(schema));
    await target.query("COMMIT");
  } catch (e) {
    await target.query("ROLLBACK").catch(() => {});
    throw e;
  }

  const counts: Record<string, number> = {};
  try {
    for (const table of ERP_MIRROR_INSERT_ORDER) {
      const n = await copyTable(source, target, schema, table, batchSize);
      counts[table] = n;
      console.log(`  ${table}: ${n} linhas`);
    }
  } finally {
    await source.end();
    await target.end();
  }
  const ms = Date.now() - started;
  console.log(`mirror:sync concluído em ${ms}ms`, counts);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
