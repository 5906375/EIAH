# F5.0 — Provider Final Selection Formal Phase Opening / Final-Selection-Only Charter — 2026-07-15

## Resumo executivo

Foi criada a Formal Phase Opening / Final-Selection-Only Charter da F5.0 para abrir uma fase documental de governanca final-selection-only para avaliacao futura hipotetica de provider WhatsApp.

F5.0 nao autoriza selecao final de provider, implementacao, execucao, producao, provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacoes ou side effects. Provider integration permanece `blocked`, provider final selection permanece `not authorized`, F4.5 Candidate Review Boundary permanece baseline, F4.4 Selection No-Go Record permanece ativo, F3.6 Pre-Selection Boundary permanece baseline e F2.26 Governance Closure permanece baseline.

## Pre-condicao F4.5

Pre-condicao comprovada antes das alteracoes:

- F4.5 mergeada em `main` no commit `63a098217324256a4b52b3bf090835538fd12c66`.
- `origin/main` aponta para `63a098217324256a4b52b3bf090835538fd12c66`.
- `CI Monorepo`: `completed success`, run `29572316329`.
- `IMOB Worker Mutation E2E`: `completed success`, run `29572316324`.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/ops/whatsapp-provider-selection-evidence-closure-candidate-review-boundary.md`
- `docs/ops/whatsapp-provider-candidate-preliminary-review-outcome-selection-no-go-record.md`
- `docs/ops/whatsapp-provider-selection-formal-phase-opening-selection-only-charter.md`
- `docs/ops/whatsapp-provider-integration-design-only-closure-pre-selection-boundary.md`
- `docs/ops/whatsapp-provider-integration-governance-closure-end-of-track-summary.md`
- `ops/evidence/latest/f4-05-provider-selection-evidence-closure-candidate-review-boundary-2026-07-15.md`

## Problema resolvido

F4.5 consolidou a cadeia selection-only e declarou o Candidate Review Boundary, mas ainda nao havia uma abertura formal separada para uma fase documental final-selection-only.

F5.0 resolve essa lacuna criando um charter proprio que permite organizar criterios e governanca de avaliacao final-selection-only sem selecionar provider, sem implementar, sem executar e sem liberar producao.

## Formal Phase Opening

A abertura formal da F5.0 separa a baseline F4.5 de qualquer decisao futura de selecao final.

Ela declara que:

- F4.5 Candidate Review Boundary permanece baseline imediata;
- F4.4 Selection No-Go Record permanece ativo;
- F3.6 Pre-Selection Boundary permanece baseline;
- F2.26 Governance Closure permanece baseline;
- provider integration permanece `blocked`;
- provider final selection permanece `not authorized`.

## Final-Selection-Only Charter

O charter permite somente artefatos documentais de avaliacao final-selection-only, como criterios finais, evidencias requeridas, approvals, governance gates e blocked implementation actions.

O maior estado permitido por F5.0 e `proposta/parcial evidenciada documentalmente`. F5.0 nao e decisao final de provider.

## Final-selection-only scope

- Abrir formalmente a fase F5 como final-selection-only.
- Definir criterios de avaliacao para futura decisao final.
- Revisar F2.26, F3.6, F4.0, F4.4 e F4.5 como baselines.
- Listar evidencias finais ainda requeridas por candidato.
- Mapear approvals obrigatorios para decisao futura.
- Definir final selection governance gates.
- Registrar blocked implementation actions.
- Preparar decision record futuro sem decisao final.
- Confirmar provider integration `blocked`.
- Confirmar provider final selection `not authorized`.
- Preservar ausencia de provider real, secret produtivo, webhook produtivo, mutacoes e side effects.

## Out-of-scope

- Selecionar provider real ou final.
- Declarar provider selecionado.
- Integrar provider WhatsApp real.
- Usar, solicitar, armazenar ou provisionar secret produtivo.
- Habilitar webhook produtivo.
- Criar endpoint publico novo.
- Criar dashboard obrigatorio.
- Criar storage externo obrigatorio.
- Criar ledger produtivo obrigatorio.
- Criar mutacoes.
- Criar `lead.create`.
- Criar `lead.discard`.
- Executar acao critica.
- Fazer provider external call.
- Gerar mutation external side effect.
- Permitir `sideEffects != 0`.
- Alterar `ChatAgentLauncher`, runtime, engine, workflows, `release.yml`, apps, packages ou scripts para provider.
- Declarar WhatsApp operacional.
- Declarar provider integrado.
- Declarar F5.0 como autorizacao de implementacao, execucao ou producao.

## Entry criteria

- F4.5 mergeada em `main` com CI pos-merge verde.
- F4.5 indexada em `docs/EVIDENCE_INDEX.md`.
- F4.5 Candidate Review Boundary tratada como baseline imediata.
- F4.4 Selection No-Go Record ativo.
- F3.6 Pre-Selection Boundary baseline.
- F2.26 Governance Closure baseline.
- Provider integration `blocked`.
- Provider final selection `not authorized`.
- Escopo F5.0 excluindo selecao final efetiva, implementacao, execucao e producao.
- Blocked implementation actions preservados.
- Checks documentais obrigatorios verdes.

## Exit criteria

- Charter F5.0 fisicamente documentado.
- Evidencia F5.0 fisica e indexada.
- F4.5 permanece baseline de candidate review.
- F4.4 Selection No-Go Record permanece ativo.
- F3.6 permanece baseline pre-selection.
- F2.26 permanece baseline de governanca.
- Provider integration permanece `blocked`.
- Provider final selection permanece `not authorized`.
- Ausencia de provider real, secret produtivo, webhook produtivo, mutacoes e side effects documentada.
- Checks obrigatorios passam.
- Diff de isolamento confirma ausencia de alteracoes em workflows, `release.yml`, apps, packages e scripts.
- Status final permanece `proposta/parcial evidenciada documentalmente`.

## Required approvals

Qualquer decisao futura de selecao final exigira, no minimo:

- Security.
- Privacy/Compliance, se aplicavel.
- Backend/API.
- Platform governance.
- Product/Platform.
- DocOps.
- Executive sponsor, se aplicavel.

F5.0 nao concede approvals. Ele apenas registra que approvals futuros sao obrigatorios.

## Required evidence

- `docs/EVIDENCE_INDEX.md`.
- F2.26 Governance Closure e evidencia indexavel.
- F3.6 Pre-Selection Boundary e evidencia indexavel.
- F4.0 Selection-Only Charter e evidencia indexavel.
- F4.4 Selection No-Go Record e evidencia indexavel.
- F4.5 Candidate Review Boundary e evidencia indexavel.
- Documento F5.0 final-selection-only charter.
- Evidencia F5.0 fisica e indexavel.
- Checks obrigatorios verdes.
- Prova de isolamento das superficies proibidas.
- Confirmacao de ausencia de provider real, secret produtivo, webhook produtivo, mutacoes e side effects.

## Final selection governance gates

- Precondition gate F4.5.
- Evidence Index gate.
- Docs link integrity gate.
- Isolation diff gate.
- F2.26 governance baseline gate.
- F3.6 pre-selection boundary baseline gate.
- F4.5 candidate review boundary baseline gate.
- F4.4 Selection No-Go Record continuity gate.
- Required approvals gate.
- Required evidence gate.
- Provider integration blocked gate.
- Provider final selection not authorized gate.
- Productive secret blocked gate.
- Production webhook blocked gate.
- Mutation blocked gate.
- SideEffects zero gate.
- No implementation authorization gate.
- No execution authorization gate.
- No production authorization gate.

## Blocked implementation actions

- Provider final selection.
- Provider WhatsApp real.
- Provider integration.
- Secret produtivo.
- Webhook produtivo.
- Endpoint publico novo.
- Dashboard obrigatorio.
- Storage externo obrigatorio.
- Ledger produtivo obrigatorio.
- Mutacoes.
- `lead.create`.
- `lead.discard`.
- Acao critica.
- Provider external call.
- Mutation external side effect.
- `sideEffects != 0`.
- PII/sensiveis em logs, metricas, bundles ou evidencias.
- Alteracoes em `ChatAgentLauncher`, runtime, engine, workflows, `release.yml`, apps, packages ou scripts para provider.

## ReasonCodes

- `F5_FORMAL_PHASE_OPENING_ONLY`
- `F5_FINAL_SELECTION_ONLY_CHARTER_ACTIVE`
- `FINAL_SELECTION_PHASE_NOT_SELECTION_AUTHORIZATION`
- `FINAL_SELECTION_ONLY_NOT_IMPLEMENTATION_AUTHORIZATION`
- `PROVIDER_FINAL_SELECTION_STILL_BLOCKED`
- `PROVIDER_INTEGRATION_STILL_BLOCKED`
- `PRODUCTIVE_SECRET_STILL_BLOCKED`
- `PRODUCTION_WEBHOOK_STILL_BLOCKED`
- `MUTATION_STILL_BLOCKED`
- `F4_CANDIDATE_REVIEW_BOUNDARY_BASELINE`

## Provider final selection boundary

Provider final selection permanece `not authorized`. F5.0 nao seleciona provider, nao recomenda provider como final, nao aprova procurement, nao cria contrato, nao cria configuracao e nao permite interpretar final-selection-only como selecao implicita.

## Provider integration boundary

Provider integration permanece `blocked`. F5.0 nao cria provider, nao integra provider real, nao cria webhook, nao provisiona secret, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes e nao executa acao critica.

## Baseline continuity

F4.5 Candidate Review Boundary permanece baseline imediata. F4.4 Selection No-Go Record permanece ativo. F3.6 Pre-Selection Boundary permanece baseline. F2.26 Governance Closure permanece baseline.

## Nao-autorizacao de selecao final de provider

F5.0 nao autoriza selecao final de provider. A abertura formal e o final-selection-only charter apenas autorizam documentar criterios e governanca para uma possivel decisao futura.

## Nao-autorizacao de implementacao

F5.0 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine, launcher, workflow, app, package ou script.

## Nao-autorizacao de execucao

F5.0 nao autoriza execucao, configuracao, teste com provider real, provider external call, mutation external side effect, uso de secret produtivo, webhook produtivo, mutacao, lead action, acao critica ou `sideEffects != 0`.

## Nao-autorizacao produtiva

F5.0 nao e autorizacao de producao. Formal phase opening, final-selection-only charter, evidence index, F4.5 Candidate Review Boundary, F4.4 Selection No-Go Record, F3.6 Pre-Selection Boundary ou F2.26 Governance Closure nao podem ser tratados como permissao para operar WhatsApp, selecionar provider final, integrar provider, provisionar secret produtivo, habilitar webhook produtivo ou executar mutacoes.

## Checks executados

- `pnpm check:evidence-index`: passou com `ok: true`, `refsChecked: 593`.
- `pnpm check:docs-link-integrity`: passou com `ok: true`, `filesChecked: 15`.
- `git diff --check`: passou sem saida.
- `git diff -- .github/workflows release.yml apps packages scripts`: passou sem saida.

## Prova de isolamento

Alteracoes planejadas apenas em documentacao operacional e evidencia:

- `docs/ops/whatsapp-provider-final-selection-formal-phase-opening-final-selection-only-charter.md`
- `ops/evidence/latest/f5-00-provider-final-selection-formal-phase-opening-final-selection-only-charter-2026-07-15.md`
- `docs/EVIDENCE_INDEX.md`

Nenhuma alteracao foi planejada em workflows, `release.yml`, apps, packages, scripts, runtime, engine ou `ChatAgentLauncher`.

`git diff -- .github/workflows release.yml apps packages scripts` nao retornou saida, confirmando ausencia de alteracoes nessas superficies.

## Riscos residuais

- F5.0 nao seleciona provider e nao valida claims de um provider real.
- A selecao final depende de decisao futura separada, evidencias completas e approvals explicitos.
- Implementacao, execucao e producao dependem de fases posteriores separadas.
- F4.4 Selection No-Go permanece ativo.
- Provider integration permanece bloqueada.

## Proximos passos

- Manter provider final selection `not authorized`.
- Manter provider integration `blocked`.
- Usar F5.0 somente como charter final-selection-only.
- Exigir decisao futura separada antes de qualquer selecao final efetiva.
- Bloquear provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacoes, acao critica e side effects.

## Status final

Status: proposta/parcial evidenciada documentalmente.
