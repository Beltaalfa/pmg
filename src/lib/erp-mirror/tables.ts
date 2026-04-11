/**
 * Tabelas ERP espelhadas no North (SELECT na prod, DDL/sync só no mirror).
 * Alinhado a `src/lib/queries/comercial/quantidade-margem-extract.ts`.
 *
 * Para incluir mais tabelas: acrescente o nome aqui, volte a correr introspect e sync.
 */
export const ERP_MIRROR_TABLES = [
  "tab_empresa",
  "tab_item",
  "tab_pdv",
  "tab_fechamento_caixa_pdv",
  "tab_movimento_estoque",
  "tab_resumo_venda_item",
] as const;

export type ErpMirrorTable = (typeof ERP_MIRROR_TABLES)[number];

/** Ordem de INSERT respeitando FKs típicas entre estas tabelas. */
export const ERP_MIRROR_INSERT_ORDER: readonly ErpMirrorTable[] = [
  "tab_empresa",
  "tab_item",
  "tab_pdv",
  "tab_fechamento_caixa_pdv",
  "tab_movimento_estoque",
  "tab_resumo_venda_item",
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
