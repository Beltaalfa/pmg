import { getPool } from "@/lib/db";
import { getHubPool, isHubDatabaseConfigured } from "@/lib/hub-db";
import { getHubSetores } from "@/lib/hub-setores";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { rows } = await getPool().query<{ ok: number; db: string }>(
      `SELECT 1 AS ok, current_database() AS db`
    );
    const row = rows[0];

    let hub: {
      configured: boolean;
      metadataOk?: boolean;
      setorCount?: number;
      error?: string;
    } = { configured: isHubDatabaseConfigured() };

    if (hub.configured) {
      try {
        await getHubPool().query(`SELECT 1 AS ok`);
        const setores = await getHubSetores();
        hub = { ...hub, metadataOk: true, setorCount: setores.length };
      } catch (e) {
        const message = e instanceof Error ? e.message : "unknown";
        hub = { ...hub, metadataOk: false, error: message };
      }
    }

    return Response.json({
      ok: true,
      postgres: true,
      database: row?.db ?? null,
      hub,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    return Response.json(
      { ok: false, postgres: false, error: message },
      { status: 503 }
    );
  }
}
