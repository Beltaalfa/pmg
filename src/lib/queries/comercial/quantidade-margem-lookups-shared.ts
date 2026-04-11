/** Tipos partilhados (client + server) — listas para filtros do relatório. */

export type QuantidadeMargemLookupLinha = {
  cod: number;
  nome: string;
};

export type QuantidadeMargemLookupsPayload = {
  empresas: QuantidadeMargemLookupLinha[];
  itens: QuantidadeMargemLookupLinha[];
};
