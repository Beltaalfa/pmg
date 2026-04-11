import { NextResponse } from "next/server";
import { fetchQuantidadeMargemLookups } from "@/lib/queries/comercial/quantidade-margem-lookups";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchQuantidadeMargemLookups();
    const headers = new Headers();
    headers.set("Cache-Control", "private, max-age=300");
    return NextResponse.json(data, { headers });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao carregar listas de filtro.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
