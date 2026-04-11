import type { QuantidadeMargemRow } from "@/lib/queries/comercial/quantidade-margem-shared";
import { dedupeQuantidadeMargemRows } from "@/lib/queries/comercial/quantidade-margem-matrix-aggregate";

function coerceMeasure(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim().replace(/\s/g, "");
  if (s === "") return 0;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Data de ontem (America/Sao_Paulo), formato YYYY-MM-DD — alinhado ao `TODAY()-1` do PBI. */
export function getDataOntemIsoBrasil(): string {
  const ymd = new Date()
    .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
    .slice(0, 10);
  const [y, m, d] = ymd.split("-").map((x) => Number.parseInt(x, 10));
  const t0 = Date.UTC(y, m - 1, d, 12, 0, 0);
  const yest = new Date(t0 - 86400000);
  return yest.toISOString().slice(0, 10);
}

function rowDtaIso(row: QuantidadeMargemRow): string | null {
  const v = row.dta_fechamento;
  if (v == null) return null;
  if (typeof v === "string") {
    const s = v.trim().slice(0, 10);
    return s.length >= 10 ? s : null;
  }
  if (typeof v === "object" && v !== null && "toISOString" in v) {
    return (v as Date).toISOString().slice(0, 10);
  }
  return String(v).slice(0, 10);
}

function inRangeInclusive(d: string, ini: string, fim: string): boolean {
  return d >= ini && d <= fim;
}

function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

type Ym = { y: number; m: number };

function ymFromIso(iso: string): Ym {
  const [y, m] = iso.slice(0, 10).split("-").map((x) => Number.parseInt(x, 10));
  return { y, m };
}

function compareYearMonth(a: Ym, b: Ym): number {
  if (a.y !== b.y) return a.y < b.y ? -1 : 1;
  if (a.m !== b.m) return a.m < b.m ? -1 : a.m > b.m ? 1 : 0;
  return 0;
}

/**
 * Projeção de vendas (litros) — equivalente à medida DAX `Projeção Vendas Por Empresa`
 * (comparação ano/mês em vez de só MONTH()).
 */
export function projeçãoVendasLitros(params: {
  qtdPeriodoTotal: number;
  qtdAteOntem: number;
  dataFim: string;
  dataOntem: string;
}): number {
  const { qtdPeriodoTotal, qtdAteOntem, dataFim, dataOntem } = params;
  const mesVenda = ymFromIso(dataFim);
  const mesOntem = ymFromIso(dataOntem);
  const [, , dayOntem] = dataOntem.slice(0, 10).split("-").map((x) => Number.parseInt(x, 10));
  const diasNoMes = daysInMonth(mesVenda.y, mesVenda.m);
  const diasAteOntem = dayOntem;
  const diasRestantes = Math.max(0, diasNoMes - diasAteOntem);
  const mediaDiaria = diasAteOntem > 0 ? qtdAteOntem / diasAteOntem : 0;

  const cmp = compareYearMonth(mesVenda, mesOntem);
  if (cmp === 0) {
    return mediaDiaria * diasNoMes;
  }
  if (cmp < 0) {
    return qtdPeriodoTotal;
  }
  return mediaDiaria * diasRestantes;
}

export type ProjecaoItemAgg = {
  key: string;
  codItem: string;
  nomProduto: string;
  qtdPeriodoTotal: number;
  vendasAteMomentoLt: number;
  margemBruta: number;
  margemPorLitro: number;
  projecaoVendasLt: number;
  margemBrutaProjetada: number;
};

export type ProjecaoCompanyAgg = {
  key: string;
  codEmpresa: string;
  nomEmpresa: string;
  items: ProjecaoItemAgg[];
  /** Totais da empresa (agregados dos itens). */
  totals: Omit<ProjecaoItemAgg, "key" | "codItem" | "nomProduto">;
};

export type ProjecaoGrandAgg = {
  vendasAteMomentoLt: number;
  margemBruta: number;
  margemPorLitro: number;
  projecaoVendasLt: number;
  margemBrutaProjetada: number;
};

type Bucket = {
  nomProduto: string;
  qP: number;
  fatP: number;
  custoP: number;
  qA: number;
  fatA: number;
  custoA: number;
};

function margemBrutaN(fat: number, custo: number): number {
  return fat - custo;
}

function itemFromBucket(
  key: string,
  ik: string,
  b: Bucket,
  dataFim: string,
  dataOntem: string
): ProjecaoItemAgg {
  const mb = margemBrutaN(b.fatA, b.custoA);
  const mPerL = b.qA > 0 ? mb / b.qA : 0;
  const projL = projeçãoVendasLitros({
    qtdPeriodoTotal: b.qP,
    qtdAteOntem: b.qA,
    dataFim,
    dataOntem,
  });
  return {
    key: `${key}|${ik}`,
    codItem: ik.startsWith("_null_") ? "" : ik.replace(/^_null_/, ""),
    nomProduto: b.nomProduto,
    qtdPeriodoTotal: b.qP,
    vendasAteMomentoLt: b.qA,
    margemBruta: mb,
    margemPorLitro: mPerL,
    projecaoVendasLt: projL,
    margemBrutaProjetada: mPerL * projL,
  };
}

function companyTotalsFromItems(
  items: ProjecaoItemAgg[],
  dataFim: string,
  dataOntem: string
): Omit<ProjecaoItemAgg, "key" | "codItem" | "nomProduto"> {
  let qP = 0;
  let qA = 0;
  let mb = 0;
  for (const it of items) {
    qP += it.qtdPeriodoTotal;
    qA += it.vendasAteMomentoLt;
    mb += it.margemBruta;
  }
  const mPerL = qA > 0 ? mb / qA : 0;
  const projL = projeçãoVendasLitros({
    qtdPeriodoTotal: qP,
    qtdAteOntem: qA,
    dataFim,
    dataOntem,
  });
  return {
    qtdPeriodoTotal: qP,
    vendasAteMomentoLt: qA,
    margemBruta: mb,
    margemPorLitro: mPerL,
    projecaoVendasLt: projL,
    margemBrutaProjetada: mPerL * projL,
  };
}

export function buildProjecaoMatrixTree(
  rows: QuantidadeMargemRow[],
  opts: { dataInicio: string; dataFim: string; dataOntem: string }
): {
  companies: ProjecaoCompanyAgg[];
  grand: ProjecaoGrandAgg;
  periodoCruzaMeses: boolean;
} {
  const { dataInicio, dataFim, dataOntem } = opts;
  const ini = dataInicio.slice(0, 10);
  const fim = dataFim.slice(0, 10);
  const ont = dataOntem.slice(0, 10);

  const ymI = ymFromIso(ini);
  const ymF = ymFromIso(fim);
  const periodoCruzaMeses = ymI.y !== ymF.y || ymI.m !== ymF.m;

  const rowsIn = dedupeQuantidadeMargemRows(rows);
  const byEmpresa = new Map<
    string,
    { nomEmpresa: string; codEmpresa: string; items: Map<string, Bucket> }
  >();

  for (const row of rowsIn) {
    const dta = rowDtaIso(row);
    if (!dta || !inRangeInclusive(dta, ini, fim)) continue;

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
    let b = emp.items.get(ik);
    if (!b) {
      b = {
        nomProduto: nomP,
        qP: 0,
        fatP: 0,
        custoP: 0,
        qA: 0,
        fatA: 0,
        custoA: 0,
      };
      emp.items.set(ik, b);
    }
    b.qP += qtd;
    b.fatP += fat;
    b.custoP += custo;
    if (dta <= ont) {
      b.qA += qtd;
      b.fatA += fat;
      b.custoA += custo;
    }
  }

  const companies: ProjecaoCompanyAgg[] = Array.from(byEmpresa.entries())
    .map(([key, emp]) => {
      const items: ProjecaoItemAgg[] = Array.from(emp.items.entries())
        .map(([ik, b]) => itemFromBucket(key, ik, b, fim, ont))
        .sort((a, b) => a.nomProduto.localeCompare(b.nomProduto, "pt-BR"));

      const totals = companyTotalsFromItems(items, fim, ont);

      return {
        key,
        codEmpresa: emp.codEmpresa,
        nomEmpresa: emp.nomEmpresa,
        items,
        totals,
      };
    })
    .sort((a, b) => a.nomEmpresa.localeCompare(b.nomEmpresa, "pt-BR"));

  let gQP = 0;
  let gQA = 0;
  let gMb = 0;
  for (const c of companies) {
    gQP += c.totals.qtdPeriodoTotal;
    gQA += c.totals.vendasAteMomentoLt;
    gMb += c.totals.margemBruta;
  }
  const gMPerL = gQA > 0 ? gMb / gQA : 0;
  const gProjL = projeçãoVendasLitros({
    qtdPeriodoTotal: gQP,
    qtdAteOntem: gQA,
    dataFim: fim,
    dataOntem: ont,
  });

  const grand: ProjecaoGrandAgg = {
    vendasAteMomentoLt: gQA,
    margemBruta: gMb,
    margemPorLitro: gMPerL,
    projecaoVendasLt: gProjL,
    margemBrutaProjetada: gMPerL * gProjL,
  };

  return { companies, grand, periodoCruzaMeses };
}
