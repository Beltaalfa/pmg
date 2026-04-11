import { getPostgresConnectionString } from "@/lib/db";
import { getCacheQuantidadeMargemStatus } from "@/lib/sync/cache-quantidade-margem-status";
import { runQuantidadeMargemCacheSync } from "@/lib/sync/run-quantidade-margem-cache-sync";

function syncEnvError(): string | null {
  const sourceUrl =
    process.env.PMG_SOURCE_DATABASE_URL?.trim() || getPostgresConnectionString();
  const cacheUrl =
    process.env.PMG_CACHE_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    getPostgresConnectionString();
  if (!sourceUrl) {
    return "Defina origem do ERP: PMG_SOURCE_DATABASE_URL ou PGHOST+PGUSER+PGDATABASE (ou DATABASE_URL).";
  }
  if (!cacheUrl) {
    return "Defina destino do cache: DATABASE_URL ou PGHOST+PGUSER+PGDATABASE (ou PMG_CACHE_DATABASE_URL).";
  }
  return null;
}

export const dynamic = "force-dynamic";
/** Sync pode demorar vários minutos em bases grandes (Fluid / self-hosted). */
export const maxDuration = 300;

function syncSecretConfigured(): boolean {
  return Boolean(process.env.PMG_ADMIN_SYNC_SECRET?.trim());
}

function authorize(request: Request): boolean {
  const secret = process.env.PMG_ADMIN_SYNC_SECRET?.trim();
  if (!secret) {
    return false;
  }
  const auth = request.headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : null;
  const header = request.headers.get("x-pmg-sync-token")?.trim();
  const token = bearer || header;
  return token === secret;
}

export async function GET(request: Request) {
  if (!syncSecretConfigured()) {
    return Response.json(
      {
        ok: false,
        error:
          "Servidor sem PMG_ADMIN_SYNC_SECRET: defina no .env e reinicie o PMG para aceder ao monitoramento.",
      },
      { status: 503 }
    );
  }
  if (!authorize(request)) {
    return Response.json(
      {
        ok: false,
        error: "Não autorizado. Envie o token em Authorization: Bearer ou X-PMG-Sync-Token.",
      },
      { status: 401 }
    );
  }
  const status = await getCacheQuantidadeMargemStatus();
  return Response.json({
    ...status,
    syncEndpointConfigured: syncSecretConfigured(),
  });
}

export async function POST(request: Request) {
  if (!syncSecretConfigured()) {
    return Response.json(
      {
        ok: false,
        error:
          "Servidor sem PMG_ADMIN_SYNC_SECRET: defina no .env e reinicie o PMG para permitir sync manual.",
      },
      { status: 503 }
    );
  }
  if (!authorize(request)) {
    return Response.json(
      { ok: false, error: "Não autorizado. Envie o token em Authorization: Bearer ou X-PMG-Sync-Token." },
      { status: 401 }
    );
  }
  const envErr = syncEnvError();
  if (envErr) {
    return Response.json({ ok: false, error: envErr }, { status: 422 });
  }
  try {
    const result = await runQuantidadeMargemCacheSync();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro desconhecido no sync.";
    const isConfig =
      message.includes("PMG_SOURCE_DATABASE_URL") ||
      message.includes("PMG_CACHE_DATABASE_URL") ||
      message.includes("DATABASE_URL") ||
      message.includes("PGHOST") ||
      message.includes("PGUSER") ||
      message.includes("Defina");
    return Response.json(
      { ok: false, error: message },
      { status: isConfig ? 422 : 500 }
    );
  }
}
