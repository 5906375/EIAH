# Worker Topology P0-B1

Data normativa: `2026-07-01`.

## Decisão

P0-B1 torna explícito o ownership das filas críticas. Nenhum processo pode inferir que deve consumir uma fila por ausência de configuração.

As variáveis obrigatórias fora de `NODE_ENV=test` são:

- `EIAH_ENVIRONMENT_ID`
- `SERVICE_ROLE=api|run-worker|maintenance-worker`
- `RUN_QUEUE_CONSUMER_MODE=api-embedded|standalone|disabled`
- `RUN_ATIVO_CONSUMER_MODE=maintenance|disabled`

Configuração ausente, inválida ou incompatível com o papel do serviço bloqueia o bootstrap antes da criação do consumidor crítico.

## Topologia canônica

| Ambiente | Serviço | `runs` | `run-ativo-universal` |
| --- | --- | --- | --- |
| Desenvolvimento/piloto single-node | API | `api-embedded` | desabilitado |
| Desenvolvimento/piloto single-node | maintenance-worker | desabilitado | `maintenance` |
| Desenvolvimento/piloto single-node | run-worker standalone | não implantado | proibido |
| Staging/produção, antes da paridade | API explicitamente autorizada | `api-embedded` | desabilitado |
| Staging/produção, antes da paridade | maintenance-worker | desabilitado | `maintenance` |
| Staging/produção, após paridade dedicada | run-worker standalone | `standalone` | proibido |

O standalone não é canônico para staging/produção enquanto sua implementação divergir do processador embedded. Sua configuração existe para permitir a futura migração controlada, não para autorizar promoção nesta fase.

## Matriz por papel

| `SERVICE_ROLE` | Modo permitido para `runs` | Modo permitido para `run-ativo-universal` |
| --- | --- | --- |
| `api` | `api-embedded` ou `disabled` | `disabled` |
| `run-worker` | `standalone` ou `disabled` | `disabled` |
| `maintenance-worker` | `disabled` | `maintenance` ou `disabled` |

Em testes, variáveis ausentes resolvem para uma topologia não consumidora. Valores fornecidos, porém inválidos, continuam falhando.

## Rollback

1. Definir o modo da fila afetada como `disabled` no serviço proprietário.
2. Reimplantar o serviço e confirmar que nenhum consumidor crítico foi iniciado.
3. Preservar os jobs pendentes no Redis; não drenar nem apagar a fila como rollback.
4. Reativar somente o owner canônico após validar a configuração de todos os serviços do ambiente.

Não usar o standalone como rollback do embedded antes de paridade funcional explícita.

## Limite de P0-B1

P0-B1 impede concorrência quando os serviços usam a matriz declarativa versionada e bloqueia regressões conhecidas no CI. Ele não detecta dois processos iniciados com arquivos de ambiente divergentes.

---

## P0-B2 — Redis Worker Ownership Lease

Data normativa: `2026-07-01`.

### Decisão

P0-B2 adiciona um lease Redis atômico por `(environmentId, queue)`. Nenhum processo pode iniciar um consumidor crítico sem adquirir o lease. Se o lease for perdido durante a operação, o worker é fechado em modo fail-closed.

### Chaves Redis

| Chave | Valor | TTL |
| --- | --- | --- |
| `eiah:worker-ownership:<environmentId>:<queue>` | `ownerId` (ex: `api-12345-1751234567890`) | 30 000 ms (renovável) |
| `eiah:worker-ownership:<environmentId>:<queue>:meta` | JSON `{ ownerId, acquiredAt, queue, environmentId }` | Igual ao lease (sem sobreviver ao owner) |

### Semântica

| Operação | Mecanismo | Garantia |
| --- | --- | --- |
| Acquire | `SET key ownerId PX 30000 NX` | Atômico — somente um processo adquire por `(env, queue)` |
| Renew | Lua CAS: `if get(key)==ownerId then pexpire` | Renova somente se ainda for o owner |
| Release | Lua CAS: `if get(key)==ownerId then del` | Libera somente se ainda for o owner |
| Lease lost | Renewal detecta `renewed !== 1` | `onLeaseLost()` chamado → worker fechado fail-closed |

Intervalo de renovação: 10 000 ms. Margem de falha: 3× o intervalo antes de expirar o TTL.

### Integração por serviço

| Serviço | Fila protegida | Fail-closed |
| --- | --- | --- |
| `api` (embedded) | `runs` | `worker.close()` via referência retornada por `startRunQueueBullMqWorker()` |
| `run-worker` (standalone) | `runs` | `worker.close()` via referência retornada por `consumeLegacyRunQueue()` |
| `maintenance-worker` | `run-ativo-universal` | `runAtivoUniversalWorker.close()` |

SIGTERM/SIGINT em todos os três serviços chamam `lease.release()` antes de encerrar.

### Health

O endpoint `/api/health` expõe `workerOwnership` (sem credenciais):

```json
{
  "workerOwnership": {
    "runs": { "owned": true, "ownerId": "api-12345-...", "acquiredAt": "2026-07-01T..." }
  }
}
```

O campo é opcional — aparece apenas se o serviço tentou adquirir algum lease.

### Módulo canônico

`packages/core/src/queue/workerOwnershipLease.ts`

Exports obrigatórios: `acquireWorkerOwnershipLease`, `getLeaseState`, `resolveLeaseKey`, `resolveMetaKey`.

### Gate estático

`scripts/checkWorkerTopology.ts` valida:
- arquivo `workerOwnershipLease.ts` existe;
- exports obrigatórios presentes;
- API, run-worker e maintenance-worker importam `acquireWorkerOwnershipLease`.

### Rollback

1. Remover as chamadas `acquireWorkerOwnershipLease` dos três bootstraps.
2. Workers voltam a consumir sem lease — estado P0-B1.
3. O módulo `workerOwnershipLease.ts` pode permanecer no repositório; não drena filas.
4. Reativar somente após validar Redis em staging.
