import { getPool } from "@/lib/db";
import {
  QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM,
  QUANTIDADE_MARGEM_SUBGRUPO_TODOS,
} from "@/lib/queries/comercial/quantidade-margem-extract";
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

/** `tab_subgrupo_item.des_subgrupo_item` (espelho ERP). */
const SQL_SUBCATEGORIAS = `
SELECT
  sg.cod_subgrupo_item AS cod,
  TRIM(sg.des_subgrupo_item) AS nome
FROM tab_subgrupo_item sg
ORDER BY sg.cod_subgrupo_item
`;

export type FetchQuantidadeMargemLookupsOpts = {
  /** Filtra a lista de itens por `cod_subgrupo_item`; omisso = subgrupo padrão (1); `-1` = todos os itens. */
  codSubgrupoItem?: number | null;
};

const SQL_ITENS_POR_SUBGRUPO = `
SELECT
  cod_item,
  TRIM(des_item) AS nome
FROM tab_item
WHERE cod_subgrupo_item = $1::bigint
ORDER BY nome
`;

const SQL_ITENS_TODOS = `
SELECT
  cod_item,
  TRIM(des_item) AS nome
FROM tab_item
ORDER BY nome
`;

export async function fetchQuantidadeMargemLookups(
  opts?: FetchQuantidadeMargemLookupsOpts
): Promise<QuantidadeMargemLookupsPayload> {
  const pool = getPool();
  const rawSg = opts?.codSubgrupoItem;
  const subForItens =
    rawSg === QUANTIDADE_MARGEM_SUBGRUPO_TODOS
      ? QUANTIDADE_MARGEM_SUBGRUPO_TODOS
      : rawSg !== undefined && rawSg !== null
        ? rawSg
        : QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM;

  const itPromise =
    subForItens === QUANTIDADE_MARGEM_SUBGRUPO_TODOS
      ? pool.query<{ cod_item: number; nome: string }>(SQL_ITENS_TODOS)
      : pool.query<{ cod_item: number; nome: string }>(SQL_ITENS_POR_SUBGRUPO, [subForItens]);

  const [emp, sub, it] = await Promise.all([
    pool.query<{ cod_empresa: number; nome: string }>(SQL_EMPRESAS),
    pool.query<{ cod: number; nome: string }>(SQL_SUBCATEGORIAS),
    itPromise,
  ]);

  return {
    empresas: emp.rows.map((r) => ({ cod: Number(r.cod_empresa), nome: String(r.nome) })),
    subcategorias: sub.rows.map((r) => ({ cod: Number(r.cod), nome: String(r.nome) })),
    itens: it.rows.map((r) => ({ cod: Number(r.cod_item), nome: String(r.nome) })),
  };
}
