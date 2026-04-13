/** Tipos partilhados (client + server) — listas para filtros do relatório. */

export type QuantidadeMargemLookupLinha = {
  cod: number;
  nome: string;
};

export type QuantidadeMargemLookupsPayload = {
  empresas: QuantidadeMargemLookupLinha[];
  itens: QuantidadeMargemLookupLinha[];
  /** Linhas de `tab_subgrupo_item` (código + `des_subgrupo_item`). */
  subcategorias: QuantidadeMargemLookupLinha[];
};
