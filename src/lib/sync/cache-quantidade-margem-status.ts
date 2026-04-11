import { getPool, getPostgresConnectionString } from "@/lib/db";

export type CacheQuantidadeMargemStatus = {
  ok: boolean;
  modoRelatorio: "cache" | "direct";
  rowCount: number | null;
  lastSyncedAt: string | null;
  /** Cache da aba projeção (inclui operador 367). */
  rowCountProjecao: number | null;
  lastSyncedAtProjecao: string | null;
  modoRelatorioProjecao: "cache" | "direct";
  dateWindowStart: string | null;
  dateWindowEnd: string | null;
  sourceConfigured: boolean;
  error?: string;
};

function modoRelatorio(): "cache" | "direct" {
  return process.env.PMG_QUANTIDADE_MARGEM_MODE?.trim().toLowerCase() === "cache"
    ? "cache"
    : "direct";
}

function modoRelatorioProjecao(): "cache" | "direct" {
  return process.env.PMG_QUANTIDADE_MARGEM_PROJECAO_MODE?.trim().toLowerCase() ===
    "direct"
    ? "direct"
    : "cache";
}

function windowFromEnv(): { start: string | null; end: string | null } {
  const y = new Date().getFullYear();
  const defStart = `${y}-01-01`;
  const defEnd = new Date().toISOString().slice(0, 10);
  return {
    start: process.env.PMG_SYNC_DATE_START?.trim() || defStart,
    end: process.env.PMG_SYNC_DATE_END?.trim() || defEnd,
  };
}

/**
 * Estado do cache local (última sync e contagem de linhas).
 */
export async function getCacheQuantidadeMargemStatus(): Promise<CacheQuantidadeMargemStatus> {
  const modo = modoRelatorio();
  const sourceConfigured = Boolean(
    process.env.PMG_SOURCE_DATABASE_URL?.trim() || getPostgresConnectionString()
  );
  const w = windowFromEnv();

  try {
    const { rows } = await getPool().query<{
      n: string;
      last_sync: Date | string | null;
      n_proj: string | null;
      last_proj: Date | string | null;
    }>(
      `SELECT
        (SELECT COUNT(*)::text FROM pmg_cache.quantidade_margem) AS n,
        (SELECT MAX(synced_at) FROM pmg_cache.quantidade_margem) AS last_sync,
        (SELECT COUNT(*)::text FROM pmg_cache.quantidade_margem_projecao) AS n_proj,
        (SELECT MAX(synced_at) FROM pmg_cache.quantidade_margem_projecao) AS last_proj`
    );
    const row = rows[0];
    const last =
      row?.last_sync instanceof Date
        ? row.last_sync.toISOString()
        : row?.last_sync
          ? String(row.last_sync)
          : null;
    const lastProj =
      row?.last_proj instanceof Date
        ? row.last_proj.toISOString()
        : row?.last_proj
          ? String(row.last_proj)
          : null;

    return {
      ok: true,
      modoRelatorio: modo,
      rowCount: row?.n != null ? Number.parseInt(String(row.n), 10) : null,
      lastSyncedAt: last,
      rowCountProjecao:
        row?.n_proj != null ? Number.parseInt(String(row.n_proj), 10) : null,
      lastSyncedAtProjecao: lastProj,
      modoRelatorioProjecao: modoRelatorioProjecao(),
      dateWindowStart: w.start,
      dateWindowEnd: w.end,
      sourceConfigured,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao ler o cache.";
    return {
      ok: false,
      modoRelatorio: modo,
      rowCount: null,
      lastSyncedAt: null,
      rowCountProjecao: null,
      lastSyncedAtProjecao: null,
      modoRelatorioProjecao: modoRelatorioProjecao(),
      dateWindowStart: w.start,
      dateWindowEnd: w.end,
      sourceConfigured,
      error: message,
    };
  }
}
