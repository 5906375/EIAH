# Evidência real — runtime do contract test IMOB resolve-turn (2026-07-07)

## Escopo

Validação operacional do runtime necessário para executar o contract test HTTP real:

- `apps/api/src/tests/imob.chat.resolve-turn.contract.test.ts`

Sem alterar:

- feature `workspace_case_list`
- `apps/web/src/components/agents/ChatAgentLauncher.tsx`
- mocks de Postgres/Redis
- o próprio contract test

## Arquivos consultados

- `CODEX.md`
- `IA_EIAH.md`
- `apps/api/src/tests/imob.chat.resolve-turn.contract.test.ts`
- `apps/api/src/tests/support/testInfraEnv.ts`
- `docker-compose.dev.yml`
- `package.json`

## Runtime mapeado

O teste define e/ou espera:

- `DATABASE_URL=postgresql://postgres:senha@127.0.0.1:5433/eiah_builder?schema=public`
- `REDIS_URL=redis://127.0.0.1:6379`

O helper `apps/api/src/tests/support/testInfraEnv.ts` confirma a estratégia do repositório para host-run tests:

- normalizar `eiah-postgres` para `127.0.0.1:5433`
- normalizar `eiah-redis` para `127.0.0.1:6379`
- alinhar envs auxiliares de Redis usadas por filas, memória e eventos

O `docker-compose.dev.yml` expõe:

- `eiah-postgres`: `5433:5432`
- `eiah-redis`: `6379:6379`
- `POSTGRES_PASSWORD=senha`
- `POSTGRES_DB=eiah_builder`

## Estado operacional encontrado

### `docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'`

```text
NAMES                     STATUS                  PORTS
eiah-web                  Up 42 hours (healthy)   0.0.0.0:5173->5173/tcp, :::5173->5173/tcp
eiah-api                  Up 42 hours (healthy)   0.0.0.0:8080->8080/tcp, :::8080->8080/tcp
eiah-action-runner        Up 42 hours
eiah-maintenance-worker   Up 42 hours
eiah-redis                Up 2 days (healthy)     0.0.0.0:6379->6379/tcp, :::6379->6379/tcp
eiah-postgres             Up 2 days (healthy)     0.0.0.0:5433->5432/tcp, :::5433->5432/tcp
```

### Conectividade real

O sandbox local bloqueou sockets do host (`Operation not permitted`), então a validação real foi repetida fora do sandbox.

#### Postgres

Comando:

```bash
pg_isready -h 127.0.0.1 -p 5433 -U postgres -d eiah_builder
```

Resultado:

```text
127.0.0.1:5433 - accepting connections
```

Comando:

```bash
PGPASSWORD=senha psql -h 127.0.0.1 -p 5433 -U postgres -d eiah_builder -tAc "select 1"
```

Resultado:

```text
1
```

#### Redis

Comando:

```bash
printf "PING\r\n" | nc -w 2 127.0.0.1 6379
```

Resultado:

```text
+PONG
```

## Execução real do contract test

Comando:

```bash
timeout 120s node --import tsx --test apps/api/src/tests/imob.chat.resolve-turn.contract.test.ts
```

O teste iniciou e executou contra Postgres/Redis reais. Não houve `ERR_PACKAGE_PATH_NOT_EXPORTED`, `connect EPERM 127.0.0.1:5433` nem hang de bootstrap.

### Resultado observado

```text
1..8
# tests 8
# suites 0
# pass 6
# fail 1
# cancelled 0
# skipped 1
# todo 0
# duration_ms 31303.61429
```

### Subtests

- `ok 1` `IMOB resolve-turn returns inventory guidance contract over HTTP`
- `ok 2` `IMOB resolve-turn records semantic telemetry for operational guidance`
- `ok 3` `IMOB resolve-turn records consultive read and specialist telemetry for case guidance`
- `ok 4` `IMOB search inventory returns backend presentation over HTTP`
- `not ok 5` `IMOB resolve-turn covers market scan offer, read-only scan, snapshot persistence, selection and governed creation over HTTP`
- `ok 6` `IMOB resolve-turn processes owner + property + lead batch intake over HTTP`
- `ok 7` `IMOB resolve-turn handles owner dedupe choices over HTTP without looping # SKIP`
- `ok 8` `IMOB resolve-turn keeps read-only pilot consult without mutating CRM rows over HTTP`

### Falha funcional objetiva

```text
Expected values to be strictly equal:
+ actual - expected

+ 'crm.batch.intake'
- 'crm.market_scan.offer'
```

Local da asserção:

- `apps/api/src/tests/imob.chat.resolve-turn.contract.test.ts:342`

## Verificação de arquivo intocável

Comando:

```bash
git diff -- apps/web/src/components/agents/ChatAgentLauncher.tsx
```

Resultado:

```text
[sem diff]
```

## Conclusão operacional

- `@eiah/core/events/redisPublisher`: já não é bloqueador nesta execução
- Postgres local em `127.0.0.1:5433`: acessível e consultável
- Redis local em `127.0.0.1:6379`: acessível e respondendo `PONG`
- banco `eiah_builder` com credenciais `postgres:senha`: compatível com o esperado
- o contract test executa de verdade no ambiente local quando roda fora do sandbox
- o bloqueio remanescente deixou de ser de runtime e passou a ser uma falha funcional do subtest 5

## Classificação

- runtime local: `sucesso real`
- execução do contract test: `parcial/evidenciado`
- natureza do bloqueio remanescente: `outro` (falha funcional/contratual do fluxo testado), não `sandbox/runtime`

