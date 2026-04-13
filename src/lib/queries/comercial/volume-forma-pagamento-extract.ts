/**
 * Quantidade por forma de pagamento — mesma cadeia de JOINs da query de referência:
 * `tab_cupom_fiscal` → `tab_item_cupom_fiscal` → `tab_item` (`cod_subgrupo_item = 1`) → `tab_subgrupo_item` →
 * `tab_pagamento_cupom` → `tab_forma_pagto_pdv` (via `forma_pdv_um`) → `tab_grupo_forma_pagto_rel` (`forma_um_grupo`)
 * → `tab_grupo_forma_pagto`.
 *
 * - **Custo**: a referência fazia `JOIN tab_resumo_venda_item m ON a.seq_fechamento = m.seq_fechamento` sem `cod_item`,
 *   o que multiplica linhas e mistura custos; aqui mantém-se CTE `custo_por_fech_item` por `(seq_fechamento, cod_item)`.
 * - **`forma_um_grupo` / `forma_pdv_um`**: evitam fan-out quando a relação forma↔grupo ou o catálogo PDV têm duplicados.
 * - **Pagamentos**: como na referência, **todas** as linhas de `tab_pagamento_cupom` entram no `COUNT` e no `LEFT JOIN`
 *   (sem filtro por `ind_status`).
 *
 * Parâmetros: `$1`/`$2` datas, `$3` empresa opcional (substitui o `IN (1,5,7,…)` da query fixa).
 */

import { getPool } from "@/lib/db";

export type VolumeFormaPagamentoFiltros = {
  dataInicio: string;
  dataFim: string;
  codEmpresa: number | null;
};

export type VolumeFormaPagamentoRow = {
  cod_empresa: number;
  nom_empresa: string;
  dta_cupom: string;
  des_grupo: string;
  des_forma_pagto: string;
  /** Quantidade (soma de `qtd_item` repartida por pagamento quando aplicável). */
  volume_linha: number;
  val_custo_estoque: number;
};

export const SQL_VOLUME_FORMA_PAGAMENTO = `
WITH cupom_filt AS (
    SELECT a.*
    FROM tab_cupom_fiscal a
    WHERE a.dta_cupom >= $1::date
      AND a.dta_cupom <= $2::date
      AND a.ind_cancelado = 'N'
      AND ($3::bigint IS NULL OR a.cod_empresa = $3)
),
pag_por_cupom AS (
    SELECT b.seq_cupom, COUNT(*)::numeric AS n_pag
    FROM tab_pagamento_cupom b
    WHERE EXISTS (SELECT 1 FROM cupom_filt cf WHERE cf.seq_cupom = b.seq_cupom)
    GROUP BY b.seq_cupom
),
custo_por_fech_item AS (
    SELECT
        m.seq_fechamento,
        m.cod_item,
        COALESCE(SUM(CAST(d.val_movimento_estoque AS NUMERIC(15, 2))), 0) AS val_custo
    FROM tab_resumo_venda_item m
    LEFT JOIN tab_movimento_estoque d ON d.seq_movimento = m.seq_movimento_estoque
    WHERE EXISTS (SELECT 1 FROM cupom_filt cf WHERE cf.seq_fechamento = m.seq_fechamento)
    GROUP BY m.seq_fechamento, m.cod_item
),
forma_um_grupo AS (
    SELECT DISTINCT ON (r.cod_forma_pagto)
        r.cod_forma_pagto,
        r.cod_grupo
    FROM tab_grupo_forma_pagto_rel r
    ORDER BY r.cod_forma_pagto, r.cod_grupo
),
forma_pdv_um AS (
    SELECT DISTINCT ON (f.cod_forma_pagto)
        f.cod_forma_pagto,
        f.des_forma_pagto
    FROM tab_forma_pagto_pdv f
    ORDER BY f.cod_forma_pagto
)
SELECT
    a.cod_empresa,
    TRIM(MAX(COALESCE(h.nom_fantasia, ''))) AS nom_empresa,
    (a.dta_cupom)::date AS dta_cupom,
    CASE
        WHEN COALESCE(MAX(ppc.n_pag), 0) = 0 THEN 'Sem pagamento registado'
        WHEN MAX(qq.cod_grupo) IS NULL AND MAX(b.cod_forma_pagto) IS NOT NULL THEN 'Forma sem grupo (cadastro)'
        ELSE TRIM(COALESCE(MAX(rr.des_grupo), '(sem grupo)'))
    END AS des_grupo,
    CASE
        WHEN COALESCE(MAX(ppc.n_pag), 0) = 0 THEN 'Sem pagamento'
        ELSE TRIM(
            COALESCE(
                NULLIF(TRIM(MAX(COALESCE(cu.des_forma_pagto, ''))), ''),
                NULLIF(TRIM(MAX(COALESCE(b.des_forma_pagto_ecf, ''))), ''),
                'Forma não identificada'
            )
        )
    END AS des_forma_pagto,
    SUM(
        CASE
            WHEN COALESCE(ppc.n_pag, 0) > 0 AND b.seq_cupom IS NOT NULL
            THEN COALESCE(e.qtd_item, 0)::numeric / NULLIF(ppc.n_pag, 0)
            ELSE COALESCE(e.qtd_item, 0)::numeric
        END
    )::double precision AS volume_linha,
    MAX(cfi.val_custo)::double precision AS val_custo_estoque
FROM cupom_filt a
JOIN tab_item_cupom_fiscal e ON a.seq_cupom = e.seq_cupom AND e.ind_cancelado = 'N'
JOIN tab_item f ON f.cod_item = e.cod_item AND f.cod_subgrupo_item = 1
JOIN tab_subgrupo_item g ON g.cod_subgrupo_item = f.cod_subgrupo_item
JOIN tab_empresa h ON h.cod_empresa = a.cod_empresa
LEFT JOIN pag_por_cupom ppc ON ppc.seq_cupom = a.seq_cupom
LEFT JOIN custo_por_fech_item cfi
    ON cfi.seq_fechamento = a.seq_fechamento AND cfi.cod_item = e.cod_item
LEFT JOIN tab_pagamento_cupom b ON b.seq_cupom = a.seq_cupom
LEFT JOIN forma_pdv_um cu ON cu.cod_forma_pagto = b.cod_forma_pagto
LEFT JOIN forma_um_grupo qq ON qq.cod_forma_pagto = b.cod_forma_pagto
LEFT JOIN tab_grupo_forma_pagto rr ON rr.cod_grupo = qq.cod_grupo
GROUP BY
    a.cod_empresa,
    (a.dta_cupom)::date,
    COALESCE(rr.cod_grupo, -1),
    COALESCE(b.cod_forma_pagto, -1),
    a.seq_fechamento,
    a.seq_cupom,
    e.seq_item,
    e.cod_item
ORDER BY
    a.cod_empresa,
    (a.dta_cupom)::date,
    des_grupo,
    des_forma_pagto
`;

export async function fetchVolumeFormaPagamento(
  filtros: VolumeFormaPagamentoFiltros
): Promise<VolumeFormaPagamentoRow[]> {
  const { rows } = await getPool().query<VolumeFormaPagamentoRow>(SQL_VOLUME_FORMA_PAGAMENTO, [
    filtros.dataInicio,
    filtros.dataFim,
    filtros.codEmpresa,
  ]);
  return rows.map((r) => ({
    ...r,
    nom_empresa: r.nom_empresa?.trim() ? r.nom_empresa : `Empresa ${r.cod_empresa}`,
    des_grupo: (r.des_grupo ?? "").trim() || "(sem grupo)",
    des_forma_pagto: (r.des_forma_pagto ?? "").trim() || "(sem forma)",
    volume_linha: Number(r.volume_linha) || 0,
    val_custo_estoque: Number(r.val_custo_estoque) || 0,
  }));
}
