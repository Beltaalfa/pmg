import { getPool } from "@/lib/db";
import { QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM } from "@/lib/queries/comercial/quantidade-margem-extract";
import type { QuantidadeMargemLookupsPayload } from "@/lib/queries/comercial/quantidade-margem-lookups-shared";

const SQL_EMPRESAS = `
SELECT
  cod_empresa,
  COALESCE(
    NULLIF(TRIM(nom_fantasia), ''),
    NULLIF(TRIM(nom_razao_social), ''),
    'Empresa ' || cod_empresa::text
  ) AS nome
FROM tab_empresa
ORDER BY nome
`;

const SQL_ITENS = `
SELECT
  cod_item,
  TRIM(des_item) AS nome
FROM tab_item
WHERE cod_subgrupo_item = ${QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM}
ORDER BY nome
`;

export async function fetchQuantidadeMargemLookups(): Promise<QuantidadeMargemLookupsPayload> {
  const pool = getPool();
  const [emp, it] = await Promise.all([
    pool.query<{ cod_empresa: number; nome: string }>(SQL_EMPRESAS),
    pool.query<{ cod_item: number; nome: string }>(SQL_ITENS),
  ]);
  return {
    empresas: emp.rows.map((r) => ({ cod: Number(r.cod_empresa), nome: String(r.nome) })),
    itens: it.rows.map((r) => ({ cod: Number(r.cod_item), nome: String(r.nome) })),
  };
}
