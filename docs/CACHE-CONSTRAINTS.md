# Restrições: cache PMG vs banco do cliente

## Produção do cliente

- **Sem DDL:** não criar views, tabelas, funções ou extensões no PostgreSQL de produção do cliente.
- **Acesso de sync:** utilizador com permissão mínima **`SELECT`** nas tabelas necessárias (`tab_resumo_venda_item`, `tab_fechamento_caixa_pdv`, etc.).
- O script de sincronização (`npm run sync:cache:quantidade-margem`) usa apenas `PMG_SOURCE_DATABASE_URL` para **leitura**.

## Servidor North (PMG)

- Tabelas em **`pmg_cache`** no PostgreSQL local (ou dedicado), criadas com `deploy/sql/001_pmg_cache_quantidade_margem.sql`.
- A aplicação Next.js, em modo cache, liga com `DATABASE_URL` / `PMG_CACHE_DATABASE_URL` **apenas** a esta base.

## Frescura dos dados

- Definida pelo **timer** systemd (ex.: a cada 30 min) e pela janela `PMG_SYNC_DATE_START` / `PMG_SYNC_DATE_END` no `.env` do job.
- Indicador na UI: opcional (ver README).
