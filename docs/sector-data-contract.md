# Convenção de dados analíticos PMG × Hub

No **north/hub**, o que o negócio chama de **setor** (Financeiro, Fiscal, TI, …) corresponde ao modelo Prisma **`Group`**. O PMG **não** usa o modelo `Sector` (grupos finos na UI do Hub).

## Regra

- Nas tabelas/views do banco analítico (`DATABASE_URL`), use uma coluna **`hub_setor_id` `TEXT` NOT NULL** (ou nullable se a linha for global) cujo valor seja **`Group.id`** (CUID) do Hub.
- Nas queries do PMG (`src/lib/queries.ts`), filtre com parâmetro: `WHERE hub_setor_id = $1`, sendo `$1` o ID validado com `getHubSetorById` (lista canónica = `getHubSetores`).

## Sem coluna ainda

Enquanto o modelo analítico não existir, o dashboard usa séries de exemplo que só recebem o `Group.id` como parâmetro.

## Mapeamento por nome

Evite filtrar só por nome de setor; prefira sempre o CUID de `Group`.
