# P0-B2 Redis Worker Ownership Lease — Runtime Evidence 2026-07-01

## Escopo

Evidenciar a execução real do gate `duplicateSideEffects=0` do P0-B2 Redis Worker Ownership Lease contra Redis real em ambiente local-docker controlado.

Frente: P0-B2 — Redis Worker Ownership Lease
Branch de implementação: `fix/p0-b2-worker-ownership-lease` (mergeada em `main`)
Data da execução: 2026-07-01
Branch no momento da execução: `main`
Worktree antes/depois da execução: limpa (zero arquivos alterados)

## Ambiente

| Item | Valor |
| --- | --- |
| Redis | Container `eiah-redis` (projeto local-docker) |
| Endpoint | `127.0.0.1:6379` |
| Confirmação de acessibilidade | `docker exec eiah-redis redis-cli ping` → `PONG` |
| Flag de opt-in 1 | `EIAH_RUN_REDIS_REAL_TESTS=true` |
| Flag de opt-in 2 | `REDIS_URL=redis://127.0.0.1:6379` |
| Ambiente | Desenvolvimento local (`local-docker`) — não é staging/prod |

## Gate de opt-in (segurança CI)

O teste Redis-real exige duplo opt-in explícito:

```
EIAH_RUN_REDIS_REAL_TESTS=true  +  REDIS_URL definido  →  teste executa
REDIS_URL sozinho (sem EIAH_RUN_REDIS_REAL_TESTS)       →  SKIP
EIAH_RUN_REDIS_REAL_TESTS=true sem REDIS_URL            →  SKIP
Ambos ausentes                                           →  SKIP
```

`RUN_QUEUE_REDIS_URL` e `BULLMQ_REDIS_URL` são intencionalmente excluídos para evitar ativação acidental por variáveis padrão de CI.

## Execução

### 1. Baseline sem Redis-real

Comando:

```bash
pnpm test:worker-ownership-lease
```

(sem `EIAH_RUN_REDIS_REAL_TESTS` e sem `REDIS_URL`)

Resultado:

```
tests 10
pass  9
fail  0
skipped 1
ok 10 - duplicateSideEffects=0 # SKIP EIAH_RUN_REDIS_REAL_TESTS=true and REDIS_URL are required — Redis-real duplicateSideEffects gate skipped; coverage is PARTIAL
```

Confirmação: teste Redis-real skipado corretamente quando opt-in ausente.

### 2. Gate Redis-real

Comando:

```bash
EIAH_RUN_REDIS_REAL_TESTS=true REDIS_URL=redis://127.0.0.1:6379 pnpm test:worker-ownership-lease
```

Resultado:

```
TAP version 13
ok 1  - acquire returns acquired=true when no lease exists
ok 2  - acquire returns acquired=false when another instance holds the lease
ok 3  - acquire is independent per queue — runs and run-ativo-universal do not conflict
ok 4  - release removes both lease and meta keys atomically (Lua CAS)
ok 5  - Lua CAS release: non-owner cannot delete owner's lease
ok 6  - renewal succeeds while owner holds the lease (no onLeaseLost)
ok 7  - onLeaseLost is called when lease key disappears during renewal
ok 8  - stop() cancels renewal timer without calling onLeaseLost
ok 9  - getLeaseState returns owned=false for unknown (environmentId, queue)
ok 10 - duplicateSideEffects=0: two concurrent instances for the same (environmentId, queue), only one acquires

tests 10
pass  10
fail  0
skipped 0
duration_ms: ~450
```

## Resultados

| Critério | Observado |
| --- | --- |
| Teste `duplicateSideEffects=0` executou (não skipado) | ✅ |
| `acquiredCount === 1` (exatamente um processo adquire) | ✅ — assert passou sem falha |
| `sideEffectCount === 1` | ✅ — assert passou sem falha |
| `duplicateSideEffects === 0` | ✅ — assert passou sem falha |
| Sem connection error | ✅ |
| Sem unhandled error event | ✅ |
| `lazyConnect + explicit connect()` funcionou | ✅ |
| `Lua CAS SET NX PX` garantiu exclusão mútua real | ✅ |

### Gates adicionais executados na mesma sessão

| Gate | Resultado |
| --- | --- |
| `pnpm check:worker-topology` | `ok: true` com seção `p0b2` presente |
| `pnpm --filter @eiah/core typecheck` | limpo (sem erros TypeScript) |
| `git diff --check` | exit 0 |
| `git status` após execução | worktree limpa — zero arquivos alterados |

## Invariantes confirmados por Redis real

- **SET NX PX atômico**: de dois processos concorrentes tentando adquirir o mesmo `(environmentId, queue)`, exatamente um obtém `OK`.
- **`duplicateSideEffects=0`**: o segundo processo retorna `acquired: false` sem efeito colateral.
- **`sideEffectCount === 1`**: contagem de side effects equivale a exatamente um owner.
- **lazyConnect + error handler**: conexão falha de forma controlada, não como unhandled error event.
- **finally cleanup**: `quit().catch(() => disconnect())` executado corretamente mesmo em falha.

## Limitações desta evidência

1. **Ambiente local-docker, não staging/prod**: o Redis usado é o container `eiah-redis` do ambiente de desenvolvimento local. Esta evidência não substitui execução em ambiente de staging isolado.
2. **Sem snapshot de logs Redis**: a execução não capturou logs internos do servidor Redis para auditoria externa.
3. **Single-node**: não foram testados cenários de rede particionada, failover ou reconexão Redis.
4. **`REDIS_URL` não impresso**: endereço de Redis não sensível, mas mantido fora do artefato como prática de segurança (formato `redis://127.0.0.1:6379` é público e local).

## Classificação

**local-runtime evidence** — candidato a evidência de runtime, gerado em ambiente local-docker controlado.

Não declarar P0-B completo com base nesta evidência isolada.

Para promoção a `EVIDENCIADO` canônico, recomenda-se:
- execução equivalente em ambiente de staging dedicado;
- ou decisão explícita do proprietário do projeto de aceitar local-docker como suficiente para este gate.

## Módulo canônico

`packages/core/src/queue/workerOwnershipLease.ts`

Chaves Redis validadas:
- Lease: `eiah:worker-ownership:<environmentId>:<queue>`
- Meta: `eiah:worker-ownership:<environmentId>:<queue>:meta`
