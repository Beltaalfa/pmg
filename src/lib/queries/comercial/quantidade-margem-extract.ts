/**
 * SQL alinhado ao Power BI (mesmo `GROUP BY` e joins).
 * Únicas extensões: `JOIN tab_empresa` + `nom_empresa`, nome do produto `nom_produto` via `tab_item`;
 * período `$1`–`$2` e filtros opcionais `$3` empresa / `$4` item para a API.
 * Inclui **`m.seq_venda`** no `GROUP BY` — chave da linha em `tab_resumo_venda_item` (evita fundir vendas).
 * A matriz soma **`m.qtd_item`** por empresa/produto.
 * Exclui fechamentos do operador indicado (alinhado ao relatório de referência).
 * Apenas itens com **`tab_item.cod_subgrupo_item = 1`** (via alias `qq`).
 */

/** Código de operador cujos fechamentos não entram no relatório Quantidade × Margem. */
export const QUANTIDADE_MARGEM_EXCLUIR_OPERADOR = 367;

/** Aba Vendas TRR: empresa e operador fixos (alinhado ao Power BI). */
export const PMG_VENDAS_TRR_COD_EMPRESA = 7;
export const PMG_VENDAS_TRR_COD_OPERADOR = QUANTIDADE_MARGEM_EXCLUIR_OPERADOR;

/** Só itens deste subgrupo entram no relatório (alinhado ao Power BI). */
export const QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM = 1;

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
    m.qtd_item,
    SUM(COALESCE(CAST(d.val_movimento_estoque AS NUMERIC(15, 2)), 0)) AS val_custo_estoque,
    m.val_liquido
FROM tab_resumo_venda_item m
JOIN tab_fechamento_caixa_pdv i ON m.seq_fechamento = i.seq_fechamento
JOIN tab_pdv o ON o.cod_pdv = i.cod_pdv
JOIN tab_empresa h ON h.cod_empresa = o.cod_empresa
JOIN tab_item qq ON qq.cod_item = m.cod_item
LEFT JOIN tab_movimento_estoque d ON d.seq_movimento = m.seq_movimento_estoque
WHERE i.dta_fechamento >= $1::date
  AND i.dta_fechamento <= $2::date
  AND i.ind_status NOT IN ('C')
  AND (i.cod_operador IS DISTINCT FROM ${QUANTIDADE_MARGEM_EXCLUIR_OPERADOR})
  AND qq.cod_subgrupo_item = ${QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM}
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
    SUM(COALESCE(CAST(d.val_movimento_estoque AS NUMERIC(15, 2)), 0)) AS val_custo_estoque,
    m.val_liquido
FROM tab_resumo_venda_item m
JOIN tab_fechamento_caixa_pdv i ON m.seq_fechamento = i.seq_fechamento
JOIN tab_pdv o ON o.cod_pdv = i.cod_pdv
JOIN tab_empresa h ON h.cod_empresa = o.cod_empresa
JOIN tab_item qq ON qq.cod_item = m.cod_item
LEFT JOIN tab_movimento_estoque d ON d.seq_movimento = m.seq_movimento_estoque
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
    SUM(COALESCE(CAST(d.val_movimento_estoque AS NUMERIC(15, 2)), 0)) AS val_custo_estoque,
    m.val_liquido
FROM tab_resumo_venda_item m
JOIN tab_fechamento_caixa_pdv i ON m.seq_fechamento = i.seq_fechamento
JOIN tab_pdv o ON o.cod_pdv = i.cod_pdv
JOIN tab_empresa h ON h.cod_empresa = o.cod_empresa
JOIN tab_item qq ON qq.cod_item = m.cod_item
LEFT JOIN tab_movimento_estoque d ON d.seq_movimento = m.seq_movimento_estoque
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
    SUM(COALESCE(CAST(d.val_movimento_estoque AS NUMERIC(15, 2)), 0)) AS val_custo_estoque,
    m.val_liquido
FROM tab_resumo_venda_item m
JOIN tab_fechamento_caixa_pdv i ON m.seq_fechamento = i.seq_fechamento
JOIN tab_pdv o ON o.cod_pdv = i.cod_pdv
JOIN tab_empresa h ON h.cod_empresa = o.cod_empresa
JOIN tab_item qq ON qq.cod_item = m.cod_item
LEFT JOIN tab_movimento_estoque d ON d.seq_movimento = m.seq_movimento_estoque
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
    m.qtd_item,
    m.val_liquido
ORDER BY
    o.cod_empresa,
    m.seq_fechamento,
    m.seq_venda,
    m.cod_item
`;
