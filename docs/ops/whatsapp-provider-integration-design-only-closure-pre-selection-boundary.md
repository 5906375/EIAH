# WhatsApp Provider Integration — Design-Only Closure / Pre-Selection Boundary

## Objetivo

Este documento cria a Design-Only Closure e o Pre-Selection Boundary da F3.6 para consolidar F3.0-F3.5 da avaliacao futura hipotetica de provider WhatsApp.

F3.6 e um artefato documental. Ele nao autoriza selecao de provider, nao autoriza implementacao, nao autoriza execucao, nao autoriza producao, nao seleciona provider real, nao integra provider WhatsApp real, nao provisiona secret produtivo, nao habilita webhook produtivo, nao cria mutacoes e nao altera o estado `provider integration blocked`.

## Design-Only Closure

A Design-Only Closure consolida a cadeia F3.0-F3.5 como pacote documental de design e revisao, sem converter qualquer artefato em autorizacao de selecao, implementacao, execucao ou producao.

O fechamento registra que a fase possui:

- charter design-only;
- register de perguntas e decision log documental;
- matriz de decisao e criterios de avaliacao de opcoes;
- requisitos de evidencia e plano de validacao;
- design review packet e evidence checklist;
- review outcome template e No-Go Decision Record;
- evidencias fisicas e indexaveis em `docs/EVIDENCE_INDEX.md`;
- boundaries ativos herdados de F2.22, F2.23, F2.25, F2.26 e F3.0-F3.5.

O status correto da cadeia F3.0-F3.5 e `proposta/parcial evidenciada documentalmente`. Ela permanece design-only e pre-selection.

## Pre-Selection Boundary

O Pre-Selection Boundary declara que provider selection permanece `not authorized`.

Nenhum milestone F3.0-F3.6 pode ser usado como selecao de provider, procurement, contrato, configuracao, integracao, teste com provider real, uso de secret produtivo, webhook produtivo, endpoint publico novo, mutacao, acao critica, provider external call, mutation external side effect ou permissao para `sideEffects != 0`.

Qualquer futura fase de selecao exigira fase separada, pre-condicao propria, escopo proprio, approvals explicitos, evidencias novas, checks verdes, prova de isolamento e decisao humana governada.

## Milestones F3.0-F3.5

| Marco | Papel na cadeia design-only |
| --- | --- |
| F3.0 | Formal Phase Opening / Design-Only Charter. |
| F3.1 | Design Questions Register / Decision Log. |
| F3.2 | Decision Matrix / Options Evaluation Criteria. |
| F3.3 | Evidence Requirements / Validation Plan. |
| F3.4 | Design Review Packet / Evidence Checklist. |
| F3.5 | Review Outcome Template / No-Go Decision Record. |

## Evidencias fisicas/indexaveis F3.0-F3.5

As evidencias F3.0-F3.5 devem permanecer fisicamente disponiveis e indexadas:

- `ops/evidence/latest/f3-00-provider-integration-formal-phase-opening-design-only-charter-2026-07-15.md`
- `ops/evidence/latest/f3-01-provider-integration-design-questions-register-decision-log-2026-07-15.md`
- `ops/evidence/latest/f3-02-provider-integration-decision-matrix-options-evaluation-criteria-2026-07-15.md`
- `ops/evidence/latest/f3-03-provider-integration-evidence-requirements-validation-plan-2026-07-15.md`
- `ops/evidence/latest/f3-04-provider-integration-design-review-packet-evidence-checklist-2026-07-15.md`
- `ops/evidence/latest/f3-05-provider-integration-review-outcome-template-no-go-decision-record-2026-07-15.md`

## Status final design-only

- `design-only closure documented`
- `pre-selection boundary active`
- `provider integration blocked`
- `provider selection not authorized`
- `F3.0 design-only charter active`
- `F3.5 No-Go Decision Record active`
- `non-operational`
- `proposta/parcial evidenciada documentalmente`

## Boundaries ativos

- Design-only boundary.
- Pre-selection boundary.
- Provider selection boundary.
- Provider integration boundary.
- Secret boundary.
- Production webhook boundary.
- Endpoint boundary.
- Mutation boundary.
- Critical action boundary.
- PII/sensitive data boundary.
- No-Go Decision Record continuity.
- F2.22 No-Go Ledger continuity.
- F2.23 Final Readiness Freeze continuity.
- F2.25 Non-Implementation Boundary continuity.
- F2.26 governance baseline continuity.

## Itens bloqueados

- Provider real.
- Provider selection.
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

## Condicoes para futura fase de selecao

Uma futura fase de selecao so pode ser considerada se houver, no minimo:

- nova fase formal explicitamente aberta;
- pre-condicao propria comprovada em `main`;
- escopo que autorize apenas avaliacao de selecao, se aplicavel;
- approvals de Security, Privacy/Compliance se aplicavel, Backend/API, Platform governance, Product/Platform, DocOps e Executive sponsor se aplicavel;
- required evidence refs F3.0-F3.6 e baseline F2.22/F2.23/F2.25/F2.26;
- decision record novo e completo;
- risk, security, privacy e operational posture documentadas;
- provider boundary preservado ate decisao explicita;
- checks documentais verdes;
- prova de isolamento sem alteracoes proibidas;
- declaracao explicita de que selecao futura ainda nao equivale a implementacao, execucao ou producao.

## Prohibited actions

- Declarar WhatsApp operacional.
- Declarar provider selecionado.
- Declarar provider integrado.
- Usar F3.6 como autorizacao de selecao.
- Usar F3.6 como autorizacao de implementacao.
- Usar F3.6 como autorizacao de execucao.
- Usar F3.6 como autorizacao produtiva.
- Selecionar provider real.
- Integrar provider WhatsApp real.
- Usar, solicitar, armazenar ou provisionar secret produtivo.
- Habilitar webhook produtivo.
- Criar endpoint publico novo.
- Criar dashboard, storage ou ledger produtivo obrigatorio.
- Criar mutacoes, `lead.create`, `lead.discard` ou acao critica.
- Fazer provider external call.
- Gerar mutation external side effect.
- Permitir `sideEffects != 0`.
- Alterar `ChatAgentLauncher`, runtime, engine, workflows, `release.yml`, apps, packages ou scripts para cruzar boundaries.

## ReasonCodes

- `DESIGN_ONLY_CLOSURE_ONLY`
- `PRE_SELECTION_BOUNDARY_ACTIVE`
- `PROVIDER_SELECTION_STILL_BLOCKED`
- `PROVIDER_INTEGRATION_STILL_BLOCKED`
- `IMPLEMENTATION_NOT_AUTHORIZED`
- `EXECUTION_NOT_AUTHORIZED`
- `PRODUCTION_NOT_AUTHORIZED`
- `NO_GO_DECISION_REMAINS_ACTIVE`
- `NEW_SELECTION_PHASE_REQUIRED`

## Provider integration boundary

Provider integration permanece `blocked`. F3.6 nao cria provider, nao integra provider real, nao cria webhook, nao provisiona secret, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes e nao executa acao critica.

## Provider selection boundary

Provider selection permanece `not authorized`. F3.6 nao seleciona provider, nao recomenda provider, nao aprova provider, nao cria procurement, nao cria contrato, nao cria configuracao e nao permite interpretar F3.0-F3.6 como selecao implicita.

## Design-only continuity

F3.0 Design-Only Charter permanece ativo como boundary. F3.6 fecha documentalmente a cadeia F3.0-F3.5 para o estado pre-selection, mas nao encerra os controles que mantem a fase sem implementacao e sem execucao.

## No-Go continuity

F3.5 No-Go Decision Record permanece ativo. Qualquer tentativa de selecao, implementacao, execucao, producao, provider real, secret produtivo, webhook produtivo, mutacao, acao critica ou side effect deve permanecer bloqueada ate nova fase formal e decisao explicita.

## Nao-autorizacao de selecao de provider

F3.6 nao autoriza selecao de provider. A closure e o pre-selection boundary apenas documentam que a cadeia F3.0-F3.5 esta consolidada e que provider selection permanece bloqueada.

## Nao-autorizacao de implementacao

F3.6 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine, launcher, workflow, app, package ou script.

## Nao-autorizacao de execucao

F3.6 nao autoriza execucao, configuracao, teste com provider real, provider external call, mutation external side effect, uso de secret produtivo, webhook produtivo, mutacao, lead action, acao critica ou `sideEffects != 0`.

## Nao-autorizacao produtiva

F3.6 nao e autorizacao de producao. Design-only closure, pre-selection boundary, evidence index, review outcome ou No-Go Decision Record nao podem ser tratados como permissao para operar WhatsApp, selecionar provider, integrar provider, provisionar secret produtivo, habilitar webhook produtivo ou executar mutacoes.

## Status final

Status: proposta/parcial evidenciada documentalmente.
