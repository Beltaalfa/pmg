import type { QuantidadeMargemRow } from "@/lib/queries/comercial/quantidade-margem-shared";
import { QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM } from "@/lib/queries/comercial/quantidade-margem-extract";

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

/** Mês `YYYY-MM` a partir de `dta_fechamento` (ISO, `Date`, DD/MM/YYYY comum no BR). */
export function mesAnoFromDtaFechamento(dta: string | null): string {
  if (dta === null || dta === undefined) return "—";
  if (typeof dta === "object") {
    const t = (dta as Date).getTime?.();
    if (typeof t === "number" && !Number.isNaN(t)) {
      const d = dta as Date;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      return `${y}-${m}`;
    }
  }
  const s = String(dta).trim();
  if (s === "") return "—";
  if (s.length >= 7 && /^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (br) {
    const mm = br[2].padStart(2, "0");
    const yyyy = br[3];
    return `${yyyy}-${mm}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }
  return "—";
}

export type FaturamentoCustosCol = { key: string; nom: string };

/** Como derivar custo / valor unitário exibidos (Power BI: Soma = média ponderada; Mediana = por linha). */
export type FaturamentoCustosUnitAgg = "sum_ratio" | "median_row";

/**
 * Uma célula da matriz por produto (totais no grão da matriz).
 * - **sum_ratio** (DIVIDE(SUM,SUM) no PBI): custo unitário = `custo`/`qtd`, valor unitário = `valorLiquido`/`qtd`.
 * - **median_row** (Mediana no PBI): `medianUnitCusto` / `medianUnitVenda` = mediana dos unitários por linha de
 *   resumo no âmbito da célula (cada linha contribui com `custo/qtd_item` e `val_liquido/qtd_item`); os totais
 *   `custo`, `qtd`, `valorLiquido` continuam a ser somas para contexto / exportação.
 */
export type FaturamentoCustosCell = {
  /** Σ «Valor de custo» da API (`val_custo_estoque` por linha de resumo). */
  custo: number;
  /** Σ `Quant item` (`qtd_item`). */
  qtd: number;
  /** Σ «Valor líquido» (`val_liquido`). */
  valorLiquido: number;
  /** Mediana de (custo/qtd) por linha no âmbito da célula — só com `unitAgg: 'median_row'`. */
  medianUnitCusto?: number | null;
  /** Mediana de (valor líquido/qtd) por linha no âmbito da célula — só com `unitAgg: 'median_row'`. */
  medianUnitVenda?: number | null;
};

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

type FaturamentoCustosCellBuild = {
  custo: number;
  qtd: number;
  valorLiquido: number;
  samplesUnitCusto: number[];
  samplesUnitVenda: number[];
};

function emptyCellBuilds(n: number): FaturamentoCustosCellBuild[] {
  return Array.from({ length: n }, () => ({
    custo: 0,
    qtd: 0,
    valorLiquido: 0,
    samplesUnitCusto: [],
    samplesUnitVenda: [],
  }));
}

function mergeCellBuilds(
  a: FaturamentoCustosCellBuild[],
  b: FaturamentoCustosCellBuild[]
): FaturamentoCustosCellBuild[] {
  return a.map((x, i) => {
    const y = b[i]!;
    return {
      custo: x.custo + y.custo,
      qtd: x.qtd + y.qtd,
      valorLiquido: x.valorLiquido + y.valorLiquido,
      samplesUnitCusto: x.samplesUnitCusto.concat(y.samplesUnitCusto),
      samplesUnitVenda: x.samplesUnitVenda.concat(y.samplesUnitVenda),
    };
  });
}

export type FaturamentoCustosLeafAgg = {
  key: string;
  codSubgrupo: number;
  nomSubgrupo: string;
  rollup: FaturamentoCustosCell[];
};

export type FaturamentoCustosMesAgg = {
  key: string;
  mes: string;
  leaves: FaturamentoCustosLeafAgg[];
  rollup: FaturamentoCustosCell[];
};

export type FaturamentoCustosEmpresaAgg = {
  key: string;
  codEmpresa: string;
  nomEmpresa: string;
  months: FaturamentoCustosMesAgg[];
  rollup: FaturamentoCustosCell[];
};

function finalizeCellBuilds(
  builds: FaturamentoCustosCellBuild[],
  unitAgg: FaturamentoCustosUnitAgg
): FaturamentoCustosCell[] {
  if (unitAgg === "sum_ratio") {
    return builds.map((b) => ({
      custo: b.custo,
      qtd: b.qtd,
      valorLiquido: b.valorLiquido,
    }));
  }
  return builds.map((b) => ({
    custo: b.custo,
    qtd: b.qtd,
    valorLiquido: b.valorLiquido,
    medianUnitCusto: medianOf(b.samplesUnitCusto),
    medianUnitVenda: medianOf(b.samplesUnitVenda),
  }));
}

/**
 * Matriz Faturamento × Custos: hierarquia empresa → mês (AAAA-MM) → subcategoria → produtos (colunas).
 */
export function buildFaturamentoCustosHierarchy(
  rows: QuantidadeMargemRow[],
  nomeSubgrupo: (cod: number) => string,
  options?: { unitAgg?: FaturamentoCustosUnitAgg }
): {
  colEntries: FaturamentoCustosCol[];
  companies: FaturamentoCustosEmpresaAgg[];
  grandCells: FaturamentoCustosCell[];
} {
  const unitAgg: FaturamentoCustosUnitAgg = options?.unitAgg ?? "sum_ratio";
  /** Grão alinhado ao PBI: uma linha API por venda (`seq_fechamento`+`seq_venda`+`cod_item`). */
  const rowsIn = dedupeQuantidadeMargemRows(rows);

  type ItemBucket = { qtd: number; custo: number; valorLiquido: number; nomProduto: string };
  /** chave folha: empresa|mes|codSubgrupo → itens por cod_item */
  const leafMap = new Map<string, Map<string, ItemBucket>>();
  /** Nome do subgrupo vindo de `tab_subgrupo_item` nas linhas da API (`nom_subgrupo_item`). */
  const leafNomSubgrupoTab = new Map<string, string>();

  for (const row of rowsIn) {
    const codE = row.cod_empresa != null ? String(row.cod_empresa) : "";
    const codI = row.cod_item != null ? String(row.cod_item) : "";
    const nomE = (row.nom_empresa && String(row.nom_empresa).trim()) || `Empresa ${codE || "?"}`;
    const nomP = (row.nom_produto && String(row.nom_produto).trim()) || `Item ${codI || "?"}`;
    const mes = mesAnoFromDtaFechamento(row.dta_fechamento);
    const rawSg = row.cod_subgrupo_item;
    const codSg =
      rawSg !== null && rawSg !== undefined && String(rawSg).trim() !== ""
        ? Number(rawSg)
        : QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM;
    const sg = Number.isFinite(codSg) ? codSg : QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM;

    const qtd = coerceMeasure(row.qtd_item);
    const custo = coerceMeasure(row.val_custo_estoque);
    const valorLiquido = coerceMeasure(row.val_liquido);

    const ek = codE || `_null_${nomE}`;
    const leafKey = `${ek}|${mes}|${sg}`;
    const nomSgTab =
      row.nom_subgrupo_item != null ? String(row.nom_subgrupo_item).trim() : "";
    if (nomSgTab !== "") {
      leafNomSubgrupoTab.set(leafKey, nomSgTab);
    }
    let items = leafMap.get(leafKey);
    if (!items) {
      items = new Map();
      leafMap.set(leafKey, items);
    }
    const ik = codI || `_null_${nomP}`;
    const prev = items.get(ik);
    if (prev) {
      prev.qtd += qtd;
      prev.custo += custo;
      prev.valorLiquido += valorLiquido;
    } else {
      items.set(ik, { qtd, custo, valorLiquido, nomProduto: nomP });
    }
  }

  const colKeys = new Set<string>();
  const nomByKey = new Map<string, string>();
  for (const m of Array.from(leafMap.values())) {
    for (const [ik, b] of Array.from(m.entries())) {
      colKeys.add(ik);
      if (!nomByKey.has(ik)) nomByKey.set(ik, b.nomProduto);
    }
  }
  const colEntries: FaturamentoCustosCol[] = Array.from(colKeys)
    .map((key) => ({ key, nom: nomByKey.get(key) ?? key }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "pt-BR"));

  /** Amostras por linha de resumo para mediana: chave `leafKey::cod_item`. */
  const rowSamples =
    unitAgg === "median_row"
      ? (() => {
          const m = new Map<string, { samplesUnitCusto: number[]; samplesUnitVenda: number[] }>();
          for (const row of rowsIn) {
            const codE = row.cod_empresa != null ? String(row.cod_empresa) : "";
            const codI = row.cod_item != null ? String(row.cod_item) : "";
            const nomE = (row.nom_empresa && String(row.nom_empresa).trim()) || `Empresa ${codE || "?"}`;
            const nomP = (row.nom_produto && String(row.nom_produto).trim()) || `Item ${codI || "?"}`;
            const mes = mesAnoFromDtaFechamento(row.dta_fechamento);
            const rawSg = row.cod_subgrupo_item;
            const codSg =
              rawSg !== null && rawSg !== undefined && String(rawSg).trim() !== ""
                ? Number(rawSg)
                : QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM;
            const sg = Number.isFinite(codSg) ? codSg : QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM;
            const qtd = coerceMeasure(row.qtd_item);
            if (qtd <= 0) continue;
            const custo = coerceMeasure(row.val_custo_estoque);
            const valorLiquido = coerceMeasure(row.val_liquido);
            const ek = codE || `_null_${nomE}`;
            const leafKey = `${ek}|${mes}|${sg}`;
            const ik = codI || `_null_${nomP}`;
            const sk = `${leafKey}::${ik}`;
            let sp = m.get(sk);
            if (!sp) {
              sp = { samplesUnitCusto: [], samplesUnitVenda: [] };
              m.set(sk, sp);
            }
            sp.samplesUnitCusto.push(custo / qtd);
            sp.samplesUnitVenda.push(valorLiquido / qtd);
          }
          return m;
        })()
      : null;

  const emptyBs = (): FaturamentoCustosCellBuild[] => emptyCellBuilds(colEntries.length);

  function cellsFromItemsBuild(leafKey: string, items: Map<string, ItemBucket>): FaturamentoCustosCellBuild[] {
    return colEntries.map(({ key: ik }) => {
      const b = items.get(ik);
      const sp = rowSamples?.get(`${leafKey}::${ik}`);
      return {
        custo: b?.custo ?? 0,
        qtd: b?.qtd ?? 0,
        valorLiquido: b?.valorLiquido ?? 0,
        samplesUnitCusto: sp ? sp.samplesUnitCusto : [],
        samplesUnitVenda: sp ? sp.samplesUnitVenda : [],
      };
    });
  }

  const empKeys = new Set<string>();
  const empNom = new Map<string, string>();
  const empCod = new Map<string, string>();
  const mesByEmp = new Map<string, Set<string>>();
  const sgByEmpMes = new Map<string, Set<number>>();

  for (const row of rowsIn) {
    const codE = row.cod_empresa != null ? String(row.cod_empresa) : "";
    const nomE = (row.nom_empresa && String(row.nom_empresa).trim()) || `Empresa ${codE || "?"}`;
    const ek = codE || `_null_${nomE}`;
    empKeys.add(ek);
    if (!empNom.has(ek)) {
      empNom.set(ek, nomE);
      empCod.set(ek, codE);
    }
    const mes = mesAnoFromDtaFechamento(row.dta_fechamento);
    let ms = mesByEmp.get(ek);
    if (!ms) {
      ms = new Set();
      mesByEmp.set(ek, ms);
    }
    ms.add(mes);
    const rawSg = row.cod_subgrupo_item;
    const codSg =
      rawSg !== null && rawSg !== undefined && String(rawSg).trim() !== ""
        ? Number(rawSg)
        : QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM;
    const sg = Number.isFinite(codSg) ? codSg : QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM;
    const k = `${ek}|${mes}`;
    let sgs = sgByEmpMes.get(k);
    if (!sgs) {
      sgs = new Set();
      sgByEmpMes.set(k, sgs);
    }
    sgs.add(sg);
  }

  type LeafB = {
    key: string;
    codSubgrupo: number;
    nomSubgrupo: string;
    rollupB: FaturamentoCustosCellBuild[];
  };
  type MesB = {
    key: string;
    mes: string;
    leaves: LeafB[];
    rollupB: FaturamentoCustosCellBuild[];
  };
  type EmpB = {
    key: string;
    codEmpresa: string;
    nomEmpresa: string;
    months: MesB[];
    rollupB: FaturamentoCustosCellBuild[];
  };

  const companiesB: EmpB[] = Array.from(empKeys)
    .map((ek) => {
      const mesSet = mesByEmp.get(ek) ?? new Set<string>();
      const mesSorted = Array.from(mesSet).sort((a, b) => {
        if (a === "—") return 1;
        if (b === "—") return -1;
        return a.localeCompare(b);
      });

      const months: MesB[] = mesSorted.map((mes) => {
        const kEm = `${ek}|${mes}`;
        const sgSet = sgByEmpMes.get(kEm) ?? new Set<number>();
        const leaves: LeafB[] = Array.from(sgSet)
          .sort((a, b) => a - b)
          .map((sg) => {
            const leafKey = `${ek}|${mes}|${sg}`;
            const items = leafMap.get(leafKey) ?? new Map<string, ItemBucket>();
            const rollupB = cellsFromItemsBuild(leafKey, items);
            return {
              key: leafKey,
              codSubgrupo: sg,
              nomSubgrupo: leafNomSubgrupoTab.get(leafKey) ?? nomeSubgrupo(sg),
              rollupB,
            };
          });

        let rollupB = emptyBs();
        for (const lf of leaves) {
          rollupB = mergeCellBuilds(rollupB, lf.rollupB);
        }
        return {
          key: `${ek}|${mes}`,
          mes,
          leaves,
          rollupB,
        };
      });

      let rollupB = emptyBs();
      for (const mo of months) {
        rollupB = mergeCellBuilds(rollupB, mo.rollupB);
      }

      return {
        key: ek,
        codEmpresa: empCod.get(ek) ?? "",
        nomEmpresa: empNom.get(ek) ?? ek,
        months,
        rollupB,
      };
    })
    .sort((a, b) => a.nomEmpresa.localeCompare(b.nomEmpresa, "pt-BR"));

  let grandB = emptyBs();
  for (const c of companiesB) {
    grandB = mergeCellBuilds(grandB, c.rollupB);
  }

  const companies: FaturamentoCustosEmpresaAgg[] = companiesB.map((c) => ({
    key: c.key,
    codEmpresa: c.codEmpresa,
    nomEmpresa: c.nomEmpresa,
    months: c.months.map((mo) => ({
      key: mo.key,
      mes: mo.mes,
      leaves: mo.leaves.map((lf) => ({
        key: lf.key,
        codSubgrupo: lf.codSubgrupo,
        nomSubgrupo: lf.nomSubgrupo,
        rollup: finalizeCellBuilds(lf.rollupB, unitAgg),
      })),
      rollup: finalizeCellBuilds(mo.rollupB, unitAgg),
    })),
    rollup: finalizeCellBuilds(c.rollupB, unitAgg),
  }));

  const grandCells = finalizeCellBuilds(grandB, unitAgg);

  // #region agent log
  const idxAdit = colEntries.findIndex((c) => c.nom.toUpperCase().includes("ADITIVADO"));
  const gca = idxAdit >= 0 ? grandCells[idxAdit] : null;
  const gcAdit =
    gca && unitAgg === "median_row"
      ? {
          custo: gca.custo,
          qtd: gca.qtd,
          valorLiquido: gca.valorLiquido,
          medianUnitCusto: gca.medianUnitCusto,
          medianUnitVenda: gca.medianUnitVenda,
        }
      : gca && gca.qtd > 0
        ? {
            custo: gca.custo,
            qtd: gca.qtd,
            valorLiquido: gca.valorLiquido,
            unitCusto: gca.custo / gca.qtd,
            unitLiquido: gca.valorLiquido / gca.qtd,
          }
        : gca
          ? { custo: gca.custo, qtd: gca.qtd, valorLiquido: gca.valorLiquido, unitCusto: null, unitLiquido: null }
          : null;
  if (typeof fetch !== "undefined") {
    void fetch("http://localhost:7754/ingest/214ddba5-51f4-478c-b5fc-62757b17aabf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "b126c5",
      },
      body: JSON.stringify({
        sessionId: "b126c5",
        hypothesisId: "H3_H5",
        location: "quantidade-margem-matrix-aggregate.ts:buildFaturamentoCustosHierarchy",
        message: "grand-total-aditivado-column",
        data: {
          unitAgg,
          rowsArgLen: rows.length,
          rowsInLen: rowsIn.length,
          colCount: colEntries.length,
          idxAdit,
          colNomAtIdx: idxAdit >= 0 ? colEntries[idxAdit]?.nom : null,
          gcAdit,
          firstEmpresa: companies[0]?.nomEmpresa,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion

  return { colEntries, companies, grandCells };
}
