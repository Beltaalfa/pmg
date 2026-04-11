"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  buildQuantidadeMargemMatrixTree,
  companyTotals,
  margemBruta,
  margemL,
  type MatrixCompanyAgg,
  type MatrixItemAgg,
} from "@/lib/queries/comercial/quantidade-margem-matrix-aggregate";
import type { QuantidadeMargemRow } from "@/lib/queries/comercial/quantidade-margem-shared";
import { IconDownload } from "@tabler/icons-react";
import type { QuantidadeMargemLookupsPayload } from "@/lib/queries/comercial/quantidade-margem-lookups-shared";
import { isValidIsoDate, localIsoDateFromDate, periodoValido } from "@/lib/iso-date";
import styles from "./quantidade-margem-matrix.module.css";

function defaultDateRange(): { dataInicio: string; dataFim: string } {
  const end = new Date();
  const start = new Date(end.getFullYear(), 0, 1);
  return {
    dataInicio: localIsoDateFromDate(start),
    dataFim: localIsoDateFromDate(end),
  };
}

/** Apenas dígitos; vazio = todos os registos. */
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
  /** Carrega ao abrir a página (período default), em paralelo com outras matrizes. */
  autoLoad?: boolean;
  /** Listas para filtros (empresa / produto); null = a carregar. */
  lookups: QuantidadeMargemLookupsPayload | null;
  lookupsError: string | null;
};

export function QuantidadeMargemMatrix({
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

  const tree = useMemo(() => buildQuantidadeMargemMatrixTree(rows), [rows]);

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
      const loaded = json.rows ?? [];
      setRows(loaded);
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
    const { companies, grand } = buildQuantidadeMargemMatrixTree(rows);
    const header = ["Empresa / item", "Quantidade", "Margem (L)", "Margem bruta", "Faturamento"];
    const data: (string | number)[][] = [];
    for (const c of companies) {
      const t = companyTotals(c.items);
      data.push([
        c.nomEmpresa,
        t.quantidade,
        margemL(t.quantidade, t.faturamento, t.custo),
        margemBruta(t.faturamento, t.custo),
        t.faturamento,
      ]);
      for (const it of c.items) {
        data.push([
          `  ${it.nomProduto}`,
          it.quantidade,
          margemL(it.quantidade, it.faturamento, it.custo),
          margemBruta(it.faturamento, it.custo),
          it.faturamento,
        ]);
      }
    }
    data.push([
      "Total",
      grand.quantidade,
      margemL(grand.quantidade, grand.faturamento, grand.custo),
      margemBruta(grand.faturamento, grand.custo),
      grand.faturamento,
    ]);
    const aoa = [header, ...data];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Quantidade x margem");
    const nome = `${exportFilePrefix}-${dataInicio}_${dataFim}.xlsx`;
    XLSX.writeFile(wb, nome);
  }, [rows, exportFilePrefix, dataInicio, dataFim]);

  const renderCells = (qtd: number, fat: number, custo: number) => {
    const mb = margemBruta(fat, custo);
    const ml = margemL(qtd, fat, custo);
    return (
      <>
        <td className={styles.numCell}>{fmtQtd(qtd)}</td>
        <td className={styles.numCell}>{fmtBrl(ml)}</td>
        <td className={styles.numCell}>{fmtBrl(mb)}</td>
        <td className={styles.numCell}>{fmtBrl(fat)}</td>
      </>
    );
  };

  const companyRow = (c: MatrixCompanyAgg, expanded: boolean, stripe: boolean) => {
    const t = companyTotals(c.items);
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
        {renderCells(t.quantidade, t.faturamento, t.custo)}
      </tr>
    );
  };

  const itemRow = (it: MatrixItemAgg, stripe: boolean) => {
    const trClass = [styles.rowItem, stripe ? styles.trStripe : ""].filter(Boolean).join(" ");
    return (
      <tr key={it.key} className={trClass}>
        <td className={`${styles.treeCell} ${styles.treeItem}`}>
          <span className={styles.treeLabel}>{it.nomProduto}</span>
        </td>
        {renderCells(it.quantidade, it.faturamento, it.custo)}
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
  const gMb = margemBruta(g.faturamento, g.custo);
  const gMl = margemL(g.quantidade, g.faturamento, g.custo);

  const filtrosOk = periodoValido(dataInicio, dataFim);
  const lookupsLoading = lookups === null && lookupsError === null;

  return (
    <section className={styles.section}>
      <div className={styles.periodBlock}>
        <h3 className={styles.matrixTitle}>{titulo}</h3>
        <h4 className={styles.matrixSubtitle}>Quantidade x Margem (L)</h4>
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
            title="Exporta a matriz agregada (empresa / item)"
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
              <th className={styles.colNum}>Quantidade</th>
              <th className={styles.colNum}>Margem (L)</th>
              <th className={styles.colNum}>Margem bruta</th>
              <th className={styles.colNum}>Faturamento</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className={styles.empty}>
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
                  <td className={styles.numCell}>{fmtQtd(g.quantidade)}</td>
                  <td className={styles.numCell}>{fmtBrl(gMl)}</td>
                  <td className={styles.numCell}>{fmtBrl(gMb)}</td>
                  <td className={styles.numCell}>{fmtBrl(g.faturamento)}</td>
                </tr>
              </>
            ) : !error ? (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  Sem dados para este período e filtros. Ajuste e clique em &quot;Aplicar filtros&quot;.
                </td>
              </tr>
            ) : (
              <tr>
                <td colSpan={5} className={styles.emptyMuted}>
                  Corrija o período ou tente novamente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className={styles.hint}>
        {rows.length > 0
          ? `${tree.companies.length} empresa(s), ${rows.length} linha(s) de detalhe agregadas`
          : "0 linha(s)"}
      </p>
    </section>
  );
}
