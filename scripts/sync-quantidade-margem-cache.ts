/**
 * CLI: mesmo fluxo que a API / botão "Sincronizar agora".
 * Carrega .env local (dotenv); o Next.js em produção usa variáveis do systemd.
 */
import "dotenv/config";
import { runQuantidadeMargemCacheSync } from "../src/lib/sync/run-quantidade-margem-cache-sync";

async function main(): Promise<void> {
  const r = await runQuantidadeMargemCacheSync();
  console.log(
    `sync quantidade_margem: ${r.rowCount} linhas, projecao: ${r.rowCountProjecao} linhas, janela ${r.dateStart}..${r.dateEnd}, ${r.durationMs}ms`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
