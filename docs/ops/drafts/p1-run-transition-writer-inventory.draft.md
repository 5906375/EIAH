# Escritores de estado de Run — inventário parcial para P1

Status: **rascunho de inspeção estática do recorte fornecido**, não inventário
completo do repositório nem aprovação operacional. ADR-009 permanece Proposta.

## Escopo inspecionado

Arquivos recebidos no pacote `eiah-p1-produtores-run-financeiro.tar.gz`:
`apps/api/src/services/{runs,billing,tenantBilling}.ts`, rotas
`{runs,agents,imob,shadow-executions}.ts`, `apps/api/src/workers/runWorker.ts`
e `packages/core/src/services/tenantInvoiceService.ts`, além do schema Prisma
recebido anteriormente. O usuário também forneceu resultados de busca do
repositório e trechos de `apps/workers/run-worker/src/index.ts` e
`apps/api/src/services/runAtivoUniversalAgent/orchestrator.ts`. Os números
de linha correspondem a esses recortes. A busca SQL posterior também
identificou trechos de `runArchiveService.ts` e
`scripts/validate-imob-chat-intake-phase46.sh`, fornecidos pelo usuário;
revalidar no workspace atual
antes de editar.

| Caminho | Escrita observada | Situação para histórico obrigatório |
| --- | --- | --- |
| `apps/api/src/services/runs.ts:180` | `createRunRecord` cria `Run` com status e `finishedAt` inicial. Chamado por rotas de runs, agents, imob e shadow-executions no recorte. | Precisa evento inicial `sequence=0` na mesma transação da criação; conferir demais call sites. |
| `apps/api/src/services/runs.ts:250` | `finalizeRunRecord` altera `status` e `finishedAt`. Chamado pelo worker no recorte. | Precisa transição com valores anteriores e novos na mesma transação; proteger concorrência e retries. |
| `apps/api/src/services/runs.ts:298` | `updateRunStatus` altera status e, para pendente/running, zera `finishedAt`. Chamado pelo worker no recorte. | Precisa transição atômica, inclusive quando `finishedAt` muda ou status se repete. |
| `apps/api/src/routes/runs.ts:1667` | `markPending` faz `prisma.run.update({data:{status:'pending',updatedAt:...}})` diretamente; `emitEnqueued` é outro callback. | Bypass do serviço. O código mostrado não prova que update e evento pertençam à mesma transação; exige revisão do orquestrador e instrumentação. |
| `apps/workers/run-worker/src/index.ts:95,168,187,198` | Worker legado consome `runQueue` e faz `db.run.update({data:{status}})` para `running`, `success` e `error`, sem `finishedAt`; falha do update é apenas logada. `PrismaRunEventStore.record` usa `runEvent.create` separadamente e também apenas loga falhas. | Escritor adicional de estado, sem evento de transição obrigatório/atômico. Revisar tenant/workspace usados no lookup e a ausência de propagação de erro; não usar os eventos genéricos como prova de histórico. |
| `apps/api/src/services/runAtivoUniversalAgent/orchestrator.ts:363` | Update direto de `Run.response` no trecho fornecido, sem `status`/`finishedAt`. | Não é escritor de estado no trecho examinado; conferir outros caminhos desse serviço. |
| `apps/api/src/services/runArchiveService.ts:282` | SQL `UPDATE runs` altera `archived_at` e `archive_ref` depois de `INSERT INTO run_archives`; não altera `status`/`finishedAt` no trecho fornecido. | Não é transição de estado da run; a atomicidade entre arquivo e metadados é outra análise. |
| `scripts/validate-imob-chat-intake-phase46.sh:114` | Script de validação aponta para banco local e executa SQL `UPDATE runs SET status='success', updated_at=NOW()` para simular worker, sem `finishedAt` nem evento de transição no trecho mostrado. | Escritor de estado em fixture/simulação, não evidência de caminho produtivo. Excluir seus dados de qualquer prova operacional e avaliar adaptação quando o contrato de eventos for obrigatório. |
| `apps/api/src/routes/agents.ts:612`; `routes/runs.ts:863,993,1091,1162,1299`; `services/billing.ts:242`; `workers/runWorker.ts:566` | Updates diretos examinados no recorte alteram request, aprovação, response, custo ou traceId, sem mudança explícita de status/finishedAt. | Não são transições de estado pelos campos examinados; revalidar campos espalhados/condicionais no código atual. |

`RunEvent` tem `type` e `payload` livres, sem sequência obrigatória nem
restrição que cubra toda escrita de estado. A presença de eventos em alguns
fluxos não comprova cobertura, atomicidade ou reconstrução histórica.
O callback do worker legado usa fallback `default-tenant`/`default-workspace`
quando o job omite IDs; a pertinência desse caminho ao tenant avaliado e
seu comportamento de autorização precisam de revisão específica. Este
inventário não afirma bypass efetivo de tenant nem execução operacional.

## Verificação necessária no repositório completo

1. Enumerar todos os `create`, `update`, `upsert`, `createMany`, `updateMany`
   e SQL bruto que escrevam `Run`/`runs`, também fora de `apps/api`, incluindo
   scripts de manutenção e código gerado chamado em runtime. Conferir aliases
   de Prisma e callbacks passados a serviços.
2. Distinguir mutação de estado de mutação de outros campos; identificar todas
   as entradas que alteram `status`/`finishedAt` e os caminhos de reprocessamento.
3. Revisar o orquestrador de replay de `routes/runs.ts` e a fronteira real da
   transação em cada escritor. Associar cada escritor à transição atômica ou
   bloqueá-lo antes de alegar cobertura completa.
4. Definir persistência com unicidade `(runId, sequence)` e `transitionId`,
   vínculo tenant/workspace, exclusão de atualização/remoção e teste de
   concorrência. Especificar proveniência do commit; timestamp de aplicação
   sozinho não é ordem verificável de commits.
5. Runs históricas sem evento inicial/completo ficam em
   `stateAtCutoffVerification=not_demonstrated`; não fabricar eventos a partir
   de `Run.status` atual. Uma prova operacional exige enumeração e comparação
   de fonte por caminho independente, além do watermark.

Nenhum arquivo de runtime, CI, schema ou Evidence Index é alterado por este
inventário. Não há evidência indexável de cobertura de todos os escritores.

## Revisão do pacote de escritores completo (fornecido posteriormente)

O pacote `eiah-p1-escritores-transicao.tar.gz` confirma a ordem de
`executePersistedRunReplay` em `apps/api/src/routes/runs.ts`: emite pedido,
publica job BullMQ, marca a run `pending` e emite evento de enfileiramento.
O consumidor pode iniciar depois da publicação e **antes** da marcação;
uma marcação tardia pode sobrepor `running`/`success`/`error`. Publicar e
alterar o banco são operações em sistemas distintos, sem transação comum
no código fornecido. O replay requer um protocolo durável: persistir o
estado de replay e uma intenção de publicação (outbox) na mesma transação
da transição; publicar a partir da outbox após o commit, com deduplicação,
retries e teste da janela entre commit, publicação e confirmação. A escolha
do protocolo ainda precisa de implementação e revisão, não está aprovada
por este rascunho.

O worker legado tem `attempts: 3` no publicador da fila; transições de
reexecução devem preservar identidade do job e idempotência por transição.
`updateRunStatus` no worker usa apenas `where: { id: runId }`, enquanto o
lookup do consumidor aceita ausência do registro via fallback no controle
mostrado; falha de escrita é logada sem falhar o job. O worker escreve
`success`/`error` sem `finishedAt`, incompatível com a exigência atual de
terminalidade do seletor de população. A topologia permite consumidor de
runs `standalone` ou `api-embedded`, condicionado à configuração; o pacote
não contém o consumidor embutido da API nem a configuração operacional.

`RunEvent` não tem sequência única por run ou restrição de evento inicial.
Um armazenamento de transições dedicado, com unicidade `(runId, sequence)`
e `transitionId`, deve ser avaliado antes de usar eventos genéricos como
histórico. A operação atômica proposta confere tenant/workspace, estado
anterior e versão esperada, atualiza `status` e `finishedAt` coerentemente
e acrescenta exatamente um evento versionado no mesmo commit; conflito
concorrente falha fechado ou repete após nova leitura. Deve abranger criação,
finalização, atualização, replay e os dois modos de worker, sem presumir
que os trechos examinados constituem todos os escritores.

Sequência por run ordena eventos dessa run, mas não demonstra **visibilidade
no cutoff histórico** entre transações diferentes. Um timestamp da
aplicação ou obtido antes do commit não é marcador de commit. O desenho
precisa especificar referência verificável de commit/visibilidade e
watermark antes de reconstruir estado em C como prova operacional. Até lá,
`stateAtCutoffVerification=not_demonstrated` e elegibilidade bloqueada.
