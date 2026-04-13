import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { isValidIsoDate } from "@/lib/iso-date";
import {
  fetchQuantidadeMargemVenda,
  type QuantidadeMargemFiltros,
} from "@/lib/queries/comercial/analise-margem-venda";

/** >0 ativa cache de dados no Next (segundos). Repetir o mesmo filtro fica instantâneo até expirar. */
function apiCacheRevalidateSeconds(): number {
  const n = Number.parseInt(
    process.env.PMG_QUANTIDADE_MARGEM_API_CACHE_SECONDS ?? "0",
    10
  );
  return Number.isFinite(n) && n > 0 ? Math.min(n, 3600) : 0;
}

function parseOptionalInt(v: string | null): number | null {
  if (v === null || v === undefined || v.trim() === "") return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dataInicio = searchParams.get("dataInicio")?.trim();
  const dataFim = searchParams.get("dataFim")?.trim();

  if (!dataInicio || !dataFim) {
    return NextResponse.json(
      { error: "Parâmetros dataInicio e dataFim são obrigatórios (YYYY-MM-DD)." },
      { status: 400 }
    );
  }

  if (!isValidIsoDate(dataInicio) || !isValidIsoDate(dataFim)) {
    return NextResponse.json(
      { error: "Datas inválidas. Use o formato AAAA-MM-DD (ex.: 2026-01-01)." },
      { status: 400 }
    );
  }

  if (dataInicio > dataFim) {
    return NextResponse.json(
      { error: "A data início não pode ser posterior à data fim." },
      { status: 400 }
    );
  }

  const filtros: QuantidadeMargemFiltros = {
    dataInicio,
    dataFim,
    codEmpresa: parseOptionalInt(searchParams.get("codEmpresa")),
    codItem: parseOptionalInt(searchParams.get("codItem")),
    codOperador: null,
    codSubgrupoItem: parseOptionalInt(searchParams.get("codSubgrupoItem")),
  };

  try {
    const ttl = apiCacheRevalidateSeconds();
    const rows =
      ttl > 0
        ? await unstable_cache(
            () => fetchQuantidadeMargemVenda(filtros),
            [
              "quantidade-margem",
              filtros.dataInicio,
              filtros.dataFim,
              String(filtros.codEmpresa ?? ""),
              String(filtros.codItem ?? ""),
              String(filtros.codSubgrupoItem ?? ""),
            ],
            { revalidate: ttl }
          )()
        : await fetchQuantidadeMargemVenda(filtros);

    const headers = new Headers();
    if (ttl > 0) {
      headers.set(
        "Cache-Control",
        `private, max-age=${Math.min(ttl, 600)}, stale-while-revalidate=${Math.min(ttl * 2, 1200)}`
      );
    }
    return NextResponse.json({ rows }, { headers });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao executar a query.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
