# Decisão do gate G4 do P0 — conexão Redis do worker IMOB

- **Identificador:** `EIAH-P0-G4-REDIS-IMOB-20261010`
- **Classificação:** parcial
- **Ambiente:** Render staging, serviço `eiah-api-staging`
- **Commit de referência:** `321f8a8212f9ea61129d6e480a8f5077f9c31bfd` (merge do PR #501)
- **Data do registro:** 2026-10-10
- **Responsável pela decisão:** Carlos Alberto Merlo (administrador único, ADR-008)

> Documento de decisão de gate. Não é evidência de execução e não entra em `docs/EVIDENCE_INDEX.md`.
> Informações relatadas pelo responsável são marcadas como **relatadas**; não foram promovidas a
> evidência comprovada.

## 1. Objetivo

Registrar como o worker IMOB escolhe a conexão Redis, separar o que foi comprovado do que continua
pendente e preservar a rastreabilidade do gate G4 do deploy do P0 no staging.

## 2. Contexto

O P0 (`321f8a8`) remove `systemPrompt`, `tools` e `models` das respostas de `GET /api/agents` e
`GET /api/agents/:name`. Segundo o responsável (**relatado**), o commit foi implantado no Render
staging e os testes HTTP autenticados feitos depois do deploy foram aprovados. Não há artefato desse
deploy nem desses testes no repositório. Isso não altera a classificação do G4.

O G4 trata do risco de reprocessamento no `ImobPostRunMutationWorker` durante o restart da API.

## 3. Como o worker escolhe a conexão (fato de código)

O `ImobPostRunMutationWorker` e o produtor da fila usam `getRedisConnection()`
(`packages/core/src/queue/connection.ts:37-47`). A função usa a primeira variável definida, nesta ordem:

1. `RUN_ATIVO_UNIVERSAL_REDIS_URL`
2. `ACTION_QUEUE_REDIS_URL`
3. `RUN_QUEUE_REDIS_URL`
4. `BULLMQ_REDIS_URL`
5. `QUEUE_REDIS_URL`
6. `REDIS_URL`

O worker só usa `REDIS_URL` quando as cinco primeiras estão ausentes. O database vem do caminho da URL
(`connection.ts:26-29`); sem caminho, é o database 0.

Outros fatos de código:

- Fila: `imob-run-completed`, nome fixo (`apps/api/src/queues/imobRunCompletedQueue.ts:20`), sem
  prefixo customizado (`imobRunCompletedQueue.ts:28-33`; `imobPostRunMutationWorker.ts:744-761`). As
  chaves ficam em `bull:imob-run-completed:*`, prefixo padrão do BullMQ.
- O worker sobe sem depender de flag (`apps/api/src/index.ts:173`).
- `imob-worker.started` é registrado no evento `ready` do BullMQ
  (`apps/api/src/workers/imobPostRunMutationWorker.ts:764-769`). O log informa a fila e a
  concorrência; não informa host nem database.
- Concorrência padrão: `IMOB_MUTATION_WORKER_CONCURRENCY ?? 3` (`imobPostRunMutationWorker.ts:742`).

## 4. Observações registradas, por origem

### 4.1 Painel do Render (relatadas)

| Observação | Valor relatado | Responsável | Horário (UTC) |
|---|---|---|---|
| Recurso Redis vinculado | `eiah-redis-staging` | não registrado | não registrado |
| Estado do recurso | `available` | não registrado | não registrado |
| Database no caminho da `REDIS_URL` | `0` | não registrado | não registrado |
| `RUN_QUEUE_CONSUMER_MODE` | `disabled` | não registrado | não registrado |
| Ausência das cinco variáveis anteriores a `REDIS_URL` | não verificada neste registro | não registrado | não registrado |

### 4.2 Comandos de console no Redis (relatados, somente leitura)

| Leitura | Comando | Resultado relatado | Conexão usada |
|---|---|---|---|
| L1 | `LLEN bull:imob-run-completed:active` | 0 | não registrada |
| L1 | `LLEN bull:imob-run-completed:wait` | 0 | não registrada |
| L1 | `ZCARD bull:imob-run-completed:delayed` | 0 | não registrada |
| L1 | `EXISTS bull:imob-run-completed:meta` | 1 | não registrada |
| L2 | `LLEN bull:imob-run-completed:active` | 0 | não registrada |
| Inspeção atual | identificação da conexão | fingerprint `5b8f8ffb0c243ba0` | ver §5 |

Responsável e horário UTC de cada leitura: não registrados.

`EXISTS …:meta = 1` indica só que o hash de metadados da fila existe. A pausa da fila é o campo
`paused` desse hash, que não foi lido.

### 4.3 Logs da aplicação (relatados)

| Evento | Origem no código | Horário (UTC) | Deploy |
|---|---|---|---|
| `imob-worker.started` (`concurrency: 3`) | `imobPostRunMutationWorker.ts:764-769` | não registrado | não registrado |

O registro de inicialização mostra que o worker conectou a um Redis. Não comprova processamento de
jobs nem identifica a conexão.

## 5. Fingerprint da conexão

- **Valor relatado:** `5b8f8ffb0c243ba0`, com 16 caracteres hexadecimais (64 bits), compatível com um
  hash truncado.
- **Algoritmo:** não documentado.
- **Entradas usadas:** não documentadas.
- **Database no cálculo:** não documentado. Não deve ser presumido; se não fez parte da geração original,
  não entra em nenhuma reconciliação histórica.
- **Truncamento:** não documentado.

Sem esses dados, o fingerprint identifica a observação atual, mas não pode ser recalculado de forma
independente.

## 6. Lacuna documentada

- As leituras L1 e L2 não registraram a conexão usada.
- Não existe evidência histórica independente de que L1, L2 e a inspeção atual foram feitas no mesmo
  Redis e no mesmo database.
- Uma leitura nova não substitui essa prova histórica e não deve ser usada para reconstruí-la.

## 7. Controles distintos

`RUN_QUEUE_CONSUMER_MODE=disabled` desliga só o consumidor da fila `runs` (`apps/api/src/index.ts:176-241`).
Não desliga o worker IMOB. A ausência de processamento IMOB não pode ser deduzida dessa variável.

## 8. Matriz de proveniência

| Informação | Origem | Situação |
|---|---|---|
| Ordem das variáveis Redis e database pelo caminho da URL | Código (`connection.ts:26-47`) | Evidenciado (código) |
| Nome da fila e ausência de prefixo | Código (`imobRunCompletedQueue.ts:20`, `:28-33`) | Evidenciado (código) |
| Worker IMOB sobe sem depender de flag | Código (`index.ts:173`) | Evidenciado (código) |
| Evento `imob-worker.started` e concorrência 3 | Código (`imobPostRunMutationWorker.ts:742`, `:764-769`) | Evidenciado no código; ocorrência no staging relatada |
| `RUN_QUEUE_CONSUMER_MODE=disabled` não afeta o worker IMOB | Código (`index.ts:173`, `:176-241`) | Evidenciado (código) |
| `eiah-redis-staging`, `available`, database 0 | Painel do Render | Relatado, sem artefato |
| Ausência das cinco variáveis anteriores a `REDIS_URL` | Painel do Render | Não demonstrado |
| Contagens L1 e L2 | Console Redis | Relatado, sem horário nem conexão |
| Fingerprint `5b8f8ffb0c243ba0` | Cálculo do responsável | Relatado; algoritmo e entradas não documentados |
| Deploy de `321f8a8` e testes HTTP pós-deploy aprovados | Responsável | Relatado, sem artefato no repositório |

## 9. Ainda não demonstrado

1. Que as cinco variáveis anteriores a `REDIS_URL` estão ausentes no `eiah-api-staging`, com responsável e horário.
2. Responsável e horário UTC de cada observação do painel, de cada leitura do console e do log
   `imob-worker.started`, com o ID do deploy.
3. Algoritmo, entradas, inclusão ou não do database e truncamento do fingerprint.
4. Que L1 e L2 foram feitas na mesma conexão da inspeção atual. Não é recuperável por uma leitura nova.
5. Artefatos do deploy de `321f8a8` e dos testes HTTP pós-deploy, necessários para qualquer entrada futura
   no Evidence Index.

## 10. Decisão

**G4 permanece parcial.**

| Item | Situação |
|---|---|
| Regra de escolha da conexão | Evidenciada (código) |
| Variável efetivamente usada em staging | Depende do item 1 da §9 |
| Inicialização do worker IMOB | Relatada |
| Contagens da fila | Relatadas, válidas só para o instante de cada leitura |
| Equivalência entre as conexões das leituras | Não demonstrada |

Não é permitido:

- promover G4 a evidenciado;
- declarar todos os gates do P0 encerrados;
- afirmar que houve, ou que não houve, processamento IMOB sem evidência específica.

## 11. Restrições respeitadas

Este registro foi preparado sem deploy, migração, alteração no Redis, mudança de variáveis de ambiente
ou execução deliberada de jobs.

## 12. Encaminhamento

- Completar as informações da §9 somente com dados comprováveis.
- Manter G4 parcial até existir evidência histórica independente da equivalência entre conexões.
- Se essa evidência não existir, manter a lacuna registrada, sem reconstruir fatos.
- Qualquer entrada futura no Evidence Index exige artefatos reais anexados em `ops/evidence/latest/`
  (`IA_EIAH.md` §13).
