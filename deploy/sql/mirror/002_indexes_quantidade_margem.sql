-- Índices no Postgres North (espelho) para acelerar a query Quantidade × Margem.
-- Aplicar: psql "$DATABASE_URL" -f deploy/sql/mirror/002_indexes_quantidade_margem.sql
-- Seguro com IF NOT EXISTS; ignora se já existirem PKs equivalentes (pode dar nomes duplicados — nesse caso comente a linha).

CREATE INDEX IF NOT EXISTS idx_mirror_fechamento_dta ON tab_fechamento_caixa_pdv (dta_fechamento);
CREATE INDEX IF NOT EXISTS idx_mirror_fechamento_seq ON tab_fechamento_caixa_pdv (seq_fechamento);
CREATE INDEX IF NOT EXISTS idx_mirror_resumo_seq_fech ON tab_resumo_venda_item (seq_fechamento);
CREATE INDEX IF NOT EXISTS idx_mirror_resumo_mov_est ON tab_resumo_venda_item (seq_movimento_estoque);
CREATE INDEX IF NOT EXISTS idx_mirror_mov_est_seq ON tab_movimento_estoque (seq_movimento);
CREATE INDEX IF NOT EXISTS idx_mirror_pdv_cod ON tab_pdv (cod_pdv);
CREATE INDEX IF NOT EXISTS idx_mirror_empresa_cod ON tab_empresa (cod_empresa);
CREATE INDEX IF NOT EXISTS idx_mirror_item_cod ON tab_item (cod_item);
