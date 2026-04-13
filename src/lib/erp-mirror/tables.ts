/**
 * Tabelas ERP espelhadas no North (SELECT na prod, DDL/sync só no mirror).
 * Alinhado a `quantidade-margem-extract`, `volume-forma-pagamento-extract` e
 * `valor-forma-pagamento-extract` (usa `tab_resumo_venda_item` para `val_liquido`).
 *
 * Para incluir mais tabelas: acrescente o nome aqui, volte a correr introspect e sync.
 */
export const ERP_MIRROR_TABLES = [
  "tab_empresa",
  "tab_subgrupo_item",
  "tab_item",
  "tab_pdv",
  "tab_fechamento_caixa_pdv",
  "tab_movimento_estoque",
  "tab_resumo_venda_item",
  "tab_grupo_forma_pagto",
  "tab_forma_pagto_pdv",
  "tab_grupo_forma_pagto_rel",
  "tab_cupom_fiscal",
  "tab_item_cupom_fiscal",
  "tab_pagamento_cupom",
] as const;

export type ErpMirrorTable = (typeof ERP_MIRROR_TABLES)[number];

/** Ordem de INSERT respeitando FKs típicas entre estas tabelas. */
export const ERP_MIRROR_INSERT_ORDER: readonly ErpMirrorTable[] = [
  "tab_empresa",
  "tab_subgrupo_item",
  "tab_item",
  "tab_pdv",
  "tab_fechamento_caixa_pdv",
  "tab_movimento_estoque",
  "tab_resumo_venda_item",
  "tab_grupo_forma_pagto",
  "tab_forma_pagto_pdv",
  "tab_grupo_forma_pagto_rel",
  "tab_cupom_fiscal",
  "tab_item_cupom_fiscal",
  "tab_pagamento_cupom",
];

/** TRUNCATE em lote com CASCADE (ordem irrelevante no Postgres). */
export function erpMirrorTruncateSql(schema: string): string {
  const qTbl = (t: string) =>
    schema === "public"
      ? `"${t.replace(/"/g, '""')}"`
      : `"${schema.replace(/"/g, '""')}"."${t.replace(/"/g, '""')}"`;
  const list = ERP_MIRROR_TABLES.map((t) => qTbl(t)).join(", ");
  return `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`;
}
