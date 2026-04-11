"use client";

import { IconRefresh } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";

type StatusPayload = {
  ok: boolean;
  modoRelatorio: "cache" | "direct";
  rowCount: number | null;
  lastSyncedAt: string | null;
  rowCountProjecao: number | null;
  lastSyncedAtProjecao: string | null;
  modoRelatorioProjecao: "cache" | "direct";
  dateWindowStart: string | null;
  dateWindowEnd: string | null;
  sourceConfigured: boolean;
  error?: string;
  syncEndpointConfigured?: boolean;
};

type ApiErrorBody = { ok?: boolean; error?: string };

function formatDateTime(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(d);
  } catch {
    return iso;
  }
}

const STORAGE_KEY = "pmg_admin_sync_token";

/** Mesmo valor que PMG_ADMIN_SYNC_SECRET; só no cliente (build). Não colocar no HTML inicial — aplicado no mount. */
function publicUiToken(): string {
  return process.env.NEXT_PUBLIC_PMG_ADMIN_UI_TOKEN?.trim() ?? "";
}

export function CacheQuantidadeMargemMonitor() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  /** Erros reais (rede, 401, 503, etc.) — não usar para “ainda não introduziu token”. */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [tokenFromEnv, setTokenFromEnv] = useState(false);

  const fetchStatus = useCallback(async (explicitToken?: string) => {
    const t = (explicitToken ?? token).trim();
    if (!t) {
      setStatus(null);
      setLoadError(null);
      setLoading(false);
      return;
    }

    setLoadError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/cache-quantidade-margem", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = (await res.json()) as StatusPayload & ApiErrorBody;

      if (res.status === 401) {
        setStatus(null);
        setLoadError(data.error ?? "Token inválido ou em falta.");
        return;
      }
      if (res.status === 503) {
        setStatus(null);
        setLoadError(
          typeof data.error === "string"
            ? data.error
            : "Servidor sem PMG_ADMIN_SYNC_SECRET configurado."
        );
        return;
      }
      if (!res.ok) {
        setStatus(null);
        setLoadError(`Erro HTTP ${res.status}`);
        return;
      }

      setStatus(data);
    } catch (e) {
      setStatus(null);
      setLoadError(e instanceof Error ? e.message : "Falha ao carregar estado.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY)?.trim() ?? "";
    const envTok = publicUiToken();
    const t = saved || envTok;
    if (t) {
      setToken(t);
      setTokenFromEnv(Boolean(envTok && !saved));
      if (!saved && envTok) {
        sessionStorage.setItem(STORAGE_KEY, envTok);
      }
      void fetchStatus(t);
    } else {
      void fetchStatus(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intencional: só no mount
  }, []);

  async function handleSync() {
    setSyncMessage(null);
    if (!token.trim()) {
      setSyncMessage("Introduza o token administrativo (igual a PMG_ADMIN_SYNC_SECRET no servidor).");
      return;
    }
    setSyncing(true);
    try {
      sessionStorage.setItem(STORAGE_KEY, token.trim());
      const res = await fetch("/api/admin/cache-quantidade-margem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.trim()}`,
        },
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        rowCount?: number;
        rowCountProjecao?: number;
        durationMs?: number;
        dateStart?: string;
        dateEnd?: string;
      };
      if (!res.ok || !data.ok) {
        setSyncMessage(data.error ?? `Erro HTTP ${res.status}`);
        return;
      }
      setSyncMessage(
        `Sincronização concluída: ${data.rowCount ?? 0} linhas (margem) + ${data.rowCountProjecao ?? 0} (projeção) em ${data.durationMs ?? 0} ms (janela ${data.dateStart ?? "—"} … ${data.dateEnd ?? "—"}).`
      );
      await fetchStatus(token.trim());
    } catch (e) {
      setSyncMessage(e instanceof Error ? e.message : "Falha ao sincronizar.");
    } finally {
      setSyncing(false);
    }
  }

  const needsTokenHint = !token.trim() && !loading && !status && !loadError;

  return (
    <div style={{ maxWidth: 560 }}>
      <p style={{ color: "#52525b", marginBottom: "1.25rem", lineHeight: 1.55 }}>
        Esta página e a API estão protegidas pelo mesmo segredo que{" "}
        <code style={{ fontSize: "0.88em" }}>PMG_ADMIN_SYNC_SECRET</code>. Acompanhe a última atualização
        das tabelas <strong>quantidade_margem</strong> e <strong>quantidade_margem_projecao</strong> (mesmo
        job) e force uma nova sincronização quando precisar (pode demorar vários minutos e aumenta carga no
        ERP).
      </p>

      <div
        style={{
          padding: "1rem",
          background: "#fafafa",
          border: "1px solid #e4e4e7",
          borderRadius: 8,
          marginBottom: "1.25rem",
        }}
      >
        <label
          htmlFor="pmg-sync-token"
          style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}
        >
          Token administrativo
        </label>
        <input
          id="pmg-sync-token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && token.trim() && !loading) {
              e.preventDefault();
              sessionStorage.setItem(STORAGE_KEY, token.trim());
              void fetchStatus(token.trim());
            }
          }}
          placeholder="Mesmo valor que PMG_ADMIN_SYNC_SECRET no servidor"
          style={{
            width: "100%",
            maxWidth: 420,
            padding: "0.5rem 0.65rem",
            borderRadius: 6,
            border: "1px solid #d4d4d8",
            fontSize: 14,
            marginBottom: "0.75rem",
          }}
        />
        <p style={{ fontSize: 13, color: "#71717a", marginBottom: "0.75rem", lineHeight: 1.45 }}>
          {publicUiToken() ? (
            <>
              Token pré-configurado via <code style={{ fontSize: "0.92em" }}>NEXT_PUBLIC_PMG_ADMIN_UI_TOKEN</code>{" "}
              (deve ser igual a <code style={{ fontSize: "0.92em" }}>PMG_ADMIN_SYNC_SECRET</code>). O estado
              carrega ao abrir a página. Pode usar <strong>Carregar estado</strong> para atualizar e{" "}
              <strong>Sincronizar agora</strong> para forçar o sync.
            </>
          ) : (
            <>
              1) Cole o token &nbsp;→&nbsp; 2) clique em <strong>Carregar estado</strong> (ou Enter no
              campo). Depois pode usar <strong>Sincronizar agora</strong>.
            </>
          )}
        </p>
        {tokenFromEnv ? (
          <p style={{ fontSize: 12, color: "#a16207", marginBottom: "0.75rem", lineHeight: 1.4 }}>
            Aviso: este token fica embutido no JavaScript público. Use só em rede / VPN confiáveis.
          </p>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => {
              if (!token.trim()) return;
              sessionStorage.setItem(STORAGE_KEY, token.trim());
              void fetchStatus(token.trim());
            }}
            disabled={loading || !token.trim()}
            style={{
              padding: "0.5rem 1rem",
              fontSize: 15,
              fontWeight: 600,
              color: "#fff",
              background: loading || !token.trim() ? "#a1a1aa" : "#0369a1",
              border: "none",
              borderRadius: 8,
              cursor: loading || !token.trim() ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "A carregar…" : "Carregar estado"}
          </button>
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={syncing || !token.trim()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "0.5rem 1rem",
              fontSize: 15,
              fontWeight: 600,
              color: "#fff",
              background: syncing || !token.trim() ? "#a1a1aa" : "#18181b",
              border: "none",
              borderRadius: 8,
              cursor: syncing || !token.trim() ? "not-allowed" : "pointer",
            }}
          >
            <IconRefresh size={18} stroke={2} />
            {syncing ? "A sincronizar…" : "Sincronizar agora"}
          </button>
        </div>
        {syncMessage ? (
          <p
            role="status"
            style={{
              marginTop: "0.85rem",
              fontSize: 14,
              color: syncMessage.startsWith("Sincronização concluída") ? "#166534" : "#b91c1c",
            }}
          >
            {syncMessage}
          </p>
        ) : null}
      </div>

      {needsTokenHint ? (
        <p style={{ fontSize: 14, color: "#52525b", marginBottom: "1rem" }}>
          Ainda sem dados: introduza o token acima e clique em <strong>Carregar estado</strong> para ver
          última sincronização e contagens.
        </p>
      ) : null}

      {loadError ? (
        <p role="alert" style={{ color: "#b91c1c", marginBottom: "1rem", fontSize: 14 }}>
          {loadError}
        </p>
      ) : null}

      {!loading && !loadError && status ? (
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "0.5rem 1.25rem",
            marginBottom: "0.5rem",
            fontSize: 15,
            padding: "1rem",
            background: "#fff",
            border: "1px solid #e4e4e7",
            borderRadius: 8,
          }}
        >
          <dt style={{ color: "#71717a" }}>Modo do relatório</dt>
          <dd>
            <strong>{status.modoRelatorio === "cache" ? "Cache (local)" : "Direct (ERP)"}</strong>
          </dd>
          <dt style={{ color: "#71717a" }}>Última sincronização</dt>
          <dd>{formatDateTime(status.lastSyncedAt)}</dd>
          <dt style={{ color: "#71717a" }}>Linhas (margem clássico)</dt>
          <dd>{status.rowCount != null ? status.rowCount.toLocaleString("pt-BR") : "—"}</dd>
          <dt style={{ color: "#71717a" }}>Modo projeção (API)</dt>
          <dd>
            <strong>
              {status.modoRelatorioProjecao === "cache" ? "Cache (local)" : "Direct (ERP)"}
            </strong>
          </dd>
          <dt style={{ color: "#71717a" }}>Última sync — projeção</dt>
          <dd>{formatDateTime(status.lastSyncedAtProjecao)}</dd>
          <dt style={{ color: "#71717a" }}>Linhas (projeção / op. 367)</dt>
          <dd>
            {status.rowCountProjecao != null ? status.rowCountProjecao.toLocaleString("pt-BR") : "—"}
          </dd>
          <dt style={{ color: "#71717a" }}>Janela configurada</dt>
          <dd>
            {status.dateWindowStart ?? "—"} … {status.dateWindowEnd ?? "—"}
          </dd>
          <dt style={{ color: "#71717a" }}>Origem (PMG_SOURCE)</dt>
          <dd>{status.sourceConfigured ? "Configurada" : "Não configurada"}</dd>
          <dt style={{ color: "#71717a" }}>Sync manual (API)</dt>
          <dd>
            {status.syncEndpointConfigured
              ? "Token ativo no servidor"
              : "Defina PMG_ADMIN_SYNC_SECRET no .env"}
          </dd>
          {status.error ? (
            <>
              <dt style={{ color: "#b91c1c" }}>Aviso</dt>
              <dd style={{ color: "#b91c1c" }}>{status.error}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
