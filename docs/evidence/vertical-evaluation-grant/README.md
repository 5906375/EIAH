# Avaliação gratuita da vertical IMOB — validação com PostgreSQL, Redis e Prisma reais (infraestrutura descartável local)

Status: **PARCIAL** (implementação local, sem stage, sem commit, sem CI executado, sem staging, sem deploy). Dados 100% sintéticos; nada aqui vem de
staging ou produção. **Oferta desligada; as 8 decisões obrigatórias (`EVALUATION_MANDATORY_DECISIONS`) seguem `pending`; nenhuma concessão real.**
Passar nestes testes **não autoriza habilitar a oferta** e não é prontidão operacional.

Contrato e operação: `docs/ops/vertical-evaluation-grant.md`. Este pacote só prova o que os logs de `results/` mostram.

## Ambiente da validação (2026-11-14)

- PostgreSQL 16.16 + pgvector 0.8.0 e Redis 7.4.2 compilados e iniciados em diretório exclusivo da tarefa; portas locais exclusivas (55432 e 56379),
  Redis autenticado, banco `eiah_logistica_core_evaldisp_<hex>` (2 instâncias: `92581871` e, depois da limpeza, `91320dd4`). Servidor com `TimeZone = Brazil/East`.
- Node v22.17.1, pnpm 10.12.4, Prisma 7.2.0 (`PrismaPg`). As 36 migrations foram aplicadas **somente** nesses bancos (`results/infra/migrate-*`).
- Cada comando com banco/Redis passou por um executor (`results/scripts/with-disposable-infra.sh`) com **ambiente limpo** (sem `DATABASE_URL`/`REDIS_URL` herdados) que valida,
  por parser, host/porta/banco/usuário, confirma no servidor `current_database`/`inet_server_port`/`data_directory`/PID e, no Redis, `INFO server` = `redis.pid` e recusa sem senha.
  Controle negativo: `results/infra/negative-control-guard-wrong-port.*` (a guarda recusou antes de executar o comando).
- Diferença `schema.prisma` × banco migrado: 5 renomeações de constraint **preexistentes**, fora das tabelas da avaliação (`results/infra/schema-vs-db-diff.sql`).
- Cliente Prisma: o já gerado em `packages/db/src/generated/client` (artefatos git-ignorados, gerados de forma isolada a partir do `schema.prisma` atual). `prisma generate` **não** foi
  executado no repositório (reescreveria 7 arquivos rastreados).

## Validações (resultado, saída, contagem) — derivadas dos logs, ver `results/SUMMARY-exit-codes.txt`

| Validação | Resultado | Saída | Testes (exec/ok/falha/cancel) | Harness | Log |
| --- | --- | --- | --- | --- | --- |
| Integração real: ciclo, rotas autenticadas, datas/`::timestamp`, atomicidade (13) — TZ UTC, America/Sao_Paulo, Asia/Tokyo | APROVADO ×3 | 0 | 13/13/0/0 em cada fuso | invocação direta equivalente ao script (sem `--test-force-exit`) + variável `TZ`; **antes** das correções finais (ver Limitações) | `integration/lifecycle-run3-TZ-*.log` |
| Concorrência real (14), **antes** da correção do INSERT | APROVADO (a corrida registrava 1 sucesso + 3 falhas 23505, comportamento observado e travado no teste da época) | 0 | 14/14/0/0 | invocação direta, sem force-exit | `integration/concurrency-run3-BEFORE-insert-fix.log` |
| Script oficial `test:vertical-evaluation:integration`, antes da correção do INSERT | APROVADO | 0 | 27/27/0/0 | script oficial via executor | `integration/official-script-integration-BEFORE-insert-fix.log` |
| **Script oficial `test:vertical-evaluation:integration`, estado final** (13 ciclo + 15 concorrência) | APROVADO | 0 | 28/28/0/0 | script oficial via executor (sem adaptação), encerrou naturalmente | `integration/A-official-script-integration.log` |
| Serviço com dublê injetado, estado final | APROVADO | 0 | 18/18/0/0 | env do script oficial (`DATABASE_URL` fictícia), encerrou naturalmente | `integration/B-service-double.log` |
| Contrato legado + `authz-imob-installation` + `logistica-activation-channels`, estado final | APROVADO | 0 | 31/31/0/0 | **ADAPTADA** (ver abaixo) | `integration/C-legacy-group-ADAPTED.log` |
| Contrato legado + guardas estáticas + integração, após mudar o corpo de `GET /vertical-access` | APROVADO | 0 | 34/34/0/0 | **ADAPTADA** | `regression/clientview-fix-rerun.log` |
| Gate do worker pós-run, ambiente tipo CI (sem Redis, `DATABASE_URL` fictícia), 3 repetições + script oficial | APROVADO | 0 | 3/3/0/0 ×4 | sem `--test-force-exit`, encerrou naturalmente | `worker-teardown/ci-like-natural-exit/*` |
| `imob-post-run-mutation-worker`, após injetar o gate "sem avaliação" | APROVADO | 0 | 28/28/0/0 | encerrou naturalmente | `worker-teardown/worker-natural-exit-AFTER-gate-injection/*` |
| Mesmo arquivo, antes da injeção | REPROVADO (regressão minha, corrigida) | 1 | 28/17/11/0 | encerrou naturalmente | `worker-teardown/worker-natural-exit-BEFORE-gate-injection/*` |
| `imob-worker-metrics` | REPROVADO (4 falhas **preexistentes**) | 1 | 14/10/4/0 | encerrou naturalmente | `worker-teardown/worker-natural-exit-AFTER-gate-injection/imob-worker-metrics.log` |
| Conjunto afetado, parte 1 | INTERROMPIDO por timeout externo (110 `ok`, 0 `not ok`; sem resumo TAP) | 124 | — | **ADAPTADA** (sem `VITEST_REDIS_URL`: `testInfraEnv` apontou para `127.0.0.1:6379`) | `regression/affected-real-infra.log` |
| Conjunto afetado, parte 2 (a partir de `imob-intake-confirm`) | REPROVADO: 7 falhas = 4 de métricas (preexistentes) + 3 de `vertical-access.contract` (regressão minha, corrigida; reexecução em 34/34) | 1 | 504/497/7/0 | **ADAPTADA** | `regression/affected-remaining-real-infra.log` |
| Typecheck oficial `pnpm --filter @eiah/api typecheck` | tentativa 1: REPROVADO; tentativa 2: REPROVADO; **tentativa 3: APROVADO** | 2 / 2 / **0** | 243 → 13 → **0 erros** | oficial, após preparação local (ver abaixo) | `typecheck/api-typecheck{,-run2,-run3}.log` |
| `check:orphan-tests` | APROVADO | 0 (observado no terminal) | 0 bloqueantes | oficial | `regression/orphan-check-run2.log` |
| `front-door-intake.test.ts` (trabalho anterior do intake), antes da correção do fixture | REPROVADO: "diferença entre planos e forma de pagamento" (`context_mismatch`) | 1 | 13/12/1/0 | env do `test:ci-unit-suite` (`TSX_TSCONFIG_PATH=apps/web/tsconfig.json`), sem force-exit | `regression/front-door-intake-run1-BEFORE-fixture-fix.log` |
| `front-door-intake.test.ts`, depois da correção do fixture | APROVADO | 0 | 13/13/0/0 | idem, sem adaptação | `regression/front-door-intake-run2-AFTER-fixture-fix.log` |

## Verificações que usaram adaptações de harness (lista exata)

1. **`regression/affected-real-infra.log`** (conjunto afetado, parte 1): `--test-force-exit`, `--test-concurrency=1`, `TSX_TSCONFIG_PATH=tsconfig.base.json`, `BILLING_P0_FAULT_INJECTION=disposable`,
   `STORAGE_PROVIDER=local`, `UPLOADS_DIR` temporário. Sem `VITEST_REDIS_URL` → timeout externo de 900 s (exit 124).
2. **`regression/affected-remaining-real-infra.log`** (parte 2): as mesmas flags + `VITEST_REDIS_URL` apontando para o Redis descartável + `--test-timeout=240000`.
3. **`regression/clientview-fix-rerun.log`**: `--test-force-exit`, `--test-concurrency=1`, `VITEST_REDIS_URL`.
4. **`integration/C-legacy-group-ADAPTED.log`**: `--test-force-exit`, `--test-concurrency=1`, `VITEST_REDIS_URL`. O `authz-imob-installation` **não encerra sozinho** (`worker-teardown/legacy-authz-imob-installation*.log`: 8 subtestes `ok`, depois timeout 124):
   o teste legado não chama `closeRunEventsTransport()` no `after()` (causa rastreada em `legacy-authz-imob-installation-run6-trace2.log`). Não corrigido (fora do escopo).
5. **Typecheck**: o `build` do `@repo/db` rodou **sem** `prisma generate` (`tsup` + `build:dts` + `postbuild`), além de rebuild de `@eiah/core`, `@eiah/providers`, `@eiah/contracts`. `git status --porcelain` idêntico antes/depois (`typecheck/status-*.txt`).
6. **Baseline HEAD das métricas** (`worker-teardown/baseline-head/*`): cópias temporárias do worker e do teste do HEAD, removidas depois; os módulos compartilhados eram os da árvore atual (limite da comparação).
7. **Todas** as execuções com banco/Redis reais usaram o executor de ambiente limpo e `EIAH_DISPOSABLE_INFRA=1` (exigido pelos testes novos além da guarda de nome do banco).

Não adaptadas: o script oficial (A), o teste de serviço com dublê (B) e o gate do worker (encerram naturalmente, sem `--test-force-exit`).

## Mudanças de código causadas pela validação (todas com teste)

- **Teardown do worker**: `new Queue` em nível de módulo (`imobRunCompletedQueue.ts`) abria 1 socket Redis ao importar o router do IMOB ou o worker. Contrato sem efeito colateral em
  `imobRunCompletedQueueContract.ts`; fila criada no primeiro uso; fachada compatível. `--test-force-exit` removido do script `test:evaluation-worker-gate` e do comentário do CI.
- **Regressão (minha)**: o gate novo do worker chamava o prisma falso dos testes `imob-post-run-mutation-worker` e `imob-worker-metrics` → injeção de `evaluationGrantGateFn: NO_EVALUATION_GRANT` nesses dois testes.
- **Regressão (minha)**: `GET/POST /vertical-access` passou a incluir `evaluation` sempre; agora só quando há oferta ou grant (corpo legado idêntico com a oferta desligada).
- **Corrida do primeiro pedido** (preexistente, HEAD): `INSERT` sem `ON CONFLICT` deixava perdedores com 23505. Agora `ON CONFLICT (tenant_id, workspace_id, vertical) DO NOTHING` + releitura pelo mesmo planejador; outras violações (ex.: PK) continuam propagando (teste dedicado).

## Falhas conhecidas, classificação

| Falha | Classe | Base |
| --- | --- | --- |
| `imob-worker-metrics` T-M1, T-M4, T-M5 (4 subtestes) | **Preexistente** | as mesmas 4 falham com worker e teste do HEAD (`worker-teardown/baseline-head/`); limite: módulos compartilhados da árvore atual |
| `prisma.$executeRawUnsafe is not a function` (2 arquivos de worker) | Regressão minha, corrigida | pilha aponta `readEvaluationGrantGate`; resolvida pela injeção |
| `vertical-access.contract` (3) | Regressão minha, corrigida | chave `evaluation` no corpo; reexecução 34/34 |
| `authz-imob-installation` não encerra sem force-exit | Preexistente (teste não fecha o publisher do run-events) | pilha de criação do `ioredis` em `legacy-authz-imob-installation-run6-trace2.log`; não corrigido |
| Conjunto afetado parte 1 travado | Ambiente do harness (`testInfraEnv` preenche Redis não definido com `:6379`) | `VITEST_REDIS_URL` resolveu na parte 2 |

## Limitações (preservadas)

- **CI nunca executado**: dois passos novos em `.github/workflows/ci.yml` (gate do worker no job `CiUnitSuite`; integração real no job de integração com Postgres/Redis efêmeros) nunca rodaram no GitHub.
- **Typecheck oficial exclui `src/tests/**`** (`tsconfig.build.json`): os arquivos de teste novos (`vertical-evaluation*.test.ts`, `support/verticalEvaluationRealDb.ts`, etc.) **não** passaram por typecheck oficial.
  O typecheck do `apps/web` e o das demais suítes não foram reexecutados nesta entrega.
- **Os 3 fusos** (UTC, America/Sao_Paulo, Asia/Tokyo) foram executados **antes** das correções finais (corpo de `GET /vertical-access` e INSERT). Depois delas, o ciclo rodou só com `TZ` do ambiente (UTC), em `A-official-script-integration.log`.
- **Suítes puras/web/intake** (contrato, planejadores, engine web, intake com provider falso): rodadas anteriores desta tarefa, sem log empacotado aqui e **não reexecutadas** após as últimas correções; só as guardas estáticas e os testes reais/serviço têm log final neste pacote.
- **Não validados**: provider real (interpretação semântica), staging, CI do GitHub, Agent Protocol via HTTP, `runWorker` com fila Redis real, restauração/dados após o término da avaliação (decisão pendente).
- **`front-door-intake.test.ts` (trabalho anterior, fora do incremento da avaliação)**: a falha em "diferença entre planos e forma de pagamento" foi confirmada e **corrigida no fixture do teste**
  (as chamadas com etapa `pay_offer` usavam catálogo com `accountActive:false`, estado que `stepMatchesAccountState` rejeita por contrato; passaram a usar `accountActive:true`). Nenhuma asserção foi alterada
  e o serviço não mudou; o guard continua provado pelo teste de `context_mismatch` do mesmo arquivo. Resultado: 13/13. Só esse arquivo foi reexecutado; é do commit do trabalho anterior, não do incremento.
- **Dados 23505 dos primeiros pedidos**: antes da correção, 1 sucesso + 3 falhas (logs `*BEFORE-insert-fix*`); depois, 1 `requested` + 3 `already_requested` (`A-official-script-integration.log`, teste 13).
- Exit codes de alguns logs só foram observados no terminal (sem arquivo `.exit`): builds do typecheck, `gate-run1..3`, `orphan-check-run2`. Marcado em `results/SUMMARY-exit-codes.txt`.

## Reprodução

Requer PostgreSQL com pgvector e Redis descartáveis (banco `eiah_logistica_core_*`, `EIAH_DISPOSABLE_INFRA=1`), migrations aplicadas e a preparação de `dist` descrita acima:
`pnpm test:vertical-evaluation:integration` e `pnpm test:evaluation-worker-gate`. O provisionamento usado está em `results/scripts/` (lê credenciais de arquivo local `0600`; nenhuma credencial é gravada neste pacote).

## Versionamento deste pacote

`.gitignore` contém `docs/*` e não há exceção para `docs/evidence/`; os pacotes existentes foram versionados com `git add -f`. Este pacote **não aparece** no `git status` e só entra num commit com `git add -f docs/evidence/vertical-evaluation-grant`.
O `docs/EVIDENCE_INDEX.md` (que referencia o pacote) e `docs/ops/vertical-evaluation-grant.md` não são ignorados.

## Conteúdo

`results/infra/` (migrations, drift, controles negativos) · `results/integration/` · `results/worker-teardown/` (diagnóstico de handles antes/depois, baseline HEAD, gate CI-like) ·
`results/regression/` (conjunto afetado, orphan check) · `results/typecheck/` · `results/scripts/` · `results/SUMMARY-exit-codes.txt` · `MANIFEST.sha256` · `SOURCES.sha256`.
