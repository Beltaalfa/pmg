import { appendFileSync, mkdirSync } from "fs";
import { NextResponse } from "next/server";
import { fetchQuantidadeMargemLookups } from "@/lib/queries/comercial/quantidade-margem-lookups";

export const dynamic = "force-dynamic";

function parseOptionalInt(v: string | null): number | null {
  if (v === null || v === undefined || v.trim() === "") return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const codSubgrupoItem = parseOptionalInt(searchParams.get("codSubgrupoItem"));
    const data = await fetchQuantidadeMargemLookups({
      codSubgrupoItem: codSubgrupoItem ?? undefined,
    });
    // #region agent log
    try {
      mkdirSync("/var/www/.cursor", { recursive: true });
      appendFileSync(
        "/var/www/.cursor/debug-b126c5.log",
        `${JSON.stringify({
          sessionId: "b126c5",
          hypothesisId: "H2",
          location: "quantidade-margem/lookups/route.ts:GET",
          message: "lookups-ok",
          data: {
            empresas: data.empresas?.length ?? -1,
            subcategorias: data.subcategorias?.length ?? -1,
            itens: data.itens?.length ?? -1,
            codSubgrupoParam: codSubgrupoItem,
          },
          timestamp: Date.now(),
        })}\n`
      );
    } catch {
      /* ignore */
    }
    // #endregion
    const headers = new Headers();
    headers.set("Cache-Control", "private, max-age=300");
    return NextResponse.json(data, { headers });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao carregar listas de filtro.";
    // #region agent log
    try {
      mkdirSync("/var/www/.cursor", { recursive: true });
      appendFileSync(
        "/var/www/.cursor/debug-b126c5.log",
        `${JSON.stringify({
          sessionId: "b126c5",
          hypothesisId: "H2",
          location: "quantidade-margem/lookups/route.ts:catch",
          message: "lookups-error",
          data: { err: String(message).slice(0, 500) },
          timestamp: Date.now(),
        })}\n`
      );
    } catch {
      /* ignore */
    }
    // #endregion
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
