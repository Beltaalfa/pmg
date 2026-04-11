# Deploy do PMG no servidor

Aplicação em `/var/www/pmg`: Next.js na porta **3008**, nginx em **pmg.northempresarial.com**.

## Pré-requisitos

- Node.js e npm instalados.
- **Espelho ERP no North (recomendado):** a app usa `DATABASE_URL` / `PG*` **apenas** contra um PostgreSQL vosso (espelho), nunca com DDL na produção. A produção entra só em `PMG_SOURCE_DATABASE_URL` (utilizador **SELECT**). Fluxo: [`deploy/sql/mirror/README.md`](sql/mirror/README.md), `npm run mirror:introspect`, aplicar `generated_schema.sql`, `npm run mirror:sync`. Docker opcional: [`postgres-mirror-docker-compose.yml`](postgres-mirror-docker-compose.yml).
- **Modo relatório Quantidade × Margem:** com espelho completo, use `PMG_QUANTIDADE_MARGEM_MODE=direct` (ou omita) para a query `tab_*` correr no espelho. Modo **cache** (`pmg_cache.quantidade_margem`) continua opcional — ver [`docs/CACHE-CONSTRAINTS.md`](../docs/CACHE-CONSTRAINTS.md).
- Opcional: acesso read-only ao **mesmo banco do north/hub** para listar setores (`HUB_DATABASE_URL` + `HUB_CLIENT_ID` ou `HUB_CLIENT_NAME`). O utilizador PostgreSQL precisa de `SELECT` em `"Group"` e `"Client"` (modelo `Group` = setor).
- DNS: `pmg.northempresarial.com` → IP deste servidor.

Convenção para KPIs por setor: ver [`docs/sector-data-contract.md`](../docs/sector-data-contract.md).

## Configuração

1. Copie o exemplo de ambiente e edite credenciais:

   ```bash
   cp /var/www/pmg/.env.example /var/www/pmg/.env
   nano /var/www/pmg/.env
   ```

2. Instale dependências e gere o build de produção:

   ```bash
   cd /var/www/pmg
   npm ci
   npm run build
   ```

3. **Espelho ERP (primeira vez):**

   ```bash
   docker compose -f /var/www/pmg/deploy/postgres-mirror-docker-compose.yml up -d
   # Ajuste .env: DATABASE_URL → mirror, PMG_SOURCE_DATABASE_URL → produção (só leitura)
   cd /var/www/pmg && npm run mirror:introspect
   psql "$DATABASE_URL" -f /var/www/pmg/deploy/sql/mirror/generated_schema.sql
   npm run mirror:sync
   ```

4. **Timer — sync do espelho ERP**

   ```bash
   sudo cp /var/www/pmg/deploy/pmg-erp-mirror-sync.service /etc/systemd/system/
   sudo cp /var/www/pmg/deploy/pmg-erp-mirror-sync.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now pmg-erp-mirror-sync.timer
   ```

   Ajuste `OnCalendar` no `.timer` (ex.: noite, baixa carga na prod).

5. **Cache Quantidade x Margem (opcional, snapshot agregado):** crie o schema/tabela no PostgreSQL do **North** (não na produção):

   ```bash
   psql "$DATABASE_URL" -f /var/www/pmg/deploy/sql/001_pmg_cache_quantidade_margem.sql
   psql "$DATABASE_URL" -f /var/www/pmg/deploy/sql/003_pmg_cache_quantidade_margem_perf.sql
   ```

   No `.env`, defina `PMG_SOURCE_DATABASE_URL` (leitura no ERP), `DATABASE_URL` (ou `PMG_CACHE_DATABASE_URL`) para o cache local, `PMG_QUANTIDADE_MARGEM_MODE=cache` e a janela de sync `PMG_SYNC_DATE_START` / `PMG_SYNC_DATE_END`. Rode um sync manual antes de ativar o timer:

   ```bash
   cd /var/www/pmg && npm run sync:cache:quantidade-margem
   ```

   **Retenção / janela:** o job faz `TRUNCATE` na tabela de cache e recarrega apenas o intervalo de datas configurado (por defeito ano civil corrente até hoje). Ajuste as variáveis para limitar volume e tempo de execução.

   **Monitoramento e sync manual pela UI:** defina `PMG_ADMIN_SYNC_SECRET` no `.env`, reinicie o serviço `pmg` e abra `https://pmg.northempresarial.com/admin/cache-quantidade-margem`. Tanto a leitura do estado (`GET`) como o sync (`POST`) exigem `Authorization: Bearer` com esse segredo; sem `PMG_ADMIN_SYNC_SECRET` no servidor a API responde 503. Opcionalmente defina também `NEXT_PUBLIC_PMG_ADMIN_UI_TOKEN` com o **mesmo** valor para pré-configurar o token no browser (fica exposto no JS público — só em rede confiável).

## Systemd

```bash
sudo cp /var/www/pmg/deploy/pmg.service /etc/systemd/system/pmg.service
sudo systemctl daemon-reload
sudo systemctl enable --now pmg
sudo systemctl status pmg
```

O unit `pmg.service` define `PORT=3008` e lê `/var/www/pmg/.env`. Após alterar código:

```bash
cd /var/www/pmg && npm run build && sudo systemctl restart pmg
```

### Timer — sync do cache Quantidade x Margem

Após configurar `.env` e validar o comando `npm run sync:cache:quantidade-margem`:

```bash
sudo cp /var/www/pmg/deploy/pmg-sync-quantidade-margem.service /etc/systemd/system/
sudo cp /var/www/pmg/deploy/pmg-sync-quantidade-margem.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pmg-sync-quantidade-margem.timer
sudo systemctl list-timers | grep pmg-sync
```

Edite `OnCalendar` em `pmg-sync-quantidade-margem.timer` para o SLA desejado (ex.: cada 30 minutos) e faça `daemon-reload` + `restart` do timer.

## Nginx

```bash
sudo cp /var/www/pmg/deploy/nginx-pmg.northempresarial.com.conf /etc/nginx/sites-available/pmg.northempresarial.com.conf
sudo ln -sf /etc/nginx/sites-available/pmg.northempresarial.com.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Ajuste os caminhos `ssl_certificate` e `ssl_certificate_key` se o certificado não for o de `northempresarial.com`.

## TLS (Certbot)

Com o site HTTP respondendo ou após configurar o server block:

```bash
sudo certbot --nginx -d pmg.northempresarial.com
```

Se já existir certificado wildcard/SAN que inclua esse hostname, basta garantir que o `server_name` e os `listen ssl` usem os mesmos arquivos PEM.

## Verificação

- App: `curl -sS http://127.0.0.1:3008/api/health`
- Público: `https://pmg.northempresarial.com/api/health` (esperado: `"ok": true` com banco analítico; objeto `hub` inclui `setorCount` quando os metadados do Hub foram carregados)

Com Hub configurado, a página inicial lista setores com links para `/setor/[setorId]` (IDs iguais ao `Group.id` do Hub).
