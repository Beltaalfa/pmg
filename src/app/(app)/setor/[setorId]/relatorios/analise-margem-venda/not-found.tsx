import Link from "next/link";

export default function RelatorioMargemNotFound() {
  return (
    <>
      <h1 style={{ marginBottom: "0.75rem", fontSize: "1.25rem", fontWeight: 700 }}>Relatório não disponível</h1>
      <p style={{ color: "#52525b", marginBottom: "1rem", lineHeight: 1.5 }}>
        Este relatório existe apenas para o setor <strong>Comercial</strong> (Hub <code>Group</code>).
      </p>
      <Link href="/" style={{ color: "#2563eb", fontWeight: 500 }}>
        Voltar ao início
      </Link>
    </>
  );
}
