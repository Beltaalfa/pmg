"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildVolumeFormaPagamentoMatrix,
  type VolumeFormaPagamentoFlatRow,
} from "@/lib/queries/comercial/volume-forma-pagamento-matrix-aggregate";
import type { VolumeFormaPagamentoRow } from "@/lib/queries/comercial/volume-forma-pagamento-extract";
import type { QuantidadeMargemLookupsPayload } from "@/lib/queries/comercial/quantidade-margem-lookups-shared";
import { IconDownload } from "@tabler/icons-react";
import { isValidIsoDate, localIsoDateFromDate, periodoValido } from "@/lib/iso-date";
import styles from "./quantidade-margem-matrix.module.css";

export type VolumeFormaPagamentoDefaultPeriod = "currentMonth" | "previousMonth";

function defaultDateRange(which: VolumeFormaPagamentoDefaultPeriod): {
  dataInicio: string;
  dataFim: string;
} {
  const today = new Date();
  if (which === "currentMonth") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      dataInicio: localIsoDateFromDate(start),
      dataFim: localIsoDateFromDate(today),
    };
  }
  const lastDayPrev = new Date(today.getFullYear(), today.getMonth(), 0);
  const firstDayPrev = new Date(lastDayPrev.getFullYear(), lastDayPrev.getMonth(), 1);
  return {
    dataInicio: localIsoDateFromDate(firstDayPrev),
    dataFim: localIsoDateFromDate(lastDayPrev),
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

/** Formata quantidade (`qtd_item` agregada). */
function fmtQuantidade(n: number): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function fmtPct(n: number): string {
  return `${n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

type Props = {
  titulo: string;
  exportFilePrefix: string;
  autoLoad?: boolean;
  lookups: QuantidadeMargemLookupsPayload | null;
  lookupsError: string | null;
  /** Período inicial dos filtros: mês corrente (A) ou mês civil anterior (B), para comparar lado a lado. */
  defaultPeriod?: VolumeFormaPagamentoDefaultPeriod;
};

export function VolumeFormaPagamentoMatrix({
  titulo,
  exportFilePrefix,
  autoLoad = false,
  lookups,
  lookupsError,
  defaultPeriod = "currentMonth",
}: Props) {
  const defaults = useMemo(() => defaultDateRange(defaultPeriod), [defaultPeriod]);
  const [dataInicio, setDataInicio] = useState(defaults.dataInicio);
  const [dataFim, setDataFim] = useState(defaults.dataFim);
  const [codEmpresa, setCodEmpresa] = useState("");
  const [rows, setRows] = useState<VolumeFormaPagamentoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matrix = useMemo(() => buildVolumeFormaPagamentoMatrix(rows), [rows]);

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
      const params = new URLSearchParams({ dataInicio, dataFim });
      const ce = parseOptionalCod(codEmpresa);
      if (ce !== null) params.set("codEmpresa", String(ce));

      const res = await fetch(`/api/relatorios/comercial/volume-forma-pagamento?${params.toString()}`, {
        priority: "high",
        cache: "no-store",
      } as RequestInit);
      const json = (await res.json()) as { rows?: VolumeFormaPagamentoRow[]; error?: string };
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
  }, [dataInicio, dataFim, codEmpresa]);

  const didAutoLoad = useRef(false);
  useEffect(() => {
    if (!autoLoad || didAutoLoad.current) return;
    if (!periodoValido(dataInicio, dataFim)) return;
    didAutoLoad.current = true;
    void carregar();
  }, [autoLoad, carregar, dataInicio, dataFim]);

  const exportarXlsx = useCallback(async () => {
    if (rows.length === 0 || matrix.monthKeys.length === 0) return;
    const XLSX = await import("xlsx");
    const header = ["Nível", "Descrição"];
    for (const mk of matrix.monthKeys) {
      header.push(`${mk} — Quantidade`, `${mk} — %`);
    }
    header.push("Total — Quantidade", "Total — %");
    const data: (string | number)[][] = [header];
    for (const fr of matrix.flatRows) {
      const line: (string | number)[] = [String(fr.level), fr.label];
      fr.cells.forEach((c) => {
        line.push(Number(c.volume.toFixed(2)), Number(c.pct.toFixed(2)));
      });
      data.push(line);
    }
    const totVol = matrix.columnTotals;
    const totLine: (string | number)[] = ["Total", "Total"];
    totVol.forEach((v, i) => {
      const pct = totVol[i]! > 0 ? 100 : 0;
      totLine.push(Number(v.toFixed(2)), pct);
    });
    data.push(totLine);
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Qtd forma pagto");
    XLSX.writeFile(wb, `${exportFilePrefix}-${dataInicio}_${dataFim}.xlsx`);
  }, [rows.length, matrix, exportFilePrefix, dataInicio, dataFim]);

  const filtrosOk = periodoValido(dataInicio, dataFim);
  const lookupsLoading = lookups === null && lookupsError === null;
  const colSpan = 1 + matrix.monthKeys.length * 2 + 2;

  function rowClass(fr: VolumeFormaPagamentoFlatRow, stripe: boolean): string {
    const base =
      fr.level === 0 ? styles.rowCompany : fr.level === 1 ? styles.rowMonth : styles.rowItem;
    const s = stripe ? styles.trStripe : "";
    return [base, s].filter(Boolean).join(" ");
  }

  function treeCellClass(fr: VolumeFormaPagamentoFlatRow): string {
    if (fr.level === 0) return `${styles.treeCell}`;
    if (fr.level === 1) return `${styles.treeCell} ${styles.treeIndentMonth}`;
    return `${styles.treeCell} ${styles.treeItem}`;
  }

  return (
    <section className={styles.section}>
      <div className={styles.periodBlock}>
        <h3 className={styles.matrixTitle}>{titulo}</h3>
        <h4 className={styles.matrixSubtitle}>Quantidade por forma de pagamento</h4>
        <p className={styles.filterHint} style={{ marginTop: 8 }}>
          Apenas produtos com <code>tab_item.cod_subgrupo_item = 1</code> (com <code>tab_subgrupo_item</code>). Base
          alinhada à query de referência: <code>tab_cupom_fiscal</code> + itens (não cancelados) +{" "}
          <code>tab_pagamento_cupom</code> (todas as linhas do cupom entram no divisor <code>n_pag</code>). A{" "}
          <strong>quantidade</strong> (<code>qtd_item</code>) de cada linha de item reparte-se em partes iguais por
          linha de pagamento no mesmo cupom. Uma forma com vários grupos no
          ERP aparece só num grupo (primeiro <code>cod_grupo</code> na relação). Nome da forma: catálogo PDV ou, em
          falta, <code>des_forma_pagto_ecf</code> no pagamento. A coluna{" "}
          <strong>%</strong> é a quantidade da célula face ao <strong>total da coluna</strong> (todos os grupos no
          período) — validar com o Power BI num caso concreto. Requer espelho com tabelas de cupom e pagamento (
          <code>npm run mirror:introspect</code> + sync).
        </p>
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
          <span>Empresa</span>
          {lookupsError ? (
            <input
              type="text"
              inputMode="numeric"
              className={styles.input}
              value={codEmpresa}
              onChange={(e) => setCodEmpresa(sanitizeCodInput(e.target.value))}
              placeholder="Código (opcional)"
            />
          ) : lookupsLoading ? (
            <select className={`${styles.input} ${styles.select}`} disabled value="">
              <option value="">A carregar…</option>
            </select>
          ) : (
            <select
              className={`${styles.input} ${styles.select}`}
              value={codEmpresa}
              onChange={(e) => setCodEmpresa(e.target.value)}
            >
              <option value="">Todas</option>
              {(lookups?.empresas ?? []).map((x) => (
                <option key={x.cod} value={String(x.cod)}>
                  {x.nome} ({x.cod})
                </option>
              ))}
            </select>
          )}
        </label>
        <div className={styles.actions}>
          <button type="submit" className={styles.btnPrimary} disabled={loading || !filtrosOk}>
            {loading ? "A carregar…" : "Aplicar filtros"}
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => void exportarXlsx()}
            disabled={rows.length === 0 || matrix.monthKeys.length === 0}
          >
            <IconDownload size={18} stroke={2} />
            Exportar XLSX
          </button>
        </div>
      </form>

      {!filtrosOk && !error ? (
        <p className={styles.filterHint} role="status">
          Preencha as duas datas (período válido) para carregar.
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.tableWrap}>
        <table className={styles.matrixTable}>
          <thead>
            <tr>
              <th className={styles.colTree} rowSpan={2}>
                Empresa / Grupo / Forma
              </th>
              {matrix.monthKeys.map((mk) => (
                <th key={mk} className={styles.colNum} colSpan={2}>
                  {mk}
                </th>
              ))}
              <th className={styles.colNum} colSpan={2}>
                Total
              </th>
            </tr>
            <tr>
              {matrix.monthKeys.flatMap((mk) => [
                <th key={`${mk}-v`} className={styles.colNum}>
                  Quantidade
                </th>,
                <th key={`${mk}-p`} className={styles.colNum}>
                  %
                </th>,
              ])}
              <th className={styles.colNum} key="tot-v">
                Quantidade
              </th>
              <th className={styles.colNum} key="tot-p">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colSpan} className={styles.empty} style={{ textAlign: "center" }}>
                  A carregar…
                </td>
              </tr>
            ) : matrix.flatRows.length > 0 ? (
              <>
                {matrix.flatRows.map((fr, idx) => {
                  const stripe = idx % 2 === 1;
                  return (
                    <tr key={fr.key} className={rowClass(fr, stripe)}>
                      <td className={treeCellClass(fr)}>
                        {fr.level > 0 ? <span className={styles.treeIndentSpacer} aria-hidden /> : null}
                        <span
                          className={`${styles.treeLabel} ${fr.bold ? "" : ""}`}
                          style={fr.bold ? { fontWeight: 700 } : undefined}
                        >
                          {fr.label}
                        </span>
                      </td>
                      {fr.cells.map((c, i) => (
                        <Fragment key={`c-${i}`}>
                          <td className={styles.numCell}>{fmtQuantidade(c.volume)}</td>
                          <td className={styles.numCell}>{fmtPct(c.pct)}</td>
                        </Fragment>
                      ))}
                    </tr>
                  );
                })}
                <tr className={styles.rowTotal}>
                  <td className={styles.treeCell}>
                    <span className={styles.treeLabel}>Total</span>
                  </td>
                  {matrix.columnTotals.map((v, i) => (
                    <Fragment key={`t-${i}`}>
                      <td className={styles.numCell}>{fmtQuantidade(v)}</td>
                      <td className={styles.numCell}>{fmtPct(v > 0 ? 100 : 0)}</td>
                    </Fragment>
                  ))}
                </tr>
              </>
            ) : !error ? (
              <tr>
                <td colSpan={colSpan} className={styles.empty}>
                  Sem dados para este período e filtros.
                </td>
              </tr>
            ) : (
              <tr>
                <td colSpan={Math.max(2, colSpan)} className={styles.empty} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
