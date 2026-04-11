import { DashboardChart } from "@/components/DashboardChart";
import { getHubSetorById } from "@/lib/hub-setores";
import { comercialReportHref, isComercialGroupName } from "@/lib/pmg-comercial";
import {
  getDatabaseOverview,
  getDemoDailySeriesForSetor,
  getPublicTableCount,
} from "@/lib/queries";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = { params: { setorId: string } };

export default async function SetorDashboardPage({ params }: Props) {
  const setor = await getHubSetorById(params.setorId);
  if (!setor) {
    notFound();
  }

  let overview: Awaited<ReturnType<typeof getDatabaseOverview>>;
  let tableCount: number;
  let series: Awaited<ReturnType<typeof getDemoDailySeriesForSetor>>;
  let error: string | null = null;

  try {
    [overview, tableCount, series] = await Promise.all([
      getDatabaseOverview(),
      getPublicTableCount(),
      getDemoDailySeriesForSetor(setor.id),
    ]);
  } catch (e) {
    overview = null;
    tableCount = 0;
    series = [];
    error = e instanceof Error ? e.message : "Falha ao consultar o PostgreSQL analítico.";
  }

  const comercial = isComercialGroupName(setor.name);

  return (
    <>
      <h1 style={{ marginBottom: "0.5rem", fontSize: "1.5rem", fontWeight: 700 }}>{setor.name}</h1>
      <p style={{ color: "#52525b", marginBottom: "0.25rem" }}>Cliente: {setor.clientName}</p>
      <p style={{ fontSize: 13, color: "#71717a", marginBottom: "1.5rem" }}>
        <code>setorId</code> (Hub <code>Group.id</code>): {setor.id}
      </p>

      {comercial ? (
        <div
          style={{
            marginBottom: "1.5rem",
            padding: "1rem 1.25rem",
            borderRadius: 8,
            border: "1px solid #bfdbfe",
            background: "#eff6ff",
          }}
        >
          <p style={{ fontSize: 14, color: "#1e3a5f", marginBottom: "0.75rem", fontWeight: 500 }}>
            Relatório: Análise de Margem e Venda
          </p>
          <Link
            href={comercialReportHref(setor.id)}
            style={{
              display: "inline-block",
              fontSize: 14,
              fontWeight: 600,
              color: "#1d4ed8",
            }}
          >
            Abrir Análise de Margem e Venda →
          </Link>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          style={{
            padding: "1rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            color: "#991b1b",
          }}
        >
          <strong>Banco analítico indisponível.</strong> {error}
        </p>
      ) : (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            <div
              style={{
                padding: "1rem",
                border: "1px solid #e4e4e7",
                borderRadius: 8,
                background: "#fff",
              }}
            >
              <div style={{ fontSize: 12, color: "#71717a" }}>Banco analítico</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{overview?.name ?? "—"}</div>
            </div>
            <div
              style={{
                padding: "1rem",
                border: "1px solid #e4e4e7",
                borderRadius: 8,
                background: "#fff",
              }}
            >
              <div style={{ fontSize: 12, color: "#71717a" }}>Tabelas em public</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{tableCount}</div>
            </div>
          </section>

          <section style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: 16, marginBottom: "0.75rem", fontWeight: 600 }}>
              Série (exemplo por setorId)
            </h2>
            <p style={{ fontSize: 13, color: "#71717a", marginBottom: "0.5rem" }}>
              Substitua por KPIs reais com <code>WHERE hub_setor_id = $1</code> (ID do <code>Group</code> no
              Hub).
            </p>
            <DashboardChart data={series} />
          </section>
        </>
      )}
    </>
  );
}
