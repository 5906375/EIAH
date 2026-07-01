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

P0-B2 permanece obrigatório para:

- lease Redis por ambiente e fila;
- renovação e perda fail-closed do ownership;
- health/telemetria do owner efetivo;
- prova integrada de execução única;
- `duplicateSideEffects=0` derivado de execução real, sem valor hardcoded.
