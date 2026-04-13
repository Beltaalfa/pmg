# Espelho ERP (North)

1. Subir Postgres local: ver [`postgres-mirror-docker-compose.yml`](../postgres-mirror-docker-compose.yml) ou instância própria com utilizador que possa `CREATE TABLE`.
2. Gerar DDL a partir da **produção** (só `SELECT` em catálogo): `npm run mirror:introspect` (usa `PMG_SOURCE_DATABASE_URL` + `PMG_SOURCE_SCHEMA`).
3. Aplicar no mirror: `psql "$DATABASE_URL" -f deploy/sql/mirror/generated_schema.sql`
4. Copiar dados: `npm run mirror:sync`
5. (Opcional, performance relatório margem em modo **direct**) `psql "$DATABASE_URL" -f deploy/sql/mirror/002_indexes_quantidade_margem.sql`
6. Com modo **cache** (`pmg_cache.quantidade_margem`): após `001_pmg_cache_quantidade_margem.sql`, opcional `psql "$DATABASE_URL" -f deploy/sql/003_pmg_cache_quantidade_margem_perf.sql`

O ficheiro `generated_schema.sql` é gerado localmente; está no `.gitignore`.

Lista de tabelas (margem + **volume por forma de pagamento** / cupom): [`src/lib/erp-mirror/tables.ts`](../../src/lib/erp-mirror/tables.ts). Após alterar a lista, voltar a correr `mirror:introspect` e `mirror:sync`.
