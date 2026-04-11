"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  buildProjecaoMatrixTree,
  getDataOntemIsoBrasil,
  type ProjecaoCompanyAgg,
  type ProjecaoItemAgg,
} from "@/lib/queries/comercial/quantidade-margem-projecao-calculo";
import type { QuantidadeMargemRow } from "@/lib/queries/comercial/quantidade-margem-shared";
import { IconDownload } from "@tabler/icons-react";
import type { QuantidadeMargemLookupsPayload } from "@/lib/queries/comercial/quantidade-margem-lookups-shared";
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

function fmtQtd(n: number): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Props = {
  titulo: string;
  exportFilePrefix: string;
  autoLoad?: boolean;
  lookups: QuantidadeMargemLookupsPayload | null;
  lookupsError: string | null;
};

export function QuantidadeMargemProjecaoMatrix({
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
  const [rows, setRows] = useState<QuantidadeMargemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const dataOntemLabel = getDataOntemIsoBrasil();
  const tree = useMemo(() => {
    const ont = getDataOntemIsoBrasil();
    return buildProjecaoMatrixTree(rows, {
      dataInicio,
      dataFim,
      dataOntem: ont,
    });
  }, [rows, dataInicio, dataFim]);

  const toggleCompany = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

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
      if (ce !== null) params.set("codEmpresa", String(ce));
      if (ci !== null) params.set("codItem", String(ci));

      const res = await fetch(
        `/api/relatorios/comercial/quantidade-margem-projecao?${params.toString()}`,
        { priority: "high", cache: "no-store" } as RequestInit
      );
      const json = (await res.json()) as { rows?: QuantidadeMargemRow[]; error?: string };
      if (!res.ok) {
        setRows([]);
        setError(json.error ?? `Erro HTTP ${res.status}`);
        return;
      }
      setRows(json.rows ?? []);
      setCollapsed(new Set());
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Falha na rede.");
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, codEmpresa, codItem]);

  const didAutoLoad = useRef(false);
  useEffect(() => {
    if (!autoLoad || didAutoLoad.current) return;
    if (!periodoValido(dataInicio, dataFim)) return;
    didAutoLoad.current = true;
    void carregar();
  }, [autoLoad, carregar, dataInicio, dataFim]);

  const exportarXlsx = useCallback(async () => {
    if (rows.length === 0) return;
    const XLSX = await import("xlsx");
    const dataOntemIso = getDataOntemIsoBrasil();
    const { companies, grand } = buildProjecaoMatrixTree(rows, {
      dataInicio,
      dataFim,
      dataOntem: dataOntemIso,
    });
    const header = [
      "Empresa / item",
      "Vendas até (L)",
      "Margem bruta",
      "Margem (L)",
      "Projeção vendas (L)",
      "Margem bruta projetada",
    ];
    const data: (string | number)[][] = [];
    for (const c of companies) {
      const t = c.totals;
      data.push([
        c.nomEmpresa,
        t.vendasAteMomentoLt,
        t.margemBruta,
        t.margemPorLitro,
        t.projecaoVendasLt,
        t.margemBrutaProjetada,
      ]);
      for (const it of c.items) {
        data.push([
          `  ${it.nomProduto}`,
          it.vendasAteMomentoLt,
          it.margemBruta,
          it.margemPorLitro,
          it.projecaoVendasLt,
          it.margemBrutaProjetada,
        ]);
      }
    }
    data.push([
      "Total",
      grand.vendasAteMomentoLt,
      grand.margemBruta,
      grand.margemPorLitro,
      grand.projecaoVendasLt,
      grand.margemBrutaProjetada,
    ]);
    const aoa = [header, ...data];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Projeção margem");
    const nome = `${exportFilePrefix}-${dataInicio}_${dataFim}.xlsx`;
    XLSX.writeFile(wb, nome);
  }, [rows, exportFilePrefix, dataInicio, dataFim]);

  const renderCells = (it: {
    vendasAteMomentoLt: number;
    margemBruta: number;
    margemPorLitro: number;
    projecaoVendasLt: number;
    margemBrutaProjetada: number;
  }) => (
    <>
      <td className={styles.numCell}>{fmtQtd(it.vendasAteMomentoLt)}</td>
      <td className={styles.numCell}>{fmtBrl(it.margemBruta)}</td>
      <td className={styles.numCell}>{fmtBrl(it.margemPorLitro)}</td>
      <td className={styles.numCell}>{fmtQtd(it.projecaoVendasLt)}</td>
      <td className={styles.numCell}>{fmtBrl(it.margemBrutaProjetada)}</td>
    </>
  );

  const companyRow = (c: ProjecaoCompanyAgg, expanded: boolean, stripe: boolean) => {
    const t = c.totals;
    const trClass = [styles.rowCompany, stripe ? styles.trStripe : ""].filter(Boolean).join(" ");
    return (
      <tr key={`co-${c.key}`} className={trClass}>
        <td className={styles.treeCell}>
          <button
            type="button"
            className={styles.treeToggle}
            onClick={() => toggleCompany(c.key)}
            aria-expanded={expanded}
            aria-label={expanded ? "Recolher itens" : "Expandir itens"}
          >
            {expanded ? "−" : "+"}
          </button>
          <span className={styles.treeLabel}>{c.nomEmpresa}</span>
        </td>
        {renderCells(t)}
      </tr>
    );
  };

  const itemRow = (it: ProjecaoItemAgg, stripe: boolean) => {
    const trClass = [styles.rowItem, stripe ? styles.trStripe : ""].filter(Boolean).join(" ");
    return (
      <tr key={it.key} className={trClass}>
        <td className={`${styles.treeCell} ${styles.treeItem}`}>
          <span className={styles.treeLabel}>{it.nomProduto}</span>
        </td>
        {renderCells(it)}
      </tr>
    );
  };

  let stripe = 0;
  const bodyRows: ReactNode[] = [];
  for (const c of tree.companies) {
    const expanded = !collapsed.has(c.key);
    const sCo = stripe % 2 === 1;
    bodyRows.push(companyRow(c, expanded, sCo));
    stripe++;
    if (expanded) {
      for (const it of c.items) {
        const sIt = stripe % 2 === 1;
        bodyRows.push(itemRow(it, sIt));
        stripe++;
      }
    }
  }

  const g = tree.grand;
  const filtrosOk = periodoValido(dataInicio, dataFim);
  const lookupsLoading = lookups === null && lookupsError === null;
  const nEmp = tree.companies.length;
  const nLinhas = tree.companies.reduce((acc, c) => acc + c.items.length, 0);

  return (
    <section className={styles.section}>
      <div className={styles.periodBlock}>
        <h3 className={styles.matrixTitle}>{titulo}</h3>
        <h4 className={styles.matrixSubtitle}>Quantidade × Margem até o dia e projeção</h4>
        <p className={styles.filterHint} style={{ marginTop: 8 }}>
          Data de referência (ontem, America/Sao_Paulo): <strong>{dataOntemLabel}</strong>.
          {tree.periodoCruzaMeses ? (
            <>
              {" "}
              <span style={{ color: "#b45309" }}>
                O período cruza meses — a projeção usa o mês de <strong>{dataFim}</strong> como no PBI.
              </span>
            </>
          ) : null}
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
          <span>Empresa</span>
          {lookupsError ? (
            <>
              <p className={styles.lookupsWarn}>
                Não foi possível carregar a lista ({lookupsError}). Indique o código numérico.
              </p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Código ou vazio = todas"
                value={codEmpresa}
                onChange={(e) => {
                  setCodEmpresa(sanitizeCodInput(e.target.value));
                  setError(null);
                }}
                className={styles.input}
              />
            </>
          ) : lookupsLoading ? (
            <select className={`${styles.input} ${styles.select}`} disabled value="">
              <option value="">A carregar empresas…</option>
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
              autoComplete="off"
              placeholder="Código ou vazio = todos"
              value={codItem}
              onChange={(e) => {
                setCodItem(sanitizeCodInput(e.target.value));
                setError(null);
              }}
              className={styles.input}
            />
          ) : lookupsLoading ? (
            <select className={`${styles.input} ${styles.select}`} disabled value="">
              <option value="">A carregar produtos…</option>
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
              {(lookups?.itens ?? []).map((p) => (
                <option key={p.cod} value={String(p.cod)} title={`${p.nome} (${p.cod})`}>
                  {p.nome} ({p.cod})
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
            onClick={exportarXlsx}
            disabled={rows.length === 0}
            title="Exportar matriz agregada"
          >
            <IconDownload size={18} stroke={2} />
            Exportar XLSX
          </button>
        </div>
      </form>

      {!filtrosOk && !error ? (
        <p className={styles.filterHint} role="status">
          Preencha as duas datas (período válido: início ≤ fim) para carregar o relatório.
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
              <th className={styles.colTree}>Empresa</th>
              <th className={styles.colNum}>Vendas até (L)</th>
              <th className={styles.colNum}>Margem bruta</th>
              <th className={styles.colNum}>Margem (L)</th>
              <th className={styles.colNum}>Projeção vendas (L)</th>
              <th className={styles.colNum}>Margem bruta proj.</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  A carregar…
                </td>
              </tr>
            ) : rows.length > 0 ? (
              <>
                {bodyRows}
                <tr className={styles.rowTotal}>
                  <td className={styles.treeCell}>
                    <span className={styles.treeLabel}>Total</span>
                  </td>
                  {renderCells(g)}
                </tr>
              </>
            ) : !error ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  Sem dados para este período e filtros. Ajuste e clique em &quot;Aplicar filtros&quot;.
                </td>
              </tr>
            ) : (
              <tr>
                <td colSpan={6} className={styles.empty} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && !loading ? (
        <p className={styles.footerHint} style={{ marginTop: "0.75rem", fontSize: 13, color: "#71717a" }}>
          {nEmp} empresa(s), {nLinhas} linha(s) de detalhe agregadas.
        </p>
      ) : null}
    </section>
  );
}
