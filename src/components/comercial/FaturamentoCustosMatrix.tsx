"use client";

import type { ReactNode } from "react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildFaturamentoCustosHierarchy,
  type FaturamentoCustosCell,
  type FaturamentoCustosEmpresaAgg,
  type FaturamentoCustosMesAgg,
  type FaturamentoCustosUnitAgg,
} from "@/lib/queries/comercial/quantidade-margem-matrix-aggregate";
import type { QuantidadeMargemRow } from "@/lib/queries/comercial/quantidade-margem-shared";
import {
  QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM,
  QUANTIDADE_MARGEM_SUBGRUPO_TODOS,
} from "@/lib/queries/comercial/quantidade-margem-extract";
import type { QuantidadeMargemLookupsPayload } from "@/lib/queries/comercial/quantidade-margem-lookups-shared";
import { IconDownload } from "@tabler/icons-react";
import { isValidIsoDate, localIsoDateFromDate, periodoValido } from "@/lib/iso-date";
import styles from "./quantidade-margem-matrix.module.css";

function defaultDateRange(): { dataInicio: string; dataFim: string } {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  return {
    dataInicio: localIsoDateFromDate(start),
    dataFim: localIsoDateFromDate(end),
  };
}

function sanitizeCodInput(raw: string): string {
  return raw.replace(/\D/g, "");
}

function parseOptionalCod(raw: string): number | null {
  const digits = sanitizeCodInput(raw);
  if (digits === "") return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** «Valor Custo» na matriz Power BI: número com 3 casas, sem símbolo de moeda. */
function fmtValorCustoPbi(n: number): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

/** Valor Unitário (PBI) = SUM(Valor líquido)/SUM(Quant item) — moeda BRL, 2 casas. */
function fmtValorUnitVendaPbi(n: number): string {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Média ponderada (Σ custo / Σ qtd) ou mediana dos custos unitários por linha, conforme `unitAgg`. */
function custoUnitarioDisplay(cell: FaturamentoCustosCell, unitAgg: FaturamentoCustosUnitAgg): number | null {
  if (unitAgg === "median_row") {
    const v = cell.medianUnitCusto;
    return v == null ? null : v;
  }
  return cell.qtd > 0 ? cell.custo / cell.qtd : null;
}

/** Média ponderada (Σ líquido / Σ qtd) ou mediana dos valores unitários por linha. */
function valorUnitarioVendaDisplay(cell: FaturamentoCustosCell, unitAgg: FaturamentoCustosUnitAgg): number | null {
  if (unitAgg === "median_row") {
    const v = cell.medianUnitVenda;
    return v == null ? null : v;
  }
  return cell.qtd > 0 ? cell.valorLiquido / cell.qtd : null;
}

type Props = {
  titulo: string;
  exportFilePrefix: string;
  autoLoad?: boolean;
  lookups: QuantidadeMargemLookupsPayload | null;
  lookupsError: string | null;
};

export function FaturamentoCustosMatrix({
  titulo,
  exportFilePrefix,
  autoLoad = false,
  lookups,
  lookupsError,
}: Props) {
  const defaults = useMemo(() => defaultDateRange(), []);
  const [dataInicio, setDataInicio] = useState(defaults.dataInicio);
  const [dataFim, setDataFim] = useState(defaults.dataFim);
  const [codEmpresa, setCodEmpresa] = useState("");
  const [codItem, setCodItem] = useState("");
  const [codSubgrupo, setCodSubgrupo] = useState(String(QUANTIDADE_MARGEM_SUBGRUPO_TODOS));
  const [itensFiltrados, setItensFiltrados] = useState<QuantidadeMargemLookupsPayload["itens"]>([]);
  const [rows, setRows] = useState<QuantidadeMargemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Alinhar ao Power BI: Mediana nos unitários vs Soma (= DIVIDE(SUM,SUM)). */
  const [unitAgg, setUnitAgg] = useState<FaturamentoCustosUnitAgg>("median_row");

  const nomeSubgrupo = useCallback(
    (cod: number) => {
      const hit = lookups?.subcategorias?.find((x) => x.cod === cod);
      const n = hit?.nome != null ? String(hit.nome).trim() : "";
      if (n !== "") return n;
      return String(cod);
    },
    [lookups?.subcategorias]
  );

  const hierarchy = useMemo(
    () => buildFaturamentoCustosHierarchy(rows, nomeSubgrupo, { unitAgg }),
    [rows, nomeSubgrupo, unitAgg]
  );

  useEffect(() => {
    if (!lookups?.itens) return;
    const sg = Number.parseInt(codSubgrupo, 10);
    if (!Number.isFinite(sg)) {
      setItensFiltrados(lookups.itens);
      return;
    }
    if (sg === QUANTIDADE_MARGEM_SUBGRUPO_TODOS) {
      let cancelled = false;
      void (async () => {
        try {
          const res = await fetch(
            `/api/relatorios/comercial/quantidade-margem/lookups?codSubgrupoItem=${QUANTIDADE_MARGEM_SUBGRUPO_TODOS}`,
            { cache: "no-store" }
          );
          const json = (await res.json()) as QuantidadeMargemLookupsPayload & { error?: string };
          if (cancelled) return;
          if (!res.ok) {
            setItensFiltrados(lookups.itens);
            return;
          }
          setItensFiltrados(Array.isArray(json.itens) ? json.itens : []);
        } catch {
          if (!cancelled) setItensFiltrados(lookups.itens);
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    if (sg === QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM && lookups.itens.length > 0) {
      setItensFiltrados(lookups.itens);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/relatorios/comercial/quantidade-margem/lookups?codSubgrupoItem=${sg}`,
          { cache: "no-store" }
        );
        const json = (await res.json()) as QuantidadeMargemLookupsPayload & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setItensFiltrados(lookups.itens);
          return;
        }
        setItensFiltrados(Array.isArray(json.itens) ? json.itens : []);
      } catch {
        if (!cancelled) setItensFiltrados(lookups.itens);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [codSubgrupo, lookups]);

  const itensParaSelect = itensFiltrados.length > 0 ? itensFiltrados : (lookups?.itens ?? []);

  const carregar = useCallback(async () => {
    if (!periodoValido(dataInicio, dataFim)) {
      if (!isValidIsoDate(dataInicio) || !isValidIsoDate(dataFim)) {
        setError("Indique data início e data fim completas (formato AAAA-MM-DD).");
      } else {
        setError("A data início não pode ser posterior à data fim.");
      }
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        dataInicio,
        dataFim,
      });
      const ce = parseOptionalCod(codEmpresa);
      const ci = parseOptionalCod(codItem);
      const csg = Number.parseInt(codSubgrupo, 10);
      if (ce !== null) params.set("codEmpresa", String(ce));
      if (ci !== null) params.set("codItem", String(ci));
      if (Number.isFinite(csg)) {
        params.set("codSubgrupoItem", String(csg));
      }

      const res = await fetch(`/api/relatorios/comercial/quantidade-margem?${params.toString()}`, {
        priority: "high",
        cache: "no-store",
      } as RequestInit);
      const json = (await res.json()) as { rows?: QuantidadeMargemRow[]; error?: string };
      if (!res.ok) {
        setRows([]);
        setError(json.error ?? `Erro HTTP ${res.status}`);
        return;
      }
      setRows(json.rows ?? []);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Falha na rede.");
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, codEmpresa, codItem, codSubgrupo]);

  const didAutoLoad = useRef(false);
  useEffect(() => {
    if (!autoLoad || didAutoLoad.current) return;
    if (!periodoValido(dataInicio, dataFim)) return;
    didAutoLoad.current = true;
    void carregar();
  }, [autoLoad, carregar, dataInicio, dataFim]);

  const exportarXlsx = useCallback(async () => {
    if (rows.length === 0 || hierarchy.colEntries.length === 0) return;
    const XLSX = await import("xlsx");
    const { colEntries, companies, grandCells } = hierarchy;
    const header = ["Empresa"];
    for (const col of colEntries) {
      header.push(`${col.nom} — Valor Custo`);
      header.push(`${col.nom} — Valor Unitário`);
    }
    const data: (string | number)[][] = [header];

    const pushCells = (label: string, cells: FaturamentoCustosCell[]) => {
      const line: (string | number)[] = [label];
      cells.forEach((cell) => {
        const uc = custoUnitarioDisplay(cell, unitAgg);
        const uv = valorUnitarioVendaDisplay(cell, unitAgg);
        line.push(uc == null ? "" : Number(uc.toFixed(3)), uv == null ? "" : uv);
      });
      data.push(line);
    };

    for (const c of companies) {
      pushCells(c.nomEmpresa, c.rollup);
      for (const m of c.months) {
        pushCells(`  ${m.mes}`, m.rollup);
        for (const lf of m.leaves) {
          pushCells(`    ${lf.nomSubgrupo.trim().toLocaleUpperCase("pt-BR")}`, lf.rollup);
        }
      }
    }
    const totalLine: (string | number)[] = ["Total"];
    grandCells.forEach((cell) => {
      const uc = custoUnitarioDisplay(cell, unitAgg);
      const uv = valorUnitarioVendaDisplay(cell, unitAgg);
      totalLine.push(uc == null ? "" : Number(uc.toFixed(3)), uv == null ? "" : uv);
    });
    data.push(totalLine);

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Faturamento x Custos");
    XLSX.writeFile(wb, `${exportFilePrefix}-${dataInicio}_${dataFim}.xlsx`);
  }, [rows.length, hierarchy, exportFilePrefix, dataInicio, dataFim, unitAgg]);

  const filtrosOk = periodoValido(dataInicio, dataFim);
  const lookupsLoading = lookups === null && lookupsError === null;
  const subNaoUm = Number.parseInt(codSubgrupo, 10) !== QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM;

  const renderMetricCells = (cells: FaturamentoCustosCell[]) =>
    cells.flatMap((cell, i) => {
      const unitCusto = custoUnitarioDisplay(cell, unitAgg);
      const unitVenda = valorUnitarioVendaDisplay(cell, unitAgg);
      return (
        <Fragment key={`m-${i}`}>
          <td className={`${styles.numCell} ${styles.numCellCusto}`}>
            {unitCusto == null ? "—" : fmtValorCustoPbi(unitCusto)}
          </td>
          <td className={styles.numCell}>
            {unitVenda == null ? "—" : fmtValorUnitVendaPbi(unitVenda)}
          </td>
        </Fragment>
      );
    });

  const empresaRow = (c: FaturamentoCustosEmpresaAgg, stripe: boolean) => {
    const trClass = [styles.rowCompany, stripe ? styles.trStripe : ""].filter(Boolean).join(" ");
    return (
      <tr key={`emp-${c.key}`} className={trClass}>
        <td className={styles.treeCell}>
          <span className={styles.treeIndentSpacer} aria-hidden />
          <span className={styles.treeLabel}>{c.nomEmpresa}</span>
        </td>
        {renderMetricCells(c.rollup)}
      </tr>
    );
  };

  const mesRow = (m: FaturamentoCustosMesAgg, stripe: boolean) => {
    const trClass = [styles.rowMonth, stripe ? styles.trStripe : ""].filter(Boolean).join(" ");
    return (
      <tr key={`mes-${m.key}`} className={trClass}>
        <td className={`${styles.treeCell} ${styles.treeIndentMonth}`}>
          <span className={styles.treeIndentSpacer} aria-hidden />
          <span className={styles.treeLabel}>{m.mes}</span>
        </td>
        {renderMetricCells(m.rollup)}
      </tr>
    );
  };

  const subcategoriaRow = (
    cells: FaturamentoCustosCell[],
    nomSubgrupo: string,
    rowKey: string,
    stripe: boolean
  ) => {
    const trClass = [styles.rowItem, stripe ? styles.trStripe : ""].filter(Boolean).join(" ");
    return (
      <tr key={rowKey} className={trClass}>
        <td className={`${styles.treeCell} ${styles.treeItem} ${styles.treeIndentSub}`}>
          <span className={`${styles.treeLabel} ${styles.treeLabelSubcatPbi}`}>
            {nomSubgrupo.trim().toLocaleUpperCase("pt-BR")}
          </span>
        </td>
        {renderMetricCells(cells)}
      </tr>
    );
  };

  let stripe = 0;
  const bodyRows: ReactNode[] = [];
  for (const c of hierarchy.companies) {
    const sE = stripe % 2 === 1;
    bodyRows.push(empresaRow(c, sE));
    stripe++;
    for (const m of c.months) {
      const sM = stripe % 2 === 1;
      bodyRows.push(mesRow(m, sM));
      stripe++;
      for (const lf of m.leaves) {
        const sL = stripe % 2 === 1;
        bodyRows.push(subcategoriaRow(lf.rollup, lf.nomSubgrupo, lf.key, sL));
        stripe++;
      }
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.periodBlock}>
        <h3 className={styles.matrixTitle}>{titulo}</h3>
        <h4 className={styles.matrixSubtitle}>Faturamento X Custos</h4>
        <p className={styles.filterHint} style={{ marginTop: 8 }}>
          Linhas: <strong>empresa</strong> → <strong>período</strong> → <strong>subcategoria</strong>. Use o filtro{" "}
          <strong>Unitários (célula)</strong>: <em>Mediana</em> = mediana dos custos/valores unitários por{" "}
          <strong>linha de resumo</strong> no âmbito da célula (como agregação Mediana no PBI); <em>Média ponderada</em>{" "}
          = DIVIDE(SUM(Valor de custo), SUM(Quant item)) e o análogo para valor líquido. Na API, custo ={" "}
          <code>val_custo_estoque</code>, quantidade = <code>qtd_item</code>, líquido = <code>val_liquido</code>. Se a
          medida de custo no PBI não for equivalente a <code>val_custo_estoque</code>, os números divergem. Exclui
          operador <code>367</code>.
        </p>
        {subNaoUm ? (
          <p className={styles.filterHint} style={{ color: "#a16207" }}>
            Com <code>PMG_QUANTIDADE_MARGEM_MODE=cache</code>, o sync só carrega subgrupo{" "}
            <code>{QUANTIDADE_MARGEM_COD_SUBGRUPO_ITEM}</code> — outras subcategorias ou “Todas” podem
            ficar incompletas até o job alargar ou usar modo direct no espelho.
          </p>
        ) : null}
      </div>

      <form
        className={styles.filters}
        onSubmit={(e) => {
          e.preventDefault();
          void carregar();
        }}
      >
        <label className={styles.field}>
          <span>Data início</span>
          <input
            type="date"
            name="dataInicio"
            value={dataInicio}
            onChange={(e) => {
              setDataInicio(e.target.value);
              setError(null);
            }}
            className={`${styles.input} ${styles.inputDate}`}
            autoComplete="off"
            aria-invalid={dataInicio !== "" && !isValidIsoDate(dataInicio)}
          />
        </label>
        <label className={styles.field}>
          <span>Data fim</span>
          <input
            type="date"
            name="dataFim"
            value={dataFim}
            onChange={(e) => {
              setDataFim(e.target.value);
              setError(null);
            }}
            className={`${styles.input} ${styles.inputDate}`}
            autoComplete="off"
            aria-invalid={dataFim !== "" && !isValidIsoDate(dataFim)}
          />
        </label>
        <label className={styles.field}>
          <span>Subgrupo (tab_subgrupo_item)</span>
          {lookupsError ? (
            <input
              type="text"
              inputMode="numeric"
              className={styles.input}
              value={codSubgrupo}
              onChange={(e) => {
                setCodSubgrupo(sanitizeCodInput(e.target.value));
                setCodItem("");
                setError(null);
              }}
              placeholder="cod_subgrupo_item"
            />
          ) : lookupsLoading ? (
            <select className={`${styles.input} ${styles.select}`} disabled value="">
              <option value="">A carregar…</option>
            </select>
          ) : (lookups?.subcategorias ?? []).length > 0 ? (
            <select
              className={`${styles.input} ${styles.select}`}
              value={codSubgrupo}
              onChange={(e) => {
                setCodSubgrupo(e.target.value);
                setCodItem("");
                setError(null);
              }}
              aria-label="Subcategoria (cod_subgrupo_item)"
            >
              <option value={String(QUANTIDADE_MARGEM_SUBGRUPO_TODOS)}>Todas as subcategorias</option>
              {(lookups?.subcategorias ?? []).map((s) => (
                <option key={s.cod} value={String(s.cod)} title={s.nome}>
                  {s.nome}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              inputMode="numeric"
              className={styles.input}
              value={codSubgrupo}
              onChange={(e) => {
                setCodSubgrupo(sanitizeCodInput(e.target.value));
                setCodItem("");
                setError(null);
              }}
              placeholder="cod_subgrupo_item (p.ex. 1 ou -1=todas)"
              aria-label="Subcategoria (cod_subgrupo_item)"
            />
          )}
        </label>
        <label className={styles.field}>
          <span>Empresa</span>
          {lookupsError ? (
            <>
              <p className={styles.lookupsWarn}>Indique o código numérico.</p>
              <input
                type="text"
                inputMode="numeric"
                className={styles.input}
                value={codEmpresa}
                onChange={(e) => {
                  setCodEmpresa(sanitizeCodInput(e.target.value));
                  setError(null);
                }}
                placeholder="Código ou vazio = todas"
              />
            </>
          ) : lookupsLoading ? (
            <select className={`${styles.input} ${styles.select}`} disabled value="">
              <option value="">A carregar…</option>
            </select>
          ) : (
            <select
              className={`${styles.input} ${styles.select}`}
              value={codEmpresa}
              onChange={(e) => {
                setCodEmpresa(e.target.value);
                setError(null);
              }}
              aria-label="Filtrar por empresa"
            >
              <option value="">Todas as empresas</option>
              {(lookups?.empresas ?? []).map((e) => (
                <option key={e.cod} value={String(e.cod)} title={`${e.nome} (${e.cod})`}>
                  {e.nome} ({e.cod})
                </option>
              ))}
            </select>
          )}
        </label>
        <label className={styles.field}>
          <span>Produto</span>
          {lookupsError ? (
            <input
              type="text"
              inputMode="numeric"
              className={styles.input}
              value={codItem}
              onChange={(e) => {
                setCodItem(sanitizeCodInput(e.target.value));
                setError(null);
              }}
              placeholder="Código ou vazio = todos"
            />
          ) : lookupsLoading ? (
            <select className={`${styles.input} ${styles.select}`} disabled value="">
              <option value="">A carregar…</option>
            </select>
          ) : (
            <select
              className={`${styles.input} ${styles.select}`}
              value={codItem}
              onChange={(e) => {
                setCodItem(e.target.value);
                setError(null);
              }}
              aria-label="Filtrar por produto"
            >
              <option value="">Todos os produtos</option>
              {itensParaSelect.map((p) => (
                <option key={p.cod} value={String(p.cod)} title={`${p.nome} (${p.cod})`}>
                  {p.nome} ({p.cod})
                </option>
              ))}
            </select>
          )}
        </label>
        <label className={styles.field}>
          <span>Unitários (célula)</span>
          <select
            className={`${styles.input} ${styles.select}`}
            value={unitAgg}
            onChange={(e) => {
              setUnitAgg(e.target.value === "sum_ratio" ? "sum_ratio" : "median_row");
              setError(null);
            }}
            aria-label="Agregação dos custos e valores unitários por célula da matriz"
          >
            <option value="median_row">Mediana (por linha, como Power BI)</option>
            <option value="sum_ratio">Média ponderada (DIVIDE SUM, SUM)</option>
          </select>
        </label>
        <div className={styles.actions}>
          <button type="submit" className={styles.btnPrimary} disabled={loading || !filtrosOk}>
            {loading ? "A carregar…" : "Aplicar filtros"}
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => void exportarXlsx()}
            disabled={rows.length === 0 || hierarchy.colEntries.length === 0}
          >
            <IconDownload size={18} stroke={2} />
            Exportar XLSX
          </button>
        </div>
      </form>

      {!filtrosOk && !error ? (
        <p className={styles.filterHint} role="status">
          Preencha as duas datas (período válido) para carregar o relatório.
        </p>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {!loading && hierarchy.companies.length > 0 ? (
        <p className={styles.expandHierarchyHint} role="note">
          <strong>Matriz:</strong> empresa → período → subcategoria; colunas: custo unitário e valor unitário (líquido),
          conforme <strong>Unitários (célula)</strong> acima.
        </p>
      ) : null}

      <div className={styles.tableWrap}>
        <table className={styles.matrixTable}>
          <thead>
            <tr>
              <th className={styles.colTree} rowSpan={2}>
                <span style={{ display: "block", lineHeight: 1.35 }}>
                  Empresa
                  <span
                    style={{
                      display: "block",
                      fontWeight: 500,
                      fontSize: "11px",
                      color: "#71717a",
                      marginTop: "0.2rem",
                    }}
                  >
                    Período → Subcategoria
                  </span>
                </span>
              </th>
              {hierarchy.colEntries.map((col) => (
                <th key={col.key} className={styles.colNum} colSpan={2}>
                  {col.nom}
                </th>
              ))}
            </tr>
            <tr>
              {hierarchy.colEntries.flatMap((col) => [
                <th key={`${col.key}-c`} className={styles.colNum}>
                  Valor Custo
                </th>,
                <th key={`${col.key}-u`} className={styles.colNum}>
                  Valor Unitário
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={1 + hierarchy.colEntries.length * 2}
                  className={styles.empty}
                  style={{ textAlign: "center" }}
                >
                  A carregar…
                </td>
              </tr>
            ) : hierarchy.companies.length > 0 ? (
              <>
                {bodyRows}
                <tr className={styles.rowTotal}>
                  <td className={styles.treeCell}>
                    <span className={styles.treeLabel}>Total</span>
                  </td>
                  {hierarchy.grandCells.map((cell, i) => {
                    const unitCusto = custoUnitarioDisplay(cell, unitAgg);
                    const unitVenda = valorUnitarioVendaDisplay(cell, unitAgg);
                    return (
                      <Fragment key={`g-${i}`}>
                        <td className={`${styles.numCell} ${styles.numCellCusto}`}>
                          {unitCusto == null ? "—" : fmtValorCustoPbi(unitCusto)}
                        </td>
                        <td className={styles.numCell}>
                          {unitVenda == null ? "—" : fmtValorUnitVendaPbi(unitVenda)}
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              </>
            ) : !error ? (
              <tr>
                <td colSpan={1 + hierarchy.colEntries.length * 2} className={styles.empty}>
                  Sem dados para este período e filtros.
                </td>
              </tr>
            ) : (
              <tr>
                <td colSpan={1 + Math.max(1, hierarchy.colEntries.length * 2)} className={styles.empty} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
