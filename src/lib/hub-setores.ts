import { getHubPool, isHubDatabaseConfigured } from "@/lib/hub-db";

export { isHubDatabaseConfigured };

/**
 * “Setor” no vocabulário do negócio = modelo Prisma `Group` no north/hub
 * (na UI admin do Hub aparece como “Setor” no dropdown ao criar grupos).
 * Não usamos o modelo `Sector` (grupos finos).
 */
export type HubSetor = {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
};

function getClientFilter(): { whereSql: string; params: string[] } {
  const id = process.env.HUB_CLIENT_ID?.trim();
  const name = process.env.HUB_CLIENT_NAME?.trim();
  if (id) {
    return { whereSql: `c."id" = $1`, params: [id] };
  }
  if (name) {
    return { whereSql: `c."name" ILIKE $1`, params: [name] };
  }
  throw new Error(
    "Defina HUB_CLIENT_ID ou HUB_CLIENT_NAME no .env para filtrar setores do Hub."
  );
}

/** Lista setores (`Group`) do cliente, ordenados por nome. */
export async function getHubSetores(): Promise<HubSetor[]> {
  if (!isHubDatabaseConfigured()) {
    throw new Error("HUB_DATABASE_URL não configurado");
  }
  const { whereSql, params } = getClientFilter();
  const { rows } = await getHubPool().query<{
    id: string;
    name: string;
    client_id: string;
    client_name: string;
  }>(
    `SELECT g."id",
            g."name",
            c."id" AS client_id,
            c."name" AS client_name
     FROM "Group" g
     INNER JOIN "Client" c ON c."id" = g."clientId"
     WHERE c."deletedAt" IS NULL
       AND ${whereSql}
     ORDER BY g."name" ASC`,
    params
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    clientId: r.client_id,
    clientName: r.client_name,
  }));
}

/** Um setor (`Group`) por ID, com o mesmo filtro de cliente. */
export async function getHubSetorById(setorId: string): Promise<HubSetor | null> {
  if (!isHubDatabaseConfigured()) {
    return null;
  }
  const { whereSql, params: clientParams } = getClientFilter();
  const setorParamIndex = clientParams.length + 1;
  const { rows } = await getHubPool().query<{
    id: string;
    name: string;
    client_id: string;
    client_name: string;
  }>(
    `SELECT g."id",
            g."name",
            c."id" AS client_id,
            c."name" AS client_name
     FROM "Group" g
     INNER JOIN "Client" c ON c."id" = g."clientId"
     WHERE c."deletedAt" IS NULL
       AND ${whereSql}
       AND g."id" = $${setorParamIndex}`,
    [...clientParams, setorId]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    clientId: r.client_id,
    clientName: r.client_name,
  };
}
