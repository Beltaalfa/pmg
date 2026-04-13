import type { VolumeFormaPagamentoRow } from "@/lib/queries/comercial/volume-forma-pagamento-extract";

export type VolumeFormaPagamentoMesCell = {
  /** Quantidade (soma de `qtd_item` no período). */
  volume: number;
  /** Percentagem da quantidade da célula face ao total da coluna (toda a matriz no período). */
  pct: number;
};

export type VolumeFormaPagamentoFlatRow = {
  key: string;
  level: 0 | 1 | 2;
  label: string;
  bold: boolean;
  cells: VolumeFormaPagamentoMesCell[];
};

function anoMesFromDta(dta: string): string {
  const s = String(dta).trim();
  if (s.length >= 7 && /^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }
  return "—";
}

function coerceNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number.parseFloat(String(v).trim().replace(/\s/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Hierarquia empresa → grupo de forma → forma de pagamento; colunas = meses `YYYY-MM` + **Total**.
 * `%` = quantidade da célula / total da coluna (soma de todas as quantidades nesse mês no relatório), alinhado a
 * matriz Power BI tipo «% do total geral» por coluna.
 */
export function buildVolumeFormaPagamentoMatrix(
  rows: VolumeFormaPagamentoRow[]
): {
  monthKeys: string[];
  columnTotals: number[];
  flatRows: VolumeFormaPagamentoFlatRow[];
} {
  type Agg = { volume: number };
  const leafMap = new Map<string, Agg>();

  for (const r of rows) {
    const mes = anoMesFromDta(r.dta_cupom);
    const emp = String(r.cod_empresa);
    const g = (r.des_grupo ?? "").trim() || "(sem grupo)";
    const f = (r.des_forma_pagto ?? "").trim() || "(sem forma)";
    const k = `${emp}|${mes}|${g}|${f}`;
    const v = coerceNum(r.volume_linha);
    const prev = leafMap.get(k);
    if (prev) prev.volume += v;
    else leafMap.set(k, { volume: v });
  }

  const monthSet = new Set<string>();
  const empSet = new Set<string>();
  const empNom = new Map<string, string>();
  const grpByEmp = new Map<string, Set<string>>();
  const formByEmpGrp = new Map<string, Set<string>>();

  for (const r of rows) {
    const mes = anoMesFromDta(r.dta_cupom);
    if (mes !== "—") monthSet.add(mes);
    const emp = String(r.cod_empresa);
    empSet.add(emp);
    if (!empNom.has(emp)) empNom.set(emp, (r.nom_empresa ?? "").trim() || `Empresa ${emp}`);
    const g = (r.des_grupo ?? "").trim() || "(sem grupo)";
    let gs = grpByEmp.get(emp);
    if (!gs) {
      gs = new Set();
      grpByEmp.set(emp, gs);
    }
    gs.add(g);
    const fgk = `${emp}|${g}`;
    let fs = formByEmpGrp.get(fgk);
    if (!fs) {
      fs = new Set();
      formByEmpGrp.set(fgk, fs);
    }
    const f = (r.des_forma_pagto ?? "").trim() || "(sem forma)";
    fs.add(f);
  }

  const monthKeys = Array.from(monthSet).sort((a, b) => a.localeCompare(b));
  const colKeys = [...monthKeys, "total"];

  function cellVol(emp: string, mes: string, g: string, f: string): number {
    if (mes === "total") {
      let s = 0;
      for (const mk of monthKeys) {
        s += leafMap.get(`${emp}|${mk}|${g}|${f}`)?.volume ?? 0;
      }
      return s;
    }
    return leafMap.get(`${emp}|${mes}|${g}|${f}`)?.volume ?? 0;
  }

  function sumFormas(emp: string, mes: string, g: string): number {
    if (mes === "total") {
      let s = 0;
      for (const mk of monthKeys) {
        s += sumFormas(emp, mk, g);
      }
      return s;
    }
    const fs = formByEmpGrp.get(`${emp}|${g}`) ?? new Set<string>();
    let s = 0;
    for (const f of Array.from(fs)) s += cellVol(emp, mes, g, f);
    return s;
  }

  function sumGrupos(emp: string, mes: string): number {
    if (mes === "total") {
      let s = 0;
      for (const mk of monthKeys) {
        s += sumGrupos(emp, mk);
      }
      return s;
    }
    const grps = grpByEmp.get(emp) ?? new Set<string>();
    let s = 0;
    for (const g of Array.from(grps)) s += sumFormas(emp, mes, g);
    return s;
  }

  const columnTotals = colKeys.map((mes) => {
    let t = 0;
    for (const emp of Array.from(empSet)) {
      t += sumGrupos(emp, mes);
    }
    return t;
  });

  function pct(vol: number, colIdx: number): number {
    const den = columnTotals[colIdx] ?? 0;
    return den > 0 ? (vol / den) * 100 : 0;
  }

  function cellsFor(emp: string, g: string | null, f: string | null): VolumeFormaPagamentoMesCell[] {
    return colKeys.map((mk, i) => {
      let vol = 0;
      if (f != null && g != null) {
        vol = cellVol(emp, mk, g, f);
      } else if (g != null) {
        vol = sumFormas(emp, mk, g);
      } else {
        vol = sumGrupos(emp, mk);
      }
      return { volume: vol, pct: pct(vol, i) };
    });
  }

  const empSorted = Array.from(empSet).sort((a, b) =>
    (empNom.get(a) ?? a).localeCompare(empNom.get(b) ?? b, "pt-BR")
  );

  const flatRows: VolumeFormaPagamentoFlatRow[] = [];

  for (const emp of empSorted) {
    flatRows.push({
      key: `e-${emp}`,
      level: 0,
      label: empNom.get(emp) ?? emp,
      bold: true,
      cells: cellsFor(emp, null, null),
    });
    const grps = Array.from(grpByEmp.get(emp) ?? []).sort((a, b) => a.localeCompare(b, "pt-BR"));
    for (const g of grps) {
      flatRows.push({
        key: `g-${emp}-${g}`,
        level: 1,
        label: g,
        bold: true,
        cells: cellsFor(emp, g, null),
      });
      const forms = Array.from(formByEmpGrp.get(`${emp}|${g}`) ?? []).sort((a, b) =>
        a.localeCompare(b, "pt-BR")
      );
      for (const f of forms) {
        flatRows.push({
          key: `f-${emp}-${g}-${f}`,
          level: 2,
          label: f,
          bold: false,
          cells: cellsFor(emp, g, f),
        });
      }
    }
  }

  return { monthKeys, columnTotals, flatRows };
}
