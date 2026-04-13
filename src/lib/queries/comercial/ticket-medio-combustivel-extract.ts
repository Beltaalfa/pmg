/**
 * Ticket médio combustível — mesma base que `valor-forma-pagamento-extract`:
 * `cupom_filt` + `tab_item_cupom_fiscal` + `tab_item` (subgrupo 1) + `resumo_val_liquido_linha`
 * (`seq_venda = seq_cupom`). Valor da linha: `COALESCE(val_liquido, val_total_item)`.
 * Sem `tab_pagamento_cupom` (não reparte por forma de pagamento).
 *
 * Faixas de litragem por linha de item (`qtd_item`), alinhadas ao relatório tipo PBI.
 */

import { getPool } from "@/lib/db";

export type TicketMedioCombustivelFiltros = {
  dataInicio: string;
  dataFim: string;
  codEmpresa: number | null;
};

/** Uma linha da resposta: nível `empresa` | `item` (combustível) | `faixa`. */
export type TicketMedioCombustivelRow = {
  nivel: "empresa" | "item" | "faixa";
  cod_empresa: number;
  nom_empresa: string;
  cod_item: number | null;
  des_item: string | null;
  faixa_litros: string | null;
  cupons_emitidos: number;
  volume_medio: number;
  volume_total: number;
  ticket_medio: number;
  faturamento_total: number;
};

export const SQL_TICKET_MEDIO_COMBUSTIVEL = `
WITH cupom_filt AS (
    SELECT a.*
    FROM tab_cupom_fiscal a
    WHERE a.dta_cupom >= $1::date
      AND a.dta_cupom <= $2::date
      AND a.ind_cancelado = 'N'
      AND ($3::bigint IS NULL OR a.cod_empresa = $3)
),
resumo_val_liquido_linha AS (
    SELECT
        m.seq_fechamento,
        m.seq_venda,
        m.cod_item,
        SUM(CAST(m.val_liquido AS NUMERIC(15, 4)))::double precision AS val_liquido
    FROM tab_resumo_venda_item m
    WHERE EXISTS (SELECT 1 FROM cupom_filt cf WHERE cf.seq_fechamento = m.seq_fechamento)
    GROUP BY m.seq_fechamento, m.seq_venda, m.cod_item
),
linhas AS (
    SELECT
        a.cod_empresa,
        a.seq_cupom,
        e.cod_item,
        e.qtd_item,
        COALESCE(mvl.val_liquido, e.val_total_item, 0)::numeric AS val_linha,
        TRIM(f.des_item) AS des_item,
        CASE
            WHEN e.qtd_item >= 400 THEN '400+'
            WHEN e.qtd_item >= 350 THEN '350 a 400'
            WHEN e.qtd_item >= 300 THEN '300 a 350'
            WHEN e.qtd_item >= 250 THEN '250 a 300'
            WHEN e.qtd_item >= 200 THEN '200 a 250'
            WHEN e.qtd_item >= 150 THEN '150 a 200'
            WHEN e.qtd_item >= 100 THEN '100 a 150'
            WHEN e.qtd_item >= 50 THEN '50 a 100'
            ELSE '0 a 50'
        END AS faixa_litros
    FROM cupom_filt a
    JOIN tab_item_cupom_fiscal e ON a.seq_cupom = e.seq_cupom AND e.ind_cancelado = 'N'
    JOIN tab_item f ON f.cod_item = e.cod_item AND f.cod_subgrupo_item = 1
    JOIN tab_subgrupo_item g ON g.cod_subgrupo_item = f.cod_subgrupo_item
    LEFT JOIN resumo_val_liquido_linha mvl
        ON mvl.seq_fechamento = a.seq_fechamento
        AND mvl.seq_venda = a.seq_cupom
        AND mvl.cod_item = e.cod_item
),
agg_faixa AS (
    SELECT
        'faixa'::text AS nivel,
        l.cod_empresa,
        TRIM(MAX(COALESCE(h.nom_fantasia, ''))) AS nom_empresa,
        l.cod_item,
        MAX(l.des_item) AS des_item,
        l.faixa_litros,
        COUNT(DISTINCT l.seq_cupom)::double precision AS cupons_emitidos,
        SUM(l.qtd_item)::double precision AS volume_total,
        SUM(l.val_linha)::double precision AS faturamento_total,
        (SUM(l.qtd_item) / NULLIF(COUNT(DISTINCT l.seq_cupom)::numeric, 0))::double precision AS volume_medio,
        (SUM(l.val_linha) / NULLIF(COUNT(DISTINCT l.seq_cupom)::numeric, 0))::double precision AS ticket_medio
    FROM linhas l
    JOIN tab_empresa h ON h.cod_empresa = l.cod_empresa
    GROUP BY l.cod_empresa, l.cod_item, l.faixa_litros
),
agg_item AS (
    SELECT
        'item'::text AS nivel,
        l.cod_empresa,
        TRIM(MAX(COALESCE(h.nom_fantasia, ''))) AS nom_empresa,
        l.cod_item,
        MAX(l.des_item) AS des_item,
        NULL::text AS faixa_litros,
        COUNT(DISTINCT l.seq_cupom)::double precision AS cupons_emitidos,
        SUM(l.qtd_item)::double precision AS volume_total,
        SUM(l.val_linha)::double precision AS faturamento_total,
        (SUM(l.qtd_item) / NULLIF(COUNT(DISTINCT l.seq_cupom)::numeric, 0))::double precision AS volume_medio,
        (SUM(l.val_linha) / NULLIF(COUNT(DISTINCT l.seq_cupom)::numeric, 0))::double precision AS ticket_medio
    FROM linhas l
    JOIN tab_empresa h ON h.cod_empresa = l.cod_empresa
    GROUP BY l.cod_empresa, l.cod_item
),
agg_empresa AS (
    SELECT
        'empresa'::text AS nivel,
        l.cod_empresa,
        TRIM(MAX(COALESCE(h.nom_fantasia, ''))) AS nom_empresa,
        NULL::integer AS cod_item,
        NULL::text AS des_item,
        NULL::text AS faixa_litros,
        COUNT(DISTINCT l.seq_cupom)::double precision AS cupons_emitidos,
        SUM(l.qtd_item)::double precision AS volume_total,
        SUM(l.val_linha)::double precision AS faturamento_total,
        (SUM(l.qtd_item) / NULLIF(COUNT(DISTINCT l.seq_cupom)::numeric, 0))::double precision AS volume_medio,
        (SUM(l.val_linha) / NULLIF(COUNT(DISTINCT l.seq_cupom)::numeric, 0))::double precision AS ticket_medio
    FROM linhas l
    JOIN tab_empresa h ON h.cod_empresa = l.cod_empresa
    GROUP BY l.cod_empresa
)
SELECT
    nivel,
    cod_empresa,
    nom_empresa,
    cod_item,
    des_item,
    faixa_litros,
    cupons_emitidos,
    volume_medio,
    volume_total,
    ticket_medio,
    faturamento_total
FROM agg_empresa
UNION ALL
SELECT
    nivel,
    cod_empresa,
    nom_empresa,
    cod_item,
    des_item,
    faixa_litros,
    cupons_emitidos,
    volume_medio,
    volume_total,
    ticket_medio,
    faturamento_total
FROM agg_item
UNION ALL
SELECT
    nivel,
    cod_empresa,
    nom_empresa,
    cod_item,
    des_item,
    faixa_litros,
    cupons_emitidos,
    volume_medio,
    volume_total,
    ticket_medio,
    faturamento_total
FROM agg_faixa
`;

const FAIXA_ORDER = [
  "0 a 50",
  "50 a 100",
  "100 a 150",
  "150 a 200",
  "200 a 250",
  "250 a 300",
  "300 a 350",
  "350 a 400",
  "400+",
] as const;

function faixaSortKey(f: string | null): number {
  if (!f) return -1;
  const i = FAIXA_ORDER.indexOf(f as (typeof FAIXA_ORDER)[number]);
  return i >= 0 ? i : 99;
}

/** Empresa → item → faixa (para tabela hierárquica). */
export function sortTicketMedioCombustivelRows(
  rows: TicketMedioCombustivelRow[]
): TicketMedioCombustivelRow[] {
  return [...rows].sort((a, b) => {
    if (a.cod_empresa !== b.cod_empresa) return a.cod_empresa - b.cod_empresa;
    if (a.nivel === "empresa" && b.nivel !== "empresa") return -1;
    if (b.nivel === "empresa" && a.nivel !== "empresa") return 1;
    const ai = a.cod_item ?? -1;
    const bi = b.cod_item ?? -1;
    if (ai !== bi) return ai - bi;
    if (a.nivel === "item" && b.nivel === "faixa") return -1;
    if (a.nivel === "faixa" && b.nivel === "item") return 1;
    return faixaSortKey(a.faixa_litros) - faixaSortKey(b.faixa_litros);
  });
}

export async function fetchTicketMedioCombustivel(
  filtros: TicketMedioCombustivelFiltros
): Promise<TicketMedioCombustivelRow[]> {
  const { rows } = await getPool().query<
    Omit<TicketMedioCombustivelRow, "nivel"> & { nivel: string }
  >(SQL_TICKET_MEDIO_COMBUSTIVEL, [filtros.dataInicio, filtros.dataFim, filtros.codEmpresa]);

  const mapped: TicketMedioCombustivelRow[] = rows.map((r) => ({
    nivel:
      r.nivel === "empresa" || r.nivel === "item" || r.nivel === "faixa"
        ? (r.nivel as TicketMedioCombustivelRow["nivel"])
        : "faixa",
    cod_empresa: Number(r.cod_empresa),
    nom_empresa: (r.nom_empresa ?? "").trim() || `Empresa ${r.cod_empresa}`,
    cod_item: r.cod_item != null ? Number(r.cod_item) : null,
    des_item: r.des_item != null ? String(r.des_item).trim() : null,
    faixa_litros: r.faixa_litros ?? null,
    cupons_emitidos: Number(r.cupons_emitidos) || 0,
    volume_medio: Number(r.volume_medio) || 0,
    volume_total: Number(r.volume_total) || 0,
    ticket_medio: Number(r.ticket_medio) || 0,
    faturamento_total: Number(r.faturamento_total) || 0,
  }));
  return sortTicketMedioCombustivelRows(mapped);
}
