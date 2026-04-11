import type { QuantidadeMargemRow } from "@/lib/queries/comercial/quantidade-margem-shared";

/**
 * Mesma coerção que a auditoria na API (`Number.parseFloat` em string) — alinhada ao `pg`/JSON.
 * Evita a regex pt-BR antiga em valores como "677860.77" ser interpretada como milhares.
 */
function coerceMeasure(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim().replace(/\s/g, "");
  if (s === "") return 0;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export type MatrixItemAgg = {
  key: string;
  codItem: string;
  nomProduto: string;
  quantidade: number;
  faturamento: number;
  custo: number;
};

export type MatrixCompanyAgg = {
  key: string;
  codEmpresa: string;
  nomEmpresa: string;
  items: MatrixItemAgg[];
};

export type MatrixGrandAgg = {
  quantidade: number;
  faturamento: number;
  custo: number;
};

/** Margem bruta = SUM(val_liquido) − SUM(valor de custo), como no Power BI. */
function margemBruta(fat: number, custo: number): number {
  return fat - custo;
}

function margemL(qtd: number, fat: number, custo: number): number {
  if (qtd <= 0) return 0;
  return margemBruta(fat, custo) / qtd;
}

/**
 * Remove linhas duplicadas com o mesmo grão (empresa + fechamento + venda + item).
 * O modo cache historicamente não persistia `seq_venda`; após passar a gravá-lo, o sync repõe o grão.
 */
export function dedupeQuantidadeMargemRows(rows: QuantidadeMargemRow[]): QuantidadeMargemRow[] {
  const seen = new Set<string>();
  const out: QuantidadeMargemRow[] = [];
  for (const row of rows) {
    const sv = row.seq_venda;
    if (sv == null || sv === "") {
      out.push(row);
      continue;
    }
    const codE = row.cod_empresa != null ? String(row.cod_empresa) : "";
    const sf = row.seq_fechamento != null ? String(row.seq_fechamento) : "";
    const ci = row.cod_item != null ? String(row.cod_item) : "";
    const k = `${codE}|${sf}|${String(sv)}|${ci}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out;
}

/** Agrega linhas detalhadas (várias por fechamento) por empresa → item. */
export function buildQuantidadeMargemMatrixTree(rows: QuantidadeMargemRow[]): {
  companies: MatrixCompanyAgg[];
  grand: MatrixGrandAgg;
} {
  const rowsIn = dedupeQuantidadeMargemRows(rows);
  type Bucket = {
    qtd: number;
    fat: number;
    custo: number;
    nomProduto: string;
  };
  const byEmpresa = new Map<
    string,
    { nomEmpresa: string; codEmpresa: string; items: Map<string, Bucket> }
  >();

  for (const row of rowsIn) {
    const codE = row.cod_empresa != null ? String(row.cod_empresa) : "";
    const codI = row.cod_item != null ? String(row.cod_item) : "";
    const nomE = (row.nom_empresa && String(row.nom_empresa).trim()) || `Empresa ${codE || "?"}`;
    const nomP = (row.nom_produto && String(row.nom_produto).trim()) || `Item ${codI || "?"}`;

    const qtd = coerceMeasure(row.qtd_item);
    const fat = coerceMeasure(row.val_liquido);
    const custo = coerceMeasure(row.val_custo_estoque);

    const ek = codE || `_null_${nomE}`;
    let emp = byEmpresa.get(ek);
    if (!emp) {
      emp = { nomEmpresa: nomE, codEmpresa: codE, items: new Map() };
      byEmpresa.set(ek, emp);
    }
    const ik = codI || `_null_${nomP}`;
    const prev = emp.items.get(ik);
    if (prev) {
      prev.qtd += qtd;
      prev.fat += fat;
      prev.custo += custo;
    } else {
      emp.items.set(ik, { qtd, fat, custo, nomProduto: nomP });
    }
  }

  const companies: MatrixCompanyAgg[] = Array.from(byEmpresa.entries())
    .map(([key, emp]) => {
      const items: MatrixItemAgg[] = Array.from(emp.items.entries())
        .map(([ik, b]) => ({
          key: `${key}|${ik}`,
          codItem: ik.startsWith("_null_") ? "" : ik.replace(/^_null_/, ""),
          nomProduto: b.nomProduto,
          quantidade: b.qtd,
          faturamento: b.fat,
          custo: b.custo,
        }))
        .sort((a, b) => a.nomProduto.localeCompare(b.nomProduto, "pt-BR"));

      return {
        key,
        codEmpresa: emp.codEmpresa,
        nomEmpresa: emp.nomEmpresa,
        items,
      };
    })
    .sort((a, b) => a.nomEmpresa.localeCompare(b.nomEmpresa, "pt-BR"));

  let gQ = 0;
  let gF = 0;
  let gC = 0;
  for (const c of companies) {
    for (const it of c.items) {
      gQ += it.quantidade;
      gF += it.faturamento;
      gC += it.custo;
    }
  }

  return {
    companies,
    grand: { quantidade: gQ, faturamento: gF, custo: gC },
  };
}

export function companyTotals(items: MatrixItemAgg[]): MatrixGrandAgg {
  let q = 0;
  let f = 0;
  let c = 0;
  for (const it of items) {
    q += it.quantidade;
    f += it.faturamento;
    c += it.custo;
  }
  return { quantidade: q, faturamento: f, custo: c };
}

export { margemBruta, margemL };
