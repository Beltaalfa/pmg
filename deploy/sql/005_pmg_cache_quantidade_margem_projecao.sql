-- Cache para o relatório “Quantidade × Margem até o dia e projeção” (inclui operador 367).
-- psql "$DATABASE_URL" -f deploy/sql/005_pmg_cache_quantidade_margem_projecao.sql
-- Preenchido pelo mesmo job que `quantidade_margem`, com extract SQL_QUANTIDADE_MARGEM_SYNC_PROJECAO.

CREATE TABLE IF NOT EXISTS pmg_cache.quantidade_margem_projecao (
  cod_empresa BIGINT,
  nom_empresa TEXT,
  cod_pdv BIGINT,
  cod_operador BIGINT,
  nom_operador TEXT,
  nom_usuario_conf TEXT,
  seq_fechamento BIGINT,
  seq_venda BIGINT,
  dta_fechamento DATE,
  cod_item BIGINT,
  nom_produto TEXT,
  qtd_item NUMERIC,
  val_custo_estoque NUMERIC(15, 2),
  val_liquido NUMERIC,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qm_proj_dta ON pmg_cache.quantidade_margem_projecao (dta_fechamento);
CREATE INDEX IF NOT EXISTS idx_qm_proj_emp ON pmg_cache.quantidade_margem_projecao (cod_empresa);
CREATE INDEX IF NOT EXISTS idx_qm_proj_item ON pmg_cache.quantidade_margem_projecao (cod_item);

COMMENT ON TABLE pmg_cache.quantidade_margem_projecao IS
  'Igual a quantidade_margem mas sem exclusão do operador 367; sync na mesma janela que a tabela principal.';
