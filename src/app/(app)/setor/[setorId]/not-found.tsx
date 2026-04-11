import Link from "next/link";

export default function SetorNotFound() {
  return (
    <>
      <h1 style={{ marginBottom: "0.75rem", fontSize: "1.25rem", fontWeight: 700 }}>Setor não encontrado</h1>
      <p style={{ color: "#52525b", marginBottom: "1rem" }}>
        Esse ID não corresponde a um setor (<code>Group</code>) do Hub para o cliente configurado.
      </p>
      <Link href="/" style={{ color: "#2563eb", fontWeight: 500 }}>
        Voltar ao início
      </Link>
    </>
  );
}
