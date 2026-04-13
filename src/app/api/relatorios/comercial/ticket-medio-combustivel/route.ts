import { NextResponse } from "next/server";
import { isValidIsoDate } from "@/lib/iso-date";
import {
  fetchTicketMedioCombustivel,
  type TicketMedioCombustivelFiltros,
} from "@/lib/queries/comercial/ticket-medio-combustivel-extract";

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

  const filtros: TicketMedioCombustivelFiltros = {
    dataInicio,
    dataFim,
    codEmpresa: parseOptionalInt(searchParams.get("codEmpresa")),
  };

  try {
    const rows = await fetchTicketMedioCombustivel(filtros);
    return NextResponse.json({ rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao consultar o espelho.";
    return NextResponse.json({ error: msg, rows: [] }, { status: 500 });
  }
}
