-- Executar no PostgreSQL do SERVIDOR PMG (cache local), com utilizador que possa criar schema/tabela.
-- Não executar no banco de produção do cliente.

CREATE SCHEMA IF NOT EXISTS pmg_cache;

CREATE TABLE IF NOT EXISTS pmg_cache.quantidade_margem (
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

CREATE INDEX IF NOT EXISTS idx_qm_margem_dta ON pmg_cache.quantidade_margem (dta_fechamento);
CREATE INDEX IF NOT EXISTS idx_qm_margem_emp ON pmg_cache.quantidade_margem (cod_empresa);
CREATE INDEX IF NOT EXISTS idx_qm_margem_item ON pmg_cache.quantidade_margem (cod_item);

COMMENT ON TABLE pmg_cache.quantidade_margem IS 'Cópia derivada do ERP (sync só leitura na origem). O PMG lê esta tabela em PMG_QUANTIDADE_MARGEM_MODE=cache.';
