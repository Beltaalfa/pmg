"use client";

import Link from "next/link";
import { IconDatabase } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { QuantidadeMargemLookupsPayload } from "@/lib/queries/comercial/quantidade-margem-lookups-shared";
import { QuantidadeMargemMatrix } from "./QuantidadeMargemMatrix";
import { QuantidadeMargemProjecaoMatrix } from "./QuantidadeMargemProjecaoMatrix";
import styles from "./margem-venda-tabs.module.css";

const TABS = [
  { id: "qm", label: "Quantidade x Margem" },
  { id: "qmProj", label: "Quantidade × Margem até o dia e projeção" },
] as const;

export function MargemVendaTabs() {
  const [active, setActive] = useState<(typeof TABS)[number]["id"]>("qm");
  const [lookups, setLookups] = useState<QuantidadeMargemLookupsPayload | null>(null);
  const [lookupsError, setLookupsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/relatorios/comercial/quantidade-margem/lookups", {
          cache: "no-store",
        });
        const json = (await res.json()) as QuantidadeMargemLookupsPayload & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setLookups(null);
          setLookupsError(json.error ?? `Erro ao carregar listas (${res.status}).`);
          return;
        }
        setLookups({
          empresas: Array.isArray(json.empresas) ? json.empresas : [],
          itens: Array.isArray(json.itens) ? json.itens : [],
        });
        setLookupsError(null);
      } catch (e) {
        if (!cancelled) {
          setLookups(null);
          setLookupsError(e instanceof Error ? e.message : "Falha ao carregar listas.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className={styles.tabBar} role="tablist" aria-label="Dashboards do relatório">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            className={`${styles.tab} ${active === t.id ? styles.tabActive : ""}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.tabPanel} role="tabpanel" hidden={active !== "qm"}>
        {active === "qm" ? (
          <div>
            <p style={{ color: "#52525b", marginBottom: "1.25rem", lineHeight: 1.5, fontSize: 14 }}>
              Comparativo entre dois períodos: configure filtros independentes em cada matriz e carregue os
              dados. Condições fixas: excluir operador <code>367</code> (inclui fechamentos com operador
              nulo); apenas <code>tab_item.cod_subgrupo_item = 1</code>.{" "}
              <Link
                href="/admin/cache-quantidade-margem"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  color: "#0369a1",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                <IconDatabase size={16} stroke={2} aria-hidden />
                Monitorização do cache
              </Link>
            </p>
            <QuantidadeMargemMatrix
              titulo="Matriz — período A"
              exportFilePrefix="quantidade-margem-periodo-a"
              autoLoad
              lookups={lookups}
              lookupsError={lookupsError}
            />
            <QuantidadeMargemMatrix
              titulo="Matriz — período B"
              exportFilePrefix="quantidade-margem-periodo-b"
              autoLoad
              lookups={lookups}
              lookupsError={lookupsError}
            />
          </div>
        ) : null}
      </div>

      <div className={styles.tabPanel} role="tabpanel" hidden={active !== "qmProj"}>
        {active === "qmProj" ? (
          <div>
            <p style={{ color: "#52525b", marginBottom: "1.25rem", lineHeight: 1.5, fontSize: 14 }}>
              Inclui vendas do operador <code>367</code>; apenas <code>tab_item.cod_subgrupo_item = 1</code>.
              Projeção alinhada ao Power BI (média diária × dias do mês quando o mês de venda coincide com o
              mês atual). Requer cache <code>quantidade_margem_projecao</code> preenchido pelo mesmo job de
              sincronização.{" "}
              <Link
                href="/admin/cache-quantidade-margem"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  color: "#0369a1",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                <IconDatabase size={16} stroke={2} aria-hidden />
                Monitorização do cache
              </Link>
            </p>
            <QuantidadeMargemProjecaoMatrix
              titulo="Matriz — projeção"
              exportFilePrefix="quantidade-margem-projecao"
              autoLoad
              lookups={lookups}
              lookupsError={lookupsError}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
