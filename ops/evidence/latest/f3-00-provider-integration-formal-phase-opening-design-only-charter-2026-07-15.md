# F3.0 — Provider Integration Formal Phase Opening / Design-Only Charter — 2026-07-15

## Resumo executivo

Foi criada a Formal Phase Opening da F3 e o Design-Only Charter para uma avaliacao futura da integracao hipotetica de provider WhatsApp.

F3.0 nao autoriza implementacao, nao autoriza execucao, nao autoriza producao, mantem provider integration em `blocked`, preserva F2.23 freeze ativo, preserva F2.22 No-Go Ledger ativo, preserva F2.25 non-implementation boundary ativa e declara F2.26 como baseline de governanca pre-provider.

## Pré-condição F2.26

Pre-condicao comprovada antes das alteracoes:

- F2.26 mergeada em `main` no commit `dc1ac9c3cf398c9b22e54389f2f43770a24984a0`.
- `origin/main` aponta para `dc1ac9c3cf398c9b22e54389f2f43770a24984a0`.
- `CI Monorepo`: `completed success`, run `29515265188`.
- `IMOB Worker Mutation E2E`: `completed success`, run `29515265224`.

## Arquivos lidos

- `CODEX.md`
- `/home/jusall/.codex/attachments/93f3f381-63a1-4934-865f-47f922367cc1/pasted-text.txt`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/ops/whatsapp-provider-integration-governance-closure-end-of-track-summary.md`
- `docs/ops/whatsapp-provider-integration-next-phase-charter-non-implementation-boundary.md`
- `docs/ops/whatsapp-provider-integration-stop-line-final-readiness-freeze.md`
- `docs/ops/whatsapp-provider-integration-final-pre-execution-hold-no-go-ledger.md`
- `ops/evidence/latest/f2-26-provider-integration-governance-closure-end-of-track-summary-2026-07-15.md`

## Problema resolvido

F2.26 fechou a trilha F2 como governance closure / end-of-track summary. Ainda faltava uma abertura formal da F3 que preservasse a baseline F2.0-F2.26 e deixasse claro que a nova fase e apenas design-only.

F3.0 resolve essa lacuna sem levantar freeze, sem alterar No-Go Ledger, sem remover o non-implementation boundary e sem autorizar implementacao.

## Formal Phase Opening

A abertura formal da F3 foi criada em `docs/ops/whatsapp-provider-integration-formal-phase-opening-design-only-charter.md`.

Ela inicia apenas uma fase documental de design. Nao cria provider, nao cria webhook, nao provisiona secret, nao cria endpoint publico novo, nao cria mutacao e nao altera runtime.

## Design-Only Charter

O charter F3.0 limita a fase a perguntas de design, requisitos futuros, riscos, dependencias, owners, approvals, evidencias esperadas, boundaries e reasonCodes.

O charter nao e decision record produtivo, nao e approval de board para execucao e nao e autorizacao tecnica.

## Baseline F2.0-F2.26

| Marco | Papel na baseline |
| --- | --- |
| F2.0 | Design read-only, binding e fail-closed. |
| F2.1 | Contrato tecnico, envelope e assinatura. |
| F2.2 | Especificacao de endpoint/webhook futuro. |
| F2.3 | Handler read-only controlado. |
| F2.3a | Registro canonico de teste. |
| F2.4 | ChannelBinding e Replay Guard. |
| F2.5 | Hardening e matriz negativa. |
| F2.6 | Evidence bundle sanitizado. |
| F2.7 | Bundle export contract. |
| F2.8 | Contract freeze e compatibility gate. |
| F2.9 | Runbook e rollback policy. |
| F2.10 | Observability e SLO baseline. |
| F2.11 | Synthetic healthcheck non-provider. |
| F2.12 | Synthetic healthcheck contract gate. |
| F2.13 | Promotion readiness matrix. |
| F2.14 | Promotion decision record template. |
| F2.15 | Evidence closure e pre-provider boundary. |
| F2.16 | Gap register e entry criteria. |
| F2.17 | Design brief e non-execution plan. |
| F2.18 | Threat model e abuse case register. |
| F2.19 | Security review checklist e approval gate. |
| F2.20 | Evidence pack e executive review dossier. |
| F2.21 | Board review packet e meeting agenda. |
| F2.22 | Final pre-execution hold e No-Go Ledger. |
| F2.23 | Stop-line e final readiness freeze. |
| F2.24 | Phase transition proposal e board decision stub. |
| F2.25 | Next-phase charter e non-implementation boundary. |
| F2.26 | Governance closure e end-of-track summary. |

## F3 design-only scope

- Consolidar perguntas de design de provider.
- Mapear dependencias futuras sem executar.
- Preparar criterios de revisao futura.
- Organizar owners e approvals requeridos.
- Listar evidencias futuras minimas.
- Revisar gaps F2.16 como bloqueadores.
- Manter F2.22, F2.23, F2.25 e F2.26 como controles ativos.
- Propor artefatos documentais futuros sem implementacao.

## Out-of-scope

- Provider WhatsApp real.
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
- Mudancas em `ChatAgentLauncher`, runtime, engine, workflows, `release.yml`, apps, packages ou scripts para provider.
- Declarar WhatsApp operacional.
- Declarar provider integrado.
- Declarar F3.0 como autorizacao de implementacao.

## Entry criteria

- F2.26 mergeada em `main` com CI pos-merge verde.
- F2.0-F2.26 indexadas em `docs/EVIDENCE_INDEX.md`.
- F2.26 tratada como baseline de governanca pre-provider.
- F2.23 Final Readiness Freeze ativo.
- F2.22 No-Go Ledger ativo.
- F2.25 Explicit Non-Implementation Boundary ativa.
- Provider integration `blocked`.
- Escopo F3.0 exclui implementacao, execucao e producao.
- Blocked implementation actions preservadas.
- Checks documentais obrigatorios verdes.

## Exit criteria

- Design-only charter fisicamente documentado.
- Evidencia F3.0 fisica e indexada.
- F2.26 permanece baseline pre-provider.
- F2.22, F2.23 e F2.25 permanecem ativos.
- Provider integration permanece `blocked`.
- Ausencia de provider real, secret produtivo, webhook produtivo, mutacoes e side effects documentada.
- Checks obrigatorios passam.
- Diff de isolamento confirma ausencia de alteracoes em workflows, `release.yml`, apps, packages e scripts.
- Status final permanece `proposta/parcial evidenciada documentalmente`.

## Required approvals

- Board/executive sponsor.
- Security.
- Privacy/Compliance, se aplicavel.
- Platform governance.
- Backend/API.
- Product/Platform.
- DocOps.

F3.0 nao concede approvals; apenas registra que approvals futuros sao obrigatorios para qualquer fase posterior.

## Required evidence

- F2.0-F2.26 no Evidence Index.
- Evidencia F2.26 como baseline de governanca pre-provider.
- Prova de F2.23 freeze ativo.
- Prova de F2.22 No-Go Ledger ativo.
- Prova de F2.25 non-implementation boundary ativo.
- Documento F3.0 design-only.
- Evidencia F3.0 fisica e indexavel.
- Checks obrigatorios verdes.
- Prova de isolamento das superficies proibidas.
- Confirmacao de ausencia de provider real, secret produtivo, webhook produtivo, mutacoes e side effects.

## Blocked implementation actions

- Provider WhatsApp real.
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

## Governance gates

- Precondition gate F2.26.
- Evidence Index gate.
- Docs link integrity gate.
- Isolation diff gate.
- F2.22 No-Go Ledger continuity gate.
- F2.23 freeze continuity gate.
- F2.25 non-implementation boundary gate.
- Provider integration blocked gate.
- SideEffects zero gate.
- No production authorization gate.

## ReasonCodes

- `F3_FORMAL_PHASE_OPENING_ONLY`
- `F3_DESIGN_ONLY_CHARTER_ACTIVE`
- `DESIGN_ONLY_PHASE_NOT_IMPLEMENTATION_AUTHORIZATION`
- `PROVIDER_IMPLEMENTATION_STILL_BLOCKED`
- `PRODUCTIVE_SECRET_STILL_BLOCKED`
- `PRODUCTION_WEBHOOK_STILL_BLOCKED`
- `MUTATION_STILL_BLOCKED`
- `F2_FREEZE_REMAINS_ACTIVE`
- `F2_NON_IMPLEMENTATION_BOUNDARY_REMAINS_ACTIVE`

## Provider integration boundary

Provider integration permanece `blocked`. F3.0 nao cria provider real, nao usa secret produtivo, nao habilita webhook produtivo, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes, nao cria `lead.create`, nao cria `lead.discard` e nao executa acao critica.

## Freeze continuity

F2.23 Final Readiness Freeze permanece ativo. F3.0 nao levanta freeze, nao levanta execution hold e nao altera o No-Go Ledger.

## Non-implementation boundary

F2.25 Explicit Non-Implementation Boundary permanece ativa. F3.0 nao autoriza implementacao direta ou indireta de provider, runtime, engine, launcher, workflows, apps, packages ou scripts.

## Não-autorização de implementação

F3.0 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine ou workflow.

## Não-autorização de execução

F3.0 nao autoriza execucao, integracao, configuracao, teste com provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, lead action, acao critica ou side effect.

## Não-autorização produtiva

F3.0 nao e autorizacao de producao. A fase e design-only e preserva provider integration `blocked`.

## Checks executados

- `pnpm check:evidence-index`: passou.
  - `ok: true`
  - `refsChecked: 567`
- `pnpm check:docs-link-integrity`: passou.
  - `ok: true`
  - `filesChecked: 15`
- `git diff --check`: passou sem saida.
- `git diff -- .github/workflows release.yml apps packages scripts`: passou sem saida.

## Prova de isolamento

Escopo documental restrito aos arquivos esperados:

- `docs/ops/whatsapp-provider-integration-formal-phase-opening-design-only-charter.md`
- `ops/evidence/latest/f3-00-provider-integration-formal-phase-opening-design-only-charter-2026-07-15.md`
- `docs/EVIDENCE_INDEX.md`

O diff de isolamento confirmou ausencia de alteracoes em `.github/workflows`, `release.yml`, `apps`, `packages` ou `scripts`.

## Riscos residuais

- F3.0 nao prova operacao de provider real.
- F3.0 nao substitui fase futura de implementacao, se algum dia for autorizada.
- F2.23 freeze permanece ativo.
- F2.22 No-Go Ledger permanece ativo.
- F2.25 non-implementation boundary permanece ativo.
- Gaps F2.16 permanecem bloqueadores ate evidencia futura.

## Próximos passos

- Manter provider integration em `blocked`.
- Usar F3.0 apenas como abertura formal de fase design-only.

## Status final

Status: proposta/parcial evidenciada documentalmente.
