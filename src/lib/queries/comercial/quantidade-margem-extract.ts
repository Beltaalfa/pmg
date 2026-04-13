/**
 * SQL alinhado ao Power BI (mesmo `GROUP BY` e joins).
 * Únicas extensões: `JOIN tab_empresa` + `nom_empresa`, nome do produto `nom_produto` via `tab_item`;
 * período `$1`–`$2` e filtros opcionais `$3` empresa / `$4` item para a API.
 * Inclui **`m.seq_venda`** no `GROUP BY` — chave da linha em `tab_resumo_venda_item` (evita fundir vendas).
 * A matriz soma **`m.qtd_item`** por empresa/produto.
 * **Valor de custo** (coluna/medida Power BI no grão da linha de `tab_resumo_venda_item`): aqui = soma de
 * `tab_movimento_estoque.val_movimento_estoque` do movimento `m.seq_movimento_estoque` (subconsulta — evita fan-out do
 * JOIN). Alinhar ao PBI: **Valor Custo Unitário** = DIVIDE( SUM(Valor de custo), SUM(Quant item) ); **Valor Unitário**
 * = DIVIDE( SUM(Valor líquido), SUM(Quant item) ) — `Quant item` = `m.qtd_item`, `Valor líquido` = `m.val_liquido`.
 * Exclui fechamentos do operador indicado (alinhado ao relatório de referência).
 * Subgrupo de item: parâmetro `$5` — `COALESCE($5, 1)` quando omitido (API).
 */

/** Código de operador cujos fechamentos não entram no relatório Quantidade × Margem. */
export const QUANTIDADE_MARGEM_EXCLUIR_OPERADOR = 367;

/** Aba Vendas TRR: empresa e operador fixos (alinhado ao Power BI). */
export const PMG_VENDAS_TRR_COD_EMPRESA = 7;
export const PMG_VENDAS_TRR_COD_OPERADOR = QUANTIDADE_MARGEM_EXCLUIR_OPERADOR;

/** Só itens deste subgrupo entram no relatório (alinhado ao Power BI). */
export const QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM = 1;

/** Parâmetro `$5` na API: não filtrar por `cod_subgrupo_item` (todas as subcategorias). */
export const QUANTIDADE_MARGEM_SUBGRUPO_TODOS = -1;

/**
 * Valor de custo da linha de `tab_resumo_venda_item` (alias `m`), alinhado ao Power BI:
 * custo do movimento de stock referenciado — sem JOIN que multiplique linhas de `m`.
 */
const SQL_VAL_CUSTO_RESUMO_LINHA = `(
  SELECT COALESCE(SUM(CAST(d2.val_movimento_estoque AS NUMERIC(15, 2))), 0)
  FROM tab_movimento_estoque d2
  WHERE d2.seq_movimento = m.seq_movimento_estoque
)`;

export const SQL_QUANTIDADE_MARGEM_DIRECT = `
SELECT
    o.cod_empresa,
    MAX(h.nom_fantasia) AS nom_empresa,
    o.cod_pdv,
    i.cod_operador,
    i.nom_operador,
    i.nom_usuario_conf,
    m.seq_fechamento,
    m.seq_venda,
    i.dta_fechamento,
    m.cod_item,
    MAX(TRIM(qq.des_item)) AS nom_produto,
    qq.cod_subgrupo_item,
    MAX(TRIM(sgi.des_subgrupo_item)) AS nom_subgrupo_item,
    m.qtd_item,
    ${SQL_VAL_CUSTO_RESUMO_LINHA} AS val_custo_estoque,
    m.val_liquido
FROM tab_resumo_venda_item m
JOIN tab_fechamento_caixa_pdv i ON m.seq_fechamento = i.seq_fechamento
JOIN tab_pdv o ON o.cod_pdv = i.cod_pdv
JOIN tab_empresa h ON h.cod_empresa = o.cod_empresa
JOIN tab_item qq ON qq.cod_item = m.cod_item
LEFT JOIN tab_subgrupo_item sgi ON sgi.cod_subgrupo_item = qq.cod_subgrupo_item
WHERE i.dta_fechamento >= $1::date
  AND i.dta_fechamento <= $2::date
  AND i.ind_status NOT IN ('C')
  AND (i.cod_operador IS DISTINCT FROM ${QUANTIDADE_MARGEM_EXCLUIR_OPERADOR})
  AND (
    ($5::bigint IS NOT DISTINCT FROM ${QUANTIDADE_MARGEM_SUBGRUPO_TODOS}::bigint)
    OR qq.cod_subgrupo_item = COALESCE($5::bigint, ${QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM}::bigint)
  )
  AND ($3::bigint IS NULL OR o.cod_empresa = $3)
  AND ($4::bigint IS NULL OR m.cod_item = $4)
GROUP BY
    o.cod_empresa,
    o.cod_pdv,
    i.cod_operador,
    i.nom_operador,
    i.nom_usuario_conf,
    m.seq_fechamento,
    m.seq_venda,
    i.dta_fechamento,
    m.cod_item,
    qq.cod_subgrupo_item,
    m.seq_movimento_estoque,
    m.qtd_item,
    m.val_liquido
ORDER BY
    o.cod_empresa,
    m.seq_fechamento,
    m.seq_venda,
    m.cod_item
`;

/** Igual ao DIRECT, mas **inclui** o operador 367 — relatório “até o dia e projeção”. */
export const SQL_QUANTIDADE_MARGEM_DIRECT_PROJECAO = `
SELECT
    o.cod_empresa,
    MAX(h.nom_fantasia) AS nom_empresa,
    o.cod_pdv,
    i.cod_operador,
    i.nom_operador,
    i.nom_usuario_conf,
    m.seq_fechamento,
    m.seq_venda,
    i.dta_fechamento,
    m.cod_item,
    MAX(TRIM(qq.des_item)) AS nom_produto,
    m.qtd_item,
    ${SQL_VAL_CUSTO_RESUMO_LINHA} AS val_custo_estoque,
    m.val_liquido
FROM tab_resumo_venda_item m
JOIN tab_fechamento_caixa_pdv i ON m.seq_fechamento = i.seq_fechamento
JOIN tab_pdv o ON o.cod_pdv = i.cod_pdv
JOIN tab_empresa h ON h.cod_empresa = o.cod_empresa
JOIN tab_item qq ON qq.cod_item = m.cod_item
WHERE i.dta_fechamento >= $1::date
  AND i.dta_fechamento <= $2::date
  AND i.ind_status NOT IN ('C')
  AND qq.cod_subgrupo_item = ${QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM}
  AND ($3::bigint IS NULL OR o.cod_empresa = $3)
  AND ($4::bigint IS NULL OR m.cod_item = $4)
  AND ($5::bigint IS NULL OR i.cod_operador = $5)
GROUP BY
    o.cod_empresa,
    o.cod_pdv,
    i.cod_operador,
    i.nom_operador,
    i.nom_usuario_conf,
    m.seq_fechamento,
    m.seq_venda,
    i.dta_fechamento,
    m.cod_item,
    m.seq_movimento_estoque,
    m.qtd_item,
    m.val_liquido
ORDER BY
    o.cod_empresa,
    m.seq_fechamento,
    m.seq_venda,
    m.cod_item
`;

/** Igual ao DIRECT, sem filtros opcionais de empresa/item — job de sync do cache. */
export const SQL_QUANTIDADE_MARGEM_SYNC_EXTRACT = `
SELECT
    o.cod_empresa,
    MAX(h.nom_fantasia) AS nom_empresa,
    o.cod_pdv,
    i.cod_operador,
    i.nom_operador,
    i.nom_usuario_conf,
    m.seq_fechamento,
    m.seq_venda,
    i.dta_fechamento,
    m.cod_item,
    MAX(TRIM(qq.des_item)) AS nom_produto,
    m.qtd_item,
    ${SQL_VAL_CUSTO_RESUMO_LINHA} AS val_custo_estoque,
    m.val_liquido
FROM tab_resumo_venda_item m
JOIN tab_fechamento_caixa_pdv i ON m.seq_fechamento = i.seq_fechamento
JOIN tab_pdv o ON o.cod_pdv = i.cod_pdv
JOIN tab_empresa h ON h.cod_empresa = o.cod_empresa
JOIN tab_item qq ON qq.cod_item = m.cod_item
WHERE i.dta_fechamento >= $1::date
  AND i.dta_fechamento <= $2::date
  AND i.ind_status NOT IN ('C')
  AND (i.cod_operador IS DISTINCT FROM ${QUANTIDADE_MARGEM_EXCLUIR_OPERADOR})
  AND qq.cod_subgrupo_item = ${QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM}
GROUP BY
    o.cod_empresa,
    o.cod_pdv,
    i.cod_operador,
    i.nom_operador,
    i.nom_usuario_conf,
    m.seq_fechamento,
    m.seq_venda,
    i.dta_fechamento,
    m.cod_item,
    m.seq_movimento_estoque,
    m.qtd_item,
    m.val_liquido
ORDER BY
    o.cod_empresa,
    m.seq_fechamento,
    m.seq_venda,
    m.cod_item
`;

/** Sync para `pmg_cache.quantidade_margem_projecao` — sem exclusão de operador. */
export const SQL_QUANTIDADE_MARGEM_SYNC_PROJECAO = `
SELECT
    o.cod_empresa,
    MAX(h.nom_fantasia) AS nom_empresa,
    o.cod_pdv,
    i.cod_operador,
    i.nom_operador,
    i.nom_usuario_conf,
    m.seq_fechamento,
    m.seq_venda,
    i.dta_fechamento,
    m.cod_item,
    MAX(TRIM(qq.des_item)) AS nom_produto,
    m.qtd_item,
    ${SQL_VAL_CUSTO_RESUMO_LINHA} AS val_custo_estoque,
    m.val_liquido
FROM tab_resumo_venda_item m
JOIN tab_fechamento_caixa_pdv i ON m.seq_fechamento = i.seq_fechamento
JOIN tab_pdv o ON o.cod_pdv = i.cod_pdv
JOIN tab_empresa h ON h.cod_empresa = o.cod_empresa
JOIN tab_item qq ON qq.cod_item = m.cod_item
WHERE i.dta_fechamento >= $1::date
  AND i.dta_fechamento <= $2::date
  AND i.ind_status NOT IN ('C')
  AND qq.cod_subgrupo_item = ${QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM}
GROUP BY
    o.cod_empresa,
    o.cod_pdv,
    i.cod_operador,
    i.nom_operador,
    i.nom_usuario_conf,
    m.seq_fechamento,
    m.seq_venda,
    i.dta_fechamento,
    m.cod_item,
    m.seq_movimento_estoque,
    m.qtd_item,
    m.val_liquido
ORDER BY
    o.cod_empresa,
    m.seq_fechamento,
    m.seq_venda,
    m.cod_item
`;
