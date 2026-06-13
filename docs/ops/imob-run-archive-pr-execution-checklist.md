# IMOB Run Archive PR Execution Checklist

Objetivo: arquivar `runs` paradas ha mais de 60 dias com snapshot completo de historico, receipt, bundle e contexto operacional, sem depender de regra de UI.

## Ordem Geral

- [x] Executar `PR-IMOB-RUN-ARCHIVE-01`

Saida esperada:

- [x] cada `run` elegivel ha mais de 60 dias gera snapshot audivel de archive
- [x] o archive inclui historico, artefatos e contexto de tenant/workspace/case/thread
- [x] `run` ja arquivada nao volta para a fila de processamento
- [x] a regra vive no backend/worker, nao em superficies web

## PR-IMOB-RUN-ARCHIVE-01

Objetivo: criar a trilha minima de servico, worker, persistencia e testes para backup/arquivamento de `runs` inativas.

Definicoes fechadas:

- `run parada ha mais de 60 dias` precisa virar criterio explicito de elegibilidade
- fase 1 recomendada: `archive-only`
- o backup deve carregar snapshot completo do historico operacional
- politica default: `fail-closed` quando o snapshot minimo nao puder ser montado

### Schema/model de archive, se existir no projeto

Remocoes:

- [ ] nenhuma obrigatoria

Adicoes:

- [ ] adicionar `archivedAt` no model de `Run`
- [ ] adicionar `archiveRef` no model de `Run`
- [ ] adicionar entidade/tabela `RunArchive`
- [ ] adicionar campos de snapshot completo

Ordem de edicao:

- [ ] adicionar `archivedAt`
- [ ] adicionar `archiveRef`
- [ ] adicionar `RunArchive`
- [ ] relacionar `runId`
- [ ] preparar migracao

### [apps/api/src/services/runArchiveService.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/services/runArchiveService.ts)

Remocoes:

- [ ] nenhuma obrigatoria

Adicoes:

- [x] adicionar `isRunArchiveEligible(run)`
- [x] adicionar `buildRunArchiveSnapshot(run, history, artifacts)`
- [x] adicionar `archiveRun(...)`
- [x] adicionar `fail-closed` para historico/artefato insuficiente

Ordem de edicao:

- [x] definir criterio `> 60 dias`
- [x] definir shape do snapshot de archive
- [x] coletar historico, `receiptPath`, `bundlePath` e contexto
- [x] persistir snapshot
- [ ] marcar `archivedAt` e `archiveRef`

### [apps/api/src/workers/runArchiveWorker.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/workers/runArchiveWorker.ts)

Remocoes:

- [ ] nenhuma obrigatoria

Adicoes:

- [x] criar worker/job periodico para varrer runs elegiveis
- [x] adicionar processamento em lote
- [x] adicionar protecao contra reprocessamento

Ordem de edicao:

- [x] carregar lote de runs candidatas
- [x] filtrar apenas runs nao arquivadas
- [x] chamar `archiveRun(...)`
- [x] registrar sucesso e falha por run
- [x] agendar proxima execucao

### [apps/api/src/index.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/index.ts)

Remocoes:

- [ ] nenhuma obrigatoria

Adicoes:

- [x] iniciar `runArchiveWorker`
- [x] adicionar log de bootstrap do arquivamento

Ordem de edicao:

- [x] importar worker
- [x] iniciar junto dos workers existentes
- [x] logar status de inicializacao

### [apps/api/src/routes/runs.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/routes/runs.ts)

Remocoes:

- [ ] nenhuma obrigatoria

Adicoes:

- [x] se entrar neste PR, expor leitura minima de metadata de archive
- [x] opcionalmente expor filtro `archived=true|false`

Ordem de edicao:

- [x] decidir se a rota lista ou oculta arquivados por default
- [x] adicionar filtro de consulta
- [x] manter compatibilidade do contrato atual

### `apps/api/src/tests/...runArchive...test.ts`

Remocoes:

- [ ] nenhuma obrigatoria

Adicoes:

- [x] adicionar teste de corte `> 60 dias`
- [x] adicionar teste de snapshot com historico
- [x] adicionar teste de nao reprocessar `run` ja arquivada
- [x] adicionar teste de `fail-closed` com snapshot incompleto

Ordem de edicao:

- [x] criar fixture de `run` elegivel
- [x] criar fixture de `run` recente
- [x] validar snapshot completo
- [ ] validar `archivedAt/archiveRef`
- [x] validar skip seguro

## Ordem Geral de Execucao

- [ ] schema/model de archive, se necessario
- [x] `runArchiveService.ts`
- [x] testes do servico
- [x] `runArchiveWorker.ts`
- [x] `index.ts`
- [x] `routes/runs.ts`, se entrar neste PR
- [x] QA estatico final
