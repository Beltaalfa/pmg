import { getPool } from "@/lib/db";
import type { QuantidadeMargemRow } from "@/lib/queries/comercial/quantidade-margem-shared";
import type { QuantidadeMargemFiltros } from "@/lib/queries/comercial/analise-margem-venda";
import {
  QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM,
  SQL_QUANTIDADE_MARGEM_DIRECT_PROJECAO,
} from "@/lib/queries/comercial/quantidade-margem-extract";

export type { QuantidadeMargemFiltros } from "@/lib/queries/comercial/analise-margem-venda";

/** Leitura a partir do cache de projeção (inclui operador 367). */
const SQL_QUANTIDADE_MARGEM_PROJECAO_CACHE = `
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
FROM pmg_cache.quantidade_margem_projecao q
JOIN tab_item qq ON qq.cod_item = q.cod_item
WHERE q.dta_fechamento >= $1::date
  AND q.dta_fechamento <= $2::date
  AND qq.cod_subgrupo_item = ${QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM}
  AND ($3::bigint IS NULL OR q.cod_empresa = $3)
  AND ($4::bigint IS NULL OR q.cod_item = $4)
  AND ($5::bigint IS NULL OR q.cod_operador = $5)
ORDER BY
    q.cod_empresa,
    q.seq_fechamento,
    q.seq_venda,
    q.cod_item
`;

function quantidadeMargemProjecaoModoCache(): boolean {
  return (
    process.env.PMG_QUANTIDADE_MARGEM_PROJECAO_MODE?.trim().toLowerCase() !==
    "direct"
  );
}

export async function fetchQuantidadeMargemProjecao(
  filtros: QuantidadeMargemFiltros
): Promise<QuantidadeMargemRow[]> {
  const sql = quantidadeMargemProjecaoModoCache()
    ? SQL_QUANTIDADE_MARGEM_PROJECAO_CACHE
    : SQL_QUANTIDADE_MARGEM_DIRECT_PROJECAO;
  const { rows } = await getPool().query<QuantidadeMargemRow>(sql, [
    filtros.dataInicio,
    filtros.dataFim,
    filtros.codEmpresa,
    filtros.codItem,
    filtros.codOperador,
  ]);
  return rows;
}
