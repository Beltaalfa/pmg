-- Desempenho do relatório em PMG_QUANTIDADE_MARGEM_MODE=cache
-- psql "$DATABASE_URL" -f deploy/sql/003_pmg_cache_quantidade_margem_perf.sql

CREATE INDEX IF NOT EXISTS idx_qm_margem_dta_emp_item
  ON pmg_cache.quantidade_margem (dta_fechamento, cod_empresa, cod_item);

ANALYZE pmg_cache.quantidade_margem;
