import { getPool } from "@/lib/db";
import type { QuantidadeMargemRow } from "@/lib/queries/comercial/quantidade-margem-shared";
import {
  QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM,
  QUANTIDADE_MARGEM_EXCLUIR_OPERADOR,
  SQL_QUANTIDADE_MARGEM_DIRECT,
} from "@/lib/queries/comercial/quantidade-margem-extract";

export type { QuantidadeMargemRow } from "@/lib/queries/comercial/quantidade-margem-shared";
export { QUANTIDADE_MARGEM_COLUNAS } from "@/lib/queries/comercial/quantidade-margem-shared";

export type QuantidadeMargemFiltros = {
  dataInicio: string;
  dataFim: string;
  codEmpresa: number | null;
  codItem: number | null;
  /** Filtro opcional por `tab_fechamento_caixa_pdv.cod_operador` / cache `cod_operador`. */
  codOperador: number | null;
};

/** Leitura a partir da tabela de cache local (preenchida pelo job de sync). */
const SQL_QUANTIDADE_MARGEM_CACHE = `
SELECT
    q.cod_empresa,
    q.nom_empresa,
    q.cod_pdv,
    q.cod_operador,
    q.nom_operador,
    q.nom_usuario_conf,
    q.seq_fechamento,
    q.seq_venda,
    q.dta_fechamento,
    q.cod_item,
    q.nom_produto,
    q.qtd_item,
    q.val_custo_estoque,
    q.val_liquido
FROM pmg_cache.quantidade_margem q
JOIN tab_item qq ON qq.cod_item = q.cod_item
WHERE q.dta_fechamento >= $1::date
  AND q.dta_fechamento <= $2::date
  AND (q.cod_operador IS DISTINCT FROM ${QUANTIDADE_MARGEM_EXCLUIR_OPERADOR})
  AND qq.cod_subgrupo_item = ${QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM}
  AND ($3::bigint IS NULL OR q.cod_empresa = $3)
  AND ($4::bigint IS NULL OR q.cod_item = $4)
ORDER BY
    q.cod_empresa,
    q.seq_fechamento,
    q.seq_venda,
    q.cod_item
`;

function quantidadeMargemModoCache(): boolean {
  return process.env.PMG_QUANTIDADE_MARGEM_MODE?.trim().toLowerCase() === "cache";
}

export async function fetchQuantidadeMargemVenda(
  filtros: QuantidadeMargemFiltros
): Promise<QuantidadeMargemRow[]> {
  const sql = quantidadeMargemModoCache()
    ? SQL_QUANTIDADE_MARGEM_CACHE
    : SQL_QUANTIDADE_MARGEM_DIRECT;
  const { rows } = await getPool().query<QuantidadeMargemRow>(sql, [
    filtros.dataInicio,
    filtros.dataFim,
    filtros.codEmpresa,
    filtros.codItem,
  ]);
  return rows;
}

export async function getMargemVendaResumo(_setorId: string): Promise<{
  titulo: string;
  valor: number | null;
} | null> {
  void _setorId;
  return null;
}

export async function getMargemVendaSeriePlaceholder(
  _setorId: string
): Promise<{ periodo: string; valor: number }[]> {
  void _setorId;
  return [];
}

export async function pingAnaliticoComSetor(setorId: string): Promise<boolean> {
  try {
    await getPool().query(`SELECT 1 AS ok, $1::text AS setor_context`, [setorId]);
    return true;
  } catch {
    return false;
  }
}
