"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TicketMedioCombustivelRow } from "@/lib/queries/comercial/ticket-medio-combustivel-extract";
import type { QuantidadeMargemLookupsPayload } from "@/lib/queries/comercial/quantidade-margem-lookups-shared";
import { IconDownload } from "@tabler/icons-react";
import { isValidIsoDate, localIsoDateFromDate, periodoValido } from "@/lib/iso-date";
import styles from "./quantidade-margem-matrix.module.css";

export type TicketMedioCombustivelDefaultPeriod = "currentMonth" | "previousMonth";

function defaultDateRange(which: TicketMedioCombustivelDefaultPeriod): {
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

function fmtInt(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function fmtDec(n: number, max = 4): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: max,
  });
}

function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Props = {
  titulo: string;
  exportFilePrefix: string;
  autoLoad?: boolean;
  lookups: QuantidadeMargemLookupsPayload | null;
  lookupsError: string | null;
  defaultPeriod?: TicketMedioCombustivelDefaultPeriod;
};

function rowKey(r: TicketMedioCombustivelRow): string {
  return `${r.cod_empresa}-${r.nivel}-${r.cod_item ?? "e"}-${r.faixa_litros ?? ""}`;
}

function treeLabel(r: TicketMedioCombustivelRow): string {
  if (r.nivel === "empresa") return r.nom_empresa;
  if (r.nivel === "item") return r.des_item ?? `Item ${r.cod_item}`;
  return r.faixa_litros ?? "";
}

export function TicketMedioCombustivelMatrix({
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
  const [rows, setRows] = useState<TicketMedioCombustivelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      const res = await fetch(`/api/relatorios/comercial/ticket-medio-combustivel?${params.toString()}`, {
        priority: "high",
        cache: "no-store",
      } as RequestInit);
      const json = (await res.json()) as { rows?: TicketMedioCombustivelRow[]; error?: string };
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
    if (rows.length === 0) return;
    const XLSX = await import("xlsx");
    const header = [
      "Nível",
      "Empresa / Combustível / Faixa",
      "Cupons emitidos",
      "Volume médio",
      "Volume total",
      "Ticket médio (R$)",
      "Faturamento total (R$)",
    ];
    const data: (string | number)[][] = [header];
    for (const r of rows) {
      data.push([
        r.nivel,
        treeLabel(r),
        r.cupons_emitidos,
        r.volume_medio,
        r.volume_total,
        r.ticket_medio,
        r.faturamento_total,
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ticket médio combustível");
    XLSX.writeFile(wb, `${exportFilePrefix}-${dataInicio}_${dataFim}.xlsx`);
  }, [rows, exportFilePrefix, dataInicio, dataFim]);

  const filtrosOk = periodoValido(dataInicio, dataFim);
  const lookupsLoading = lookups === null && lookupsError === null;
  const colSpan = 6;

  function rowClass(r: TicketMedioCombustivelRow, stripe: boolean): string {
    const base =
      r.nivel === "empresa" ? styles.rowCompany : r.nivel === "item" ? styles.rowMonth : styles.rowItem;
    const s = stripe ? styles.trStripe : "";
    return [base, s].filter(Boolean).join(" ");
  }

  function treeCellClass(r: TicketMedioCombustivelRow): string {
    if (r.nivel === "empresa") return styles.treeCell;
    if (r.nivel === "item") return `${styles.treeCell} ${styles.treeIndentMonth}`;
    return `${styles.treeCell} ${styles.treeItem}`;
  }

  return (
    <section className={styles.section}>
      <div className={styles.periodBlock}>
        <h3 className={styles.matrixTitle}>{titulo}</h3>
        <h4 className={styles.matrixSubtitle}>Ticket médio combustível</h4>
        <p className={styles.filterHint} style={{ marginTop: 8 }}>
          Mesma base que «Valor por Forma de Pagamento»: cupons não cancelados, itens de combustível (
          <code>tab_item.cod_subgrupo_item = 1</code>), valor da linha ={" "}
          <code>COALESCE(tab_resumo_venda_item.val_liquido, tab_item_cupom_fiscal.val_total_item)</code>. Faixas de
          litragem por linha (<code>qtd_item</code>). Sem repartição por forma de pagamento.
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
            disabled={rows.length === 0}
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
              <th className={styles.colTree}>Empresa / Combustível / Faixa</th>
              <th className={styles.colNum}>Cupons emitidos</th>
              <th className={styles.colNum}>Volume médio</th>
              <th className={styles.colNum}>Volume total</th>
              <th className={styles.colNum}>Ticket médio</th>
              <th className={styles.colNum}>Faturamento total</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colSpan} className={styles.empty} style={{ textAlign: "center" }}>
                  A carregar…
                </td>
              </tr>
            ) : rows.length > 0 ? (
              rows.map((r, idx) => {
                const stripe = idx % 2 === 1;
                const bold = r.nivel === "empresa" || r.nivel === "item";
                return (
                  <tr key={rowKey(r)} className={rowClass(r, stripe)}>
                    <td className={treeCellClass(r)}>
                      {r.nivel !== "empresa" ? (
                        <span className={styles.treeIndentSpacer} aria-hidden />
                      ) : null}
                      <span className={styles.treeLabel} style={bold ? { fontWeight: 700 } : undefined}>
                        {treeLabel(r)}
                      </span>
                    </td>
                    <td className={styles.numCell}>{fmtInt(Math.round(r.cupons_emitidos))}</td>
                    <td className={styles.numCell}>{fmtDec(r.volume_medio)}</td>
                    <td className={styles.numCell}>{fmtDec(r.volume_total)}</td>
                    <td className={styles.numCell}>{fmtBRL(r.ticket_medio)}</td>
                    <td className={styles.numCell}>{fmtBRL(r.faturamento_total)}</td>
                  </tr>
                );
              })
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
