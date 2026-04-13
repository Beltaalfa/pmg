import { appendFileSync, mkdirSync } from "fs";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { isValidIsoDate } from "@/lib/iso-date";
import {
  fetchQuantidadeMargemVenda,
  type QuantidadeMargemFiltros,
} from "@/lib/queries/comercial/analise-margem-venda";
import { dedupeQuantidadeMargemRows } from "@/lib/queries/comercial/quantidade-margem-matrix-aggregate";
import type { QuantidadeMargemRow } from "@/lib/queries/comercial/quantidade-margem-shared";

function numDbg(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const x = Number.parseFloat(String(v).trim().replace(/\s/g, ""));
  return Number.isFinite(x) ? x : 0;
}

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

    // #region agent log
    try {
      mkdirSync("/var/www/.cursor", { recursive: true });
      const typed = rows as QuantidadeMargemRow[];
      const dr = dedupeQuantidadeMargemRows(typed);
      const corAdit = typed.filter(
        (r) =>
          String(r.nom_empresa ?? "")
            .toUpperCase()
            .includes("CORREGO") &&
          String(r.nom_empresa ?? "")
            .toUpperCase()
            .includes("DANTA") &&
          String(r.nom_produto ?? "")
            .toUpperCase()
            .includes("ADITIVADO")
      );
      let sq = 0;
      let sc = 0;
      let sv = 0;
      for (const r of corAdit) {
        sq += numDbg(r.qtd_item);
        sc += numDbg(r.val_custo_estoque);
        sv += numDbg(r.val_liquido);
      }
      const seenK = new Set<string>();
      let dupRows = 0;
      for (const r of typed) {
        const svk = r.seq_venda;
        if (svk == null || svk === "") continue;
        const k = `${r.cod_empresa}|${r.seq_fechamento}|${String(svk)}|${r.cod_item}`;
        if (seenK.has(k)) dupRows += 1;
        else seenK.add(k);
      }
      appendFileSync(
        "/var/www/.cursor/debug-b126c5.log",
        `${JSON.stringify({
          sessionId: "b126c5",
          hypothesisId: "H1_H2_H4",
          location: "quantidade-margem/route.ts:GET",
          message: "api-corpus-corrego-aditivado",
          data: {
            filtros,
            rowCount: typed.length,
            dedupedLen: dr.length,
            duplicateGrainRows: dupRows,
            corAditRowCount: corAdit.length,
            corAditSumQtd: sq,
            corAditSumCusto: sc,
            corAditSumLiquido: sv,
            corAditUnitCusto: sq > 0 ? sc / sq : null,
            corAditUnitLiquido: sq > 0 ? sv / sq : null,
          },
          timestamp: Date.now(),
        })}\n`
      );
    } catch {
      /* ignore */
    }
    // #endregion

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
