import { getPool } from "@/lib/db";

/** Metadados do banco — substitua por KPIs reais em `src/lib/queries.ts`. */
export async function getDatabaseOverview(): Promise<{
  name: string;
  version: string;
} | null> {
  const { rows } = await getPool().query<{ name: string; version: string }>(
    `SELECT current_database() AS name, version() AS version`
  );
  return rows[0] ?? null;
}

/** Contagem de tabelas no schema `public` (exemplo de agregação). */
export async function getPublicTableCount(): Promise<number> {
  const { rows } = await getPool().query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
  );
  return Number.parseInt(rows[0]?.n ?? "0", 10);
}

/**
 * Série diária de exemplo (generate_series + random).
 * Troque por um SELECT com datas e totais das suas tabelas.
 */
export async function getDemoDailySeries(): Promise<{ periodo: string; valor: number }[]> {
  const { rows } = await getPool().query<{ periodo: string; valor: string }>(
    `SELECT to_char(d::date, 'YYYY-MM-DD') AS periodo,
            (random() * 100)::numeric(10,2)::text AS valor
     FROM generate_series(
       (current_date - interval '6 days')::date,
       current_date::date,
       interval '1 day'
     ) AS d
     ORDER BY d`
  );
  return rows.map((r) => ({
    periodo: r.periodo,
    valor: Number.parseFloat(r.valor),
  }));
}

/**
 * Série de exemplo por setor: `setorId` = Hub `Group.id` (não usamos `Sector` / grupos finos).
 *
 * **Produção:** substitua por agregações com `WHERE hub_setor_id = $1`
 * (ver `docs/sector-data-contract.md`).
 */
export async function getDemoDailySeriesForSetor(
  setorId: string
): Promise<{ periodo: string; valor: number }[]> {
  const { rows } = await getPool().query<{ periodo: string; valor: string }>(
    `SELECT to_char(d::date, 'YYYY-MM-DD') AS periodo,
            (abs(hashtext($1::text || d::text)) % 1000000 / 10000.0)::numeric(10,2)::text AS valor
     FROM generate_series(
       (current_date - interval '6 days')::date,
       current_date::date,
       interval '1 day'
     ) AS d
     ORDER BY d`,
    [setorId]
  );
  return rows.map((r) => ({
    periodo: r.periodo,
    valor: Number.parseFloat(r.valor),
  }));
}

/** Amostra de tabelas em `public` para a grade (somente nomes). */
export async function getPublicTableNamesSample(limit = 15): Promise<string[]> {
  const { rows } = await getPool().query<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => r.table_name);
}
