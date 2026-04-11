import { getPostgresConnectionString } from "@/lib/db";
import { Pool } from "pg";
import {
  SQL_QUANTIDADE_MARGEM_SYNC_EXTRACT,
  SQL_QUANTIDADE_MARGEM_SYNC_PROJECAO,
} from "@/lib/queries/comercial/quantidade-margem-extract";

const COLS = [
  "cod_empresa",
  "nom_empresa",
  "cod_pdv",
  "cod_operador",
  "nom_operador",
  "nom_usuario_conf",
  "seq_fechamento",
  "seq_venda",
  "dta_fechamento",
  "cod_item",
  "nom_produto",
  "qtd_item",
  "val_custo_estoque",
  "val_liquido",
] as const;

export type QuantidadeMargemCacheSyncResult = {
  rowCount: number;
  rowCountProjecao: number;
  dateStart: string;
  dateEnd: string;
  durationMs: number;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function defaultDateStart(): string {
  const y = new Date().getFullYear();
  return `${y}-01-01`;
}

function defaultDateEnd(): string {
  return new Date().toISOString().slice(0, 10);
}

async function insertBatches(
  target: Pool,
  tableName: "pmg_cache.quantidade_margem" | "pmg_cache.quantidade_margem_projecao",
  rows: Record<string, unknown>[]
): Promise<void> {
  const BATCH = 250;
  for (const batch of chunk(rows, BATCH)) {
    let paramIndex = 1;
    const placeholders = batch
      .map(() => {
        const ps = COLS.map(() => `$${paramIndex++}`);
        return `(${ps.join(", ")})`;
      })
      .join(", ");
    const values: unknown[] = [];
    for (const row of batch) {
      for (const c of COLS) {
        values.push(row[c] ?? null);
      }
    }
    await target.query(
      `INSERT INTO ${tableName} (${COLS.join(", ")}) VALUES ${placeholders}`,
      values
    );
  }
}

let syncInFlight: Promise<QuantidadeMargemCacheSyncResult> | null = null;

/**
 * Lê o ERP (PMG_SOURCE_DATABASE_URL) e recarrega `quantidade_margem` e `quantidade_margem_projecao` na mesma transação.
 * Pedidos simultâneos partilham a mesma execução.
 */
export async function runQuantidadeMargemCacheSync(): Promise<QuantidadeMargemCacheSyncResult> {
  if (syncInFlight) {
    return syncInFlight;
  }
  const run = (async () => {
    const sourceUrl =
      process.env.PMG_SOURCE_DATABASE_URL?.trim() || getPostgresConnectionString();
    const cacheUrl =
      process.env.PMG_CACHE_DATABASE_URL?.trim() ||
      process.env.DATABASE_URL?.trim() ||
      getPostgresConnectionString();

    if (!sourceUrl) {
      throw new Error(
        "Defina PMG_SOURCE_DATABASE_URL ou DATABASE_URL / PGHOST+PGUSER+PGDATABASE para ler o ERP."
      );
    }
    if (!cacheUrl) {
      throw new Error(
        "Defina PMG_CACHE_DATABASE_URL, DATABASE_URL ou PGHOST+PGUSER+PGDATABASE (destino do cache)."
      );
    }

    const dateStart =
      process.env.PMG_SYNC_DATE_START?.trim() || defaultDateStart();
    const dateEnd = process.env.PMG_SYNC_DATE_END?.trim() || defaultDateEnd();

    const source = new Pool({
      connectionString: sourceUrl,
      max: 2,
    });
    const target = new Pool({
      connectionString: cacheUrl,
      max: 2,
    });

    const started = Date.now();
    let inTx = false;
    try {
      const [margemRes, projecaoRes] = await Promise.all([
        source.query<Record<string, unknown>>(SQL_QUANTIDADE_MARGEM_SYNC_EXTRACT, [
          dateStart,
          dateEnd,
        ]),
        source.query<Record<string, unknown>>(SQL_QUANTIDADE_MARGEM_SYNC_PROJECAO, [
          dateStart,
          dateEnd,
        ]),
      ]);
      const rows = margemRes.rows;
      const rowsProj = projecaoRes.rows;

      await target.query("BEGIN");
      inTx = true;
      await target.query("TRUNCATE pmg_cache.quantidade_margem");
      if (rows.length > 0) {
        await insertBatches(target, "pmg_cache.quantidade_margem", rows);
      }
      await target.query("TRUNCATE pmg_cache.quantidade_margem_projecao");
      if (rowsProj.length > 0) {
        await insertBatches(
          target,
          "pmg_cache.quantidade_margem_projecao",
          rowsProj
        );
      }
      await target.query("COMMIT");
      inTx = false;

      const durationMs = Date.now() - started;
      return {
        rowCount: rows.length,
        rowCountProjecao: rowsProj.length,
        dateStart,
        dateEnd,
        durationMs,
      };
    } catch (e) {
      if (inTx) {
        await target.query("ROLLBACK").catch(() => {});
      }
      throw e;
    } finally {
      await source.end();
      await target.end();
    }
  })();

  syncInFlight = run.finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}
