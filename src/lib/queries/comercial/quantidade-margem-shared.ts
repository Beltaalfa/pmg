/** Tipos e colunas partilhadas (seguro para import em Client Components — sem `pg`). */

export type QuantidadeMargemRow = {
  cod_empresa: string | number | null;
  nom_empresa: string | null;
  cod_pdv: string | number | null;
  cod_operador: string | number | null;
  nom_operador: string | null;
  nom_usuario_conf: string | null;
  seq_fechamento: string | number | null;
  /** Grain com `seq_fechamento`; ausente em respostas antigas sem coluna no cache. */
  seq_venda?: string | number | null;
  dta_fechamento: string | null;
  cod_item: string | number | null;
  nom_produto: string | null;
  qtd_item: string | number | null;
  val_custo_estoque: string | number | null;
  val_liquido: string | number | null;
};

export const QUANTIDADE_MARGEM_COLUNAS: { key: keyof QuantidadeMargemRow; label: string }[] = [
  { key: "cod_empresa", label: "Cód. empresa" },
  { key: "nom_empresa", label: "Empresa" },
  { key: "cod_pdv", label: "Cód. PDV" },
  { key: "cod_operador", label: "Cód. operador" },
  { key: "nom_operador", label: "Operador" },
  { key: "nom_usuario_conf", label: "Usuário conf." },
  { key: "seq_fechamento", label: "Seq. fechamento" },
  { key: "seq_venda", label: "Seq. venda" },
  { key: "dta_fechamento", label: "Data fechamento" },
  { key: "cod_item", label: "Cód. item" },
  { key: "nom_produto", label: "Descrição item" },
  { key: "qtd_item", label: "Qtd." },
  { key: "val_custo_estoque", label: "Val. custo estoque" },
  { key: "val_liquido", label: "Val. líquido" },
];
