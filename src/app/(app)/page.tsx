import { isHubDatabaseConfigured } from "@/lib/hub-setores";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let hubError: string | null = null;
  if (!isHubDatabaseConfigured()) {
    hubError =
      "Configure HUB_DATABASE_URL, HUB_CLIENT_ID (ou HUB_CLIENT_NAME) no .env para listar setores do Hub.";
  }

  return (
    <>
      <h1 style={{ marginBottom: "0.5rem", fontSize: "1.5rem", fontWeight: 700 }}>Início</h1>
      <p style={{ color: "#52525b", marginBottom: "1.5rem", lineHeight: 1.5 }}>
        Escolha um <strong>setor</strong> na barra lateral para abrir o dashboard. Os setores vêm do
        north/hub (modelo <code style={{ fontSize: "0.85em" }}>Group</code>). KPIs em{" "}
        <code style={{ fontSize: "0.85em" }}>src/lib/queries.ts</code>.
      </p>

      {hubError ? (
        <p
          role="alert"
          style={{
            padding: "1rem",
            background: "#fffbeb",
            border: "1px solid #fcd34d",
            borderRadius: 8,
            color: "#92400e",
          }}
        >
          <strong>Metadados do Hub.</strong> {hubError}
        </p>
      ) : (
        <p style={{ color: "#71717a", fontSize: 14 }}>
          Use o menu à esquerda para navegar entre os setores.
        </p>
      )}
    </>
  );
}
