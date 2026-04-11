-- Grão do relatório: seq_venda estava no extract ERP mas não era gravado no cache,
-- o que podia colidir linhas ao agregar só por empresa/item e reinflar quantidades.
-- psql "$DATABASE_URL" -f deploy/sql/004_pmg_cache_quantidade_margem_seq_venda.sql
-- Depois: npm run sync:cache:quantidade-margem (ou job equivalente).

ALTER TABLE pmg_cache.quantidade_margem
  ADD COLUMN IF NOT EXISTS seq_venda BIGINT;

COMMENT ON COLUMN pmg_cache.quantidade_margem.seq_venda IS
  'tab_resumo_venda_item.seq_venda — chave da linha de venda junto com seq_fechamento.';
