# Evidência — backfill da migration `fingerprintVersion` (2026-09-08)

Branch `experiment/signalforward-origin-fingerprint-fix`, HEAD `8d76a30a6326761614a41e601015c56ec6758958`
no início desta verificação (worktree `/home/jusall/projects/EIAH_SIGNALFORWARD_ORIGIN_FIX`).

Escopo estrito: prova manual, fora da suíte automatizada, do comportamento de backfill da
migration abaixo — não um teste de runtime do produto, não uma decisão de produto (seção 7 de
`CONSULTATION_ORIGIN_AUTHZ_v2.md` permanece intocada), e não uma execução em ambiente
compartilhado, staging ou produção.

Migration analisada:
`packages/db/prisma/migrations/20260908094140_signal_forward_request_fingerprint_version/migration.sql`

Versão registrada pelo backfill: `signal-forward-fingerprint.v1` (mesmo valor de
`FINGERPRINT_CONTRACT_VERSION` em `originContract.ts`).

## Versões
- PostgreSQL 16.11 (`pgvector/pgvector:pg16`), container descartável `eiah-sfv-fpv-ev-pg`, porta 5548, removido ao final (`docker run --rm`)
- `@prisma/client@7.2.0`, `@prisma/adapter-pg@7.2.0`
- Node.js v22.17.1, pnpm 10.12.4

## Procedimento e comandos executados

1. Subir o container descartável:
```
docker run --rm -d --name eiah-sfv-fpv-ev-pg -e POSTGRES_PASSWORD=*** -e POSTGRES_DB=sfv_fpv_ev -p 5548:5432 pgvector/pgvector:pg16
```

2. Aplicar todas as migrations **exceto** a de `fingerprintVersion` (movida temporariamente para
   fora de `prisma/migrations/`, restaurada ao final do passo 4):
```
DATABASE_URL="postgresql://postgres:***@127.0.0.1:5548/sfv_fpv_ev" prisma migrate deploy
```
Resultado: 28 migrations encontradas, todas as anteriores aplicadas com sucesso. Confirmado por
`\d signal_forward_requests` que a coluna `fingerprint_version` **não existe** neste ponto.

3. Inserção controlada, via SQL direto (não pelo Prisma Client, para simular fielmente uma linha
   que já existia antes da coluna existir), de um tenant/workspace/run sintéticos e uma linha em
   `signal_forward_requests` **sem** a coluna `fingerprint_version` (que ainda não existe no
   schema físico neste ponto):
```sql
INSERT INTO tenants (id, name, created_at, updated_at)
VALUES ('t-legacy-ev1', 'Tenant Legacy Evidence', now(), now());

INSERT INTO workspaces (id, tenant_id, name, created_at, updated_at)
VALUES ('w-legacy-ev1', 't-legacy-ev1', 'Workspace Legacy Evidence', now(), now());

INSERT INTO runs (id, tenant_id, workspace_id, agent, status, request, "startedAt", "createdAt", "updatedAt")
VALUES ('r-legacy-ev1', 't-legacy-ev1', 'w-legacy-ev1', 'radar', 'success', '{}'::jsonb, now(), now(), now());

INSERT INTO signal_forward_requests
  (id, tenant_id, workspace_id, source_run_id, destination_agent, idempotency_key,
   request_fingerprint, origin_snapshot, requested_by_user_id, status, created_at, updated_at)
VALUES
  ('sfr-legacy-ev1', 't-legacy-ev1', 'w-legacy-ev1', 'r-legacy-ev1', 'mkt', 'legacy-key-ev1',
   'aaaa...aaaa' /* 64 hex, sintético */, '{"pre":"migration"}'::jsonb,
   NULL, 'run_created', now(), now());
```
Resultado: `INSERT 0 1` — linha `sfr-legacy-ev1` criada com sucesso, sem a coluna
`fingerprint_version` existir fisicamente na tabela.

4. Restaurar a migration `20260908094140_signal_forward_request_fingerprint_version` para
   `prisma/migrations/` e aplicá-la:
```
DATABASE_URL="postgresql://postgres:***@127.0.0.1:5548/sfv_fpv_ev" prisma migrate deploy
```
Resultado: `Applying migration 20260908094140_signal_forward_request_fingerprint_version` —
aplicada com sucesso.

5. Resultado do backfill na linha legada:
```sql
SELECT id, fingerprint_version FROM signal_forward_requests WHERE id = 'sfr-legacy-ev1';
```
```
       id       |      fingerprint_version
----------------+-------------------------------
 sfr-legacy-ev1 | signal-forward-fingerprint.v1
```
A linha criada **antes** da coluna existir recebeu exatamente `signal-forward-fingerprint.v1`.

6. Confirmação de `NOT NULL` e ausência de default permanente, via
   `information_schema.columns` (fonte mais precisa que `\d` para este propósito):
```sql
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'signal_forward_requests' AND column_name = 'fingerprint_version';
```
```
     column_name     | is_nullable | column_default
---------------------+-------------+----------------
 fingerprint_version | NO          |
```
`is_nullable = NO` e `column_default` vazio — a coluna é obrigatória e não tem nenhum valor
padrão associado no banco.

7. Tentativa de inserção **posterior** à migration, via SQL direto, omitindo
   `fingerprint_version`:
```sql
INSERT INTO signal_forward_requests
  (id, tenant_id, workspace_id, source_run_id, destination_agent, idempotency_key,
   request_fingerprint, origin_snapshot, requested_by_user_id, status, created_at, updated_at)
VALUES
  ('sfr-new-ev1-omitted', 't-legacy-ev1', 'w-legacy-ev1', 'r-new-ev1', 'mkt', 'new-key-ev1-omitted',
   'bbbb...bbbb' /* 64 hex, sintético */, '{"post":"migration"}'::jsonb,
   NULL, 'run_created', now(), now());
```
Resultado, erro real do banco (não simulado, não capturado apenas em nível de aplicação):
```
ERROR:  null value in column "fingerprint_version" of relation "signal_forward_requests" violates not-null constraint
DETAIL:  Failing row contains (sfr-new-ev1-omitted, ..., null, ..., {"post": "migration"}, null).
```
Nenhuma linha foi criada; nenhum valor default foi aplicado silenciosamente.

8. `prisma migrate diff` do banco já migrado contra o `schema.prisma` atual:
```
DATABASE_URL="postgresql://postgres:***@127.0.0.1:5548/sfv_fpv_ev" \
  prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema.prisma --script
```
```
-- This is an empty migration.
```
Nenhuma divergência entre o banco migrado e o schema declarado.

9. Encerramento do container descartável:
```
docker stop eiah-sfv-fpv-ev-pg
```
(o container foi criado com `--rm`; `stop` já o remove — confirmado por `docker ps` vazio após o
comando).

## O que esta verificação prova
- A migration adiciona a coluna sem `DEFAULT` de banco, faz backfill apenas das linhas
  pré-existentes (`WHERE fingerprint_version IS NULL`) com o literal
  `signal-forward-fingerprint.v1`, e só então aplica `NOT NULL` — nessa ordem, confirmada tanto
  pela leitura de `migration.sql` quanto pela execução real acima.
- Uma linha que existia antes da coluna existir é backfilled corretamente.
- A coluna termina `NOT NULL` sem nenhum `column_default`.
- Uma gravação nova que omita o campo falha no próprio banco, por violação de `NOT NULL`, sem
  receber `"v1"` nem qualquer outro valor silenciosamente.
- O schema declarado e o banco migrado não divergem.

## O que esta verificação NÃO prova
- Não prova o comportamento do backfill contra o histórico real de produção/staging — o banco
  usado é descartável e sintético, criado e destruído nesta mesma verificação.
- Não prova nada sobre o restante do pipeline de encaminhamento (autorização, fila, worker) —
  isso é coberto (ou não) pela suíte de testes do módulo, não por este documento.
- Não é, e não deve ser lida como, uma execução automatizada e repetível em CI — é uma
  verificação manual, pontual, desta rodada.
- Não decide nem antecipa nenhuma das questões da seção 7 de `CONSULTATION_ORIGIN_AUTHZ_v2.md`
  (autorização individual, produtor Radar ratificado, contrato de entrada MKT, etc.) — este
  documento é estritamente sobre o comportamento da coluna `fingerprintVersion` no banco.

## Distinção entre este documento e o teste automatizado
`apps/api/src/services/signalForward/__tests__/J-fingerprint-version-legacy.test.ts` automatiza
apenas a consequência já vigente da ausência de default: uma inserção nova que omita
`fingerprintVersion` falha. O teste **não** executa nem reproduz o ciclo de vida de migration
(coluna ainda não existente → backfill → `NOT NULL`) descrito aqui — isso não é reproduzível
pelo harness de testes atual, que roda contra um banco já totalmente migrado antes da suíte
iniciar. Este documento é a prova correspondente a essa parte não automatizada.
