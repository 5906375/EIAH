# Backup Restore Evidence

- backup timestamp: 2026-09-26T08:23:54Z
- restore test timestamp: 2026-09-26T08:24:22Z (início) — 2026-09-26T08:24:35Z (confirmado por smoke query)
- ambiente restaurado: dois containers Docker `pgvector/pgvector:pg16` descartáveis (`eiah-backup-drill-src` porta 55433, `eiah-backup-drill-restore` porta 55434), isolados do Postgres de dev (`eiah-postgres`, porta 5433); ambos removidos ao final do drill
- fonte do backup: `pg_dump -F c` real, executado dentro do container de origem (o `pg_dump` do host, v12, é incompatível com o servidor v16 — ver lição aprendida); dump de 223.869 bytes, schema aplicado via `pnpm --filter @repo/db migrate:deploy` (todas as migrations reais do repositório, incluindo as mais recentes de Oráculo/PRE_DUIMP)
- rpo observado: 0 — o backup foi tirado imediatamente após a única escrita de teste (inserção da linha `drill-tenant-1` em `tenants`), sem nenhuma escrita entre a inserção e o dump; não há janela de dados perdidos a descrever neste drill
- rto observado: 13 segundos (do início do `pg_restore` às 08:24:22Z até a smoke query confirmar o dado às 08:24:35Z); o `pg_restore` em si levou ~4s, o restante foi a query de confirmação
- smoke query: `SELECT count(*) FROM tenants;` → `1`; `SELECT id, name FROM tenants;` → `drill-tenant-1 | Backup Drill Test Tenant` (linha inserida antes do backup, confirmada intacta após o restore)
- executado por: Claude Sonnet 5 (agente), sessão de consultoria; ratificação humana pendente antes do commit ser enviado
- evidência bruta: dump local em `/tmp/eiah-backup-drill.dump` (223.869 bytes) — não versionado; ambiente e dados são inteiramente descartáveis e já foram removidos
- lição aprendida: `pg_dump`/`pg_restore` do host (v12.22) são incompatíveis com o Postgres 16 usado pelo projeto — qualquer operador humano executando este drill deve usar o `pg_dump` de dentro do próprio container (ou instalar client v16), não o do host
