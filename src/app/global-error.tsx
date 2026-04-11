"use client";

/**
 * Erros na raiz (incl. falhas de chunk após deploy) não usam o layout normal.
 * Deve incluir html/body (documentação Next.js).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const msg = error?.message ?? "";
  const looksLikeChunk =
    /chunk|loading chunk|failed to fetch dynamically imported module/i.test(msg);

  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 520 }}>
        <h1 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>Erro na aplicação</h1>
        <p style={{ color: "#52525b", lineHeight: 1.6, marginBottom: "1rem" }}>
          {looksLikeChunk
            ? "Falha ao carregar parte da interface (versão antiga em cache ou deploy recente). Tente recarregar a página."
            : "Ocorreu um erro inesperado no navegador."}
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "0.5rem 1rem",
              fontWeight: 600,
              cursor: "pointer",
              borderRadius: 8,
              border: "1px solid #d4d4d8",
              background: "#fafafa",
            }}
          >
            Recarregar página
          </button>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "0.5rem 1rem",
              fontWeight: 600,
              cursor: "pointer",
              borderRadius: 8,
              border: "1px solid #2563eb",
              background: "#eff6ff",
              color: "#1d4ed8",
            }}
          >
            Tentar novamente
          </button>
        </div>
        {process.env.NODE_ENV === "development" && (
          <pre
            style={{
              marginTop: "1.25rem",
              fontSize: 12,
              overflow: "auto",
              padding: "0.75rem",
              background: "#f4f4f5",
              borderRadius: 6,
            }}
          >
            {msg}
          </pre>
        )}
      </body>
    </html>
  );
}
