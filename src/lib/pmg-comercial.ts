/** Slug estável do primeiro relatório do setor Comercial (segmento de URL). */
export const COMERCIAL_RELATORIO_ANALISE_MARGEM_VENDA_SLUG = "analise-margem-venda";

/** Hub `Group.name` exato (comparação case-insensitive). */
export function isComercialGroupName(name: string): boolean {
  return name.trim().toLowerCase() === "comercial";
}

/** Path do relatório Análise de Margem e Venda para o `Group.id` do Comercial. */
export function comercialReportHref(setorId: string): string {
  return `/setor/${setorId}/relatorios/${COMERCIAL_RELATORIO_ANALISE_MARGEM_VENDA_SLUG}`;
}
