import Link from "next/link";
import { MargemVendaTabs } from "@/components/comercial/MargemVendaTabs";
import { getHubSetorById } from "@/lib/hub-setores";
import { isComercialGroupName } from "@/lib/pmg-comercial";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = { params: { setorId: string } };

export default async function AnaliseMargemVendaPage({ params }: Props) {
  const setor = await getHubSetorById(params.setorId);
  if (!setor || !isComercialGroupName(setor.name)) {
    notFound();
  }

  const setorHref = `/setor/${setor.id}`;

  return (
    <>
      <p style={{ marginBottom: "1rem", fontSize: 14 }}>
        <Link href={setorHref} style={{ color: "#2563eb", fontWeight: 500 }}>
          ← {setor.name}
        </Link>
        <span style={{ color: "#a1a1aa", margin: "0 0.5rem" }}>/</span>
        <span style={{ color: "#71717a" }}>Análise de Margem e Venda</span>
      </p>

      <h1 style={{ marginBottom: "0.35rem", fontSize: "1.5rem", fontWeight: 700 }}>
        Análise de Margem e Venda
      </h1>
      <p style={{ color: "#52525b", marginBottom: "1rem", lineHeight: 1.5 }}>
        Setor <strong>Comercial</strong>. Dados via PostgreSQL analítico; queries em{" "}
        <code style={{ fontSize: "0.88em" }}>analise-margem-venda.ts</code>,{" "}
        <code style={{ fontSize: "0.88em" }}>quantidade-margem-extract.ts</code> e{" "}
        <code style={{ fontSize: "0.88em" }}>volume-forma-pagamento-extract.ts</code>.
      </p>

      <p
        style={{
          marginBottom: "1.5rem",
          padding: "0.75rem 1rem",
          background: "#f0f9ff",
          border: "1px solid #bae6fd",
          borderRadius: 8,
          fontSize: 14,
          lineHeight: 1.5,
          color: "#0c4a6e",
        }}
      >
        <strong>Monitorização do cache</strong> (última atualização, forçar sync):{" "}
        <Link href="/admin/cache-quantidade-margem" style={{ color: "#0369a1", fontWeight: 600 }}>
          abrir página de administração
        </Link>
        . Também pode usar o item <strong>Cache margem</strong> no menu lateral.
      </p>

      <MargemVendaTabs />
    </>
  );
}
