/**
 * Lê metadados na produção (apenas SELECT em pg_catalog) e gera CREATE TABLE para o Postgres North.
 * Não altera a produção.
 */
import "dotenv/config";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { Pool } from "pg";
import { ERP_MIRROR_TABLES } from "../src/lib/erp-mirror/tables";

const OUT = join(process.cwd(), "deploy/sql/mirror/generated_schema.sql");

function qIdent(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

function qualifyTable(schema: string, table: string): string {
  return schema === "public" ? qIdent(table) : `${qIdent(schema)}.${qIdent(table)}`;
}

async function tableExists(
  pool: Pool,
  schema: string,
  table: string
): Promise<boolean> {
  const { rows } = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM pg_catalog.pg_class c
     JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind = 'r'`,
    [schema, table]
  );
  return rows.length > 0;
}

async function getColumns(
  pool: Pool,
  schema: string,
  table: string
): Promise<{ name: string; typ: string; notNull: boolean }[]> {
  const { rows } = await pool.query<{
    name: string;
    typ: string;
    notnull: boolean;
  }>(
    `SELECT a.attname AS name,
            pg_catalog.format_type(a.atttypid, a.atttypmod) AS typ,
            a.attnotnull AS notnull
     FROM pg_catalog.pg_attribute a
     JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
     JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
     WHERE n.nspname = $1 AND c.relname = $2
       AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum`,
    [schema, table]
  );
  return rows.map((r) => ({
    name: r.name,
    typ: r.typ,
    notNull: r.notnull,
  }));
}

async function main(): Promise<void> {
  const sourceUrl = process.env.PMG_SOURCE_DATABASE_URL?.trim();
  if (!sourceUrl) {
    throw new Error(
      "Defina PMG_SOURCE_DATABASE_URL (leitura na produção / ERP)."
    );
  }
  const schema = process.env.PMG_SOURCE_SCHEMA?.trim() || "public";

  const pool = new Pool({ connectionString: sourceUrl, max: 2 });
  try {
    const parts: string[] = [
      "-- Gerado por npm run mirror:introspect — não editar à mão.",
      "-- Aplicar no Postgres North: psql \"$DATABASE_URL\" -f deploy/sql/mirror/generated_schema.sql",
      "",
      "SET client_encoding = 'UTF8';",
      "",
    ];

    for (const table of ERP_MIRROR_TABLES) {
      const ok = await tableExists(pool, schema, table);
      if (!ok) {
        throw new Error(
          `Tabela ${schema}.${table} não existe na origem (ou sem permissão SELECT).`
        );
      }
      const cols = await getColumns(pool, schema, table);
      if (!cols.length) {
        throw new Error(`Sem colunas legíveis em ${schema}.${table}.`);
      }
      const lines = cols.map((c) => {
        const nn = c.notNull ? " NOT NULL" : "";
        return `  ${qIdent(c.name)} ${c.typ}${nn}`;
      });
      parts.push(`CREATE TABLE IF NOT EXISTS ${qualifyTable(schema, table)} (`);
      parts.push(lines.join(",\n"));
      parts.push(");");
      parts.push("");
    }

    const dir = dirname(OUT);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(OUT, parts.join("\n"), "utf8");
    console.log(`Escrito: ${OUT} (${ERP_MIRROR_TABLES.length} tabelas, schema=${schema}).`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
