# F3.4 — Provider Integration Design Review Packet / Evidence Checklist — 2026-07-15

## Resumo executivo

Foi criado o Design Review Packet / Evidence Checklist da F3.4 para organizar reviewers, pre-read materials, checklist por categoria, acceptance states, blocking gaps, review outcomes e reasonCodes de uma futura revisao hipotetica de design de provider WhatsApp.

F3.4 nao autoriza selecao de provider, implementacao, execucao, producao, provider real, secret produtivo, webhook produtivo, mutacoes ou side effects. Provider integration permanece `blocked` e o Design-Only Charter F3.0 permanece ativo.

## Pré-condição F3.3

Pre-condicao comprovada antes das alteracoes:

- F3.3 mergeada em `main` no commit `c8a7b3d17465a5f73f3d6977fe7a06f5e38b4d3a`.
- `origin/main` aponta para `c8a7b3d17465a5f73f3d6977fe7a06f5e38b4d3a`.
- `CI Monorepo`: `completed success`, run `29520132383`.
- `IMOB Worker Mutation E2E`: `completed success`, run `29520132445`.

## Arquivos lidos

- `CODEX.md`
- `/home/jusall/.codex/attachments/32e74628-4e98-4307-9e3e-baa6c49cccb6/pasted-text.txt`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/ops/whatsapp-provider-integration-evidence-requirements-validation-plan.md`
- `docs/ops/whatsapp-provider-integration-decision-matrix-options-evaluation-criteria.md`
- `docs/ops/whatsapp-provider-integration-design-questions-register-decision-log.md`
- `docs/ops/whatsapp-provider-integration-formal-phase-opening-design-only-charter.md`
- `ops/evidence/latest/f3-03-provider-integration-evidence-requirements-validation-plan-2026-07-15.md`

## Problema resolvido

F3.3 definiu requisitos de evidencia e plano de validacao, mas ainda faltava um packet de revisao que organizasse reviewers, pre-read materials, checklist por categoria e outcomes permitidos.

F3.4 resolve essa lacuna sem transformar revisao de design em selecao de provider, implementacao, execucao ou autorizacao produtiva.

## Design Review Packet

O packet foi criado em `docs/ops/whatsapp-provider-integration-design-review-packet-evidence-checklist.md`.

Ele organiza os reviewers requeridos, os materiais de pre-read e os outcomes permitidos para uma revisao futura exclusivamente documental.

## Evidence Checklist

O checklist conecta categorias de revisao aos requisitos F3.3 e aos criterios F3.2.

Cada item exige `checklistItemId`, categoria, requirement, requiredEvidence, reviewer, status, blocker, evidenceRefs e decisionRefs. Qualquer ausencia mantem o item em `blocked`.

## Required reviewers

- Security
- Privacy/Compliance, se aplicavel
- Backend/API
- Platform governance
- Product/Platform
- DocOps
- Executive sponsor, se aplicavel

## Pre-read materials

- `docs/ops/whatsapp-provider-integration-formal-phase-opening-design-only-charter.md`
- `docs/ops/whatsapp-provider-integration-design-questions-register-decision-log.md`
- `docs/ops/whatsapp-provider-integration-decision-matrix-options-evaluation-criteria.md`
- `docs/ops/whatsapp-provider-integration-evidence-requirements-validation-plan.md`
- `ops/evidence/latest/f3-03-provider-integration-evidence-requirements-validation-plan-2026-07-15.md`
- `docs/EVIDENCE_INDEX.md`
- Baseline F2.22/F2.23/F2.25/F2.26 quando a revisao tocar hold, freeze, non-implementation boundary ou governance baseline.

## Checklist por categoria

- `security`
- `privacy/compliance`
- `contract compatibility`
- `signature/event verification`
- `replay/idempotency`
- `secret management`
- `observability/SLO`
- `rollback/disable`
- `tenant/workspace/scope safety`
- `PII/sensitive data handling`
- `operational support`
- `cost/commercial`

## Campos obrigatórios do checklist

- `checklistItemId`
- `category`
- `requirement`
- `requiredEvidence`
- `reviewer`
- `status`
- `blocker`
- `evidenceRefs`
- `decisionRefs`

## Acceptance states

- `not-started`
- `in-review`
- `accepted-for-design-review-only`
- `blocked`
- `rejected`

Nenhum acceptance state autoriza selecao de provider, implementacao, execucao, producao, secret produtivo, webhook produtivo, mutacao ou side effect.

## Blocking gaps

- Required reviewer ausente.
- Required evidence ausente.
- EvidenceRefs ausentes.
- DecisionRefs ausentes.
- Checklist item sem status.
- Blocker aberto.
- Security review ausente.
- Privacy/compliance review ausente quando aplicavel.
- Contract compatibility nao provada.
- Signature/event verification incompleta.
- Replay/idempotency nao provado.
- Secret management sem rotation, revocation, redaction ou environment boundary.
- Observability/SLO sem baseline, thresholds ou incident mapping.
- Rollback/disable ausente.
- Tenant/workspace/scope safety nao provada.
- PII/sensitive data handling nao provado.
- Operational support ou owner ausente.
- Cost/commercial risk sem owner quando aplicavel.
- Evidence Index ou docs link integrity falhando.
- Isolation diff indicando alteracoes em `.github/workflows`, `release.yml`, apps, packages ou scripts.
- Dependencia de provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, acao critica, provider external call, mutation external side effect ou `sideEffects != 0`.

## Review outcomes

- `no-go`
- `defer`
- `accepted-for-design-review-only`

Nenhum outcome autoriza selecao de provider, implementacao, execucao ou producao.

## ReasonCodes

- `DESIGN_REVIEW_PACKET_ONLY`
- `EVIDENCE_CHECKLIST_ONLY`
- `DESIGN_REVIEW_INCOMPLETE`
- `REQUIRED_REVIEWER_MISSING`
- `REQUIRED_EVIDENCE_MISSING`
- `DESIGN_REVIEW_NOT_PROVIDER_SELECTION`
- `DESIGN_REVIEW_NOT_IMPLEMENTATION_AUTHORIZATION`
- `DESIGN_REVIEW_NOT_PRODUCTION_AUTHORIZATION`
- `PROVIDER_IMPLEMENTATION_STILL_BLOCKED`

## Provider integration boundary

Provider integration permanece `blocked`. F3.4 nao cria provider real, nao seleciona provider, nao usa secret produtivo, nao habilita webhook produtivo, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes, nao cria `lead.create`, nao cria `lead.discard` e nao executa acao critica.

## Design-only continuity

F3.4 preserva o Design-Only Charter F3.0 e continua as cadeias F3.1, F3.2 e F3.3.

F2.22 No-Go Ledger, F2.23 Final Readiness Freeze, F2.25 Non-Implementation Boundary e F2.26 governance baseline permanecem ativos.

## Não-autorização de seleção de provider

F3.4 nao seleciona provider real. O packet e o checklist nao podem ser usados como decisao de selecao, procurement, contrato, configuracao ou integracao.

## Não-autorização de implementação

F3.4 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine, launcher, workflow, app, package ou script.

## Não-autorização de execução

F3.4 nao autoriza execucao, integracao, configuracao, teste com provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, lead action, acao critica, provider external call, mutation external side effect ou `sideEffects != 0`.

## Não-autorização produtiva

F3.4 nao e autorizacao de producao. Design Review Packet e Evidence Checklist nao autorizam WhatsApp operacional, provider integrado, provider selecionado, secret produtivo, webhook produtivo, mutacoes ou side effects.

## Checks executados

- `pnpm check:evidence-index`: passou.
  - `ok: true`
  - `refsChecked: 575`
- `pnpm check:docs-link-integrity`: passou.
  - `ok: true`
  - `filesChecked: 15`
- `git diff --check`: passou sem saida.
- `git diff -- .github/workflows release.yml apps packages scripts`: passou sem saida.

## Prova de isolamento

Escopo documental restrito aos arquivos esperados:

- `docs/ops/whatsapp-provider-integration-design-review-packet-evidence-checklist.md`
- `ops/evidence/latest/f3-04-provider-integration-design-review-packet-evidence-checklist-2026-07-15.md`
- `docs/EVIDENCE_INDEX.md`

F3.4 nao altera `.github/workflows`, `release.yml`, `apps`, `packages`, `scripts`, runtime, engine ou `ChatAgentLauncher`.

## Riscos residuais

- F3.4 nao prova operacao de provider real.
- F3.4 nao seleciona provider futuro.
- F3.4 nao substitui security review, privacy review, board approval ou decision record futuro.
- F3.4 nao cria metricas, dashboard, storage ou observability real de provider.
- Provider integration permanece `blocked`.

## Próximos passos

- Manter checklist futuro rastreavel por `checklistItemId`.
- Usar `accepted-for-design-review-only` apenas como estado e outcome documental.
- Exigir fase futura explicita para qualquer tentativa de selecao de provider.
- Preservar F2.22, F2.23, F2.25, F2.26, F3.0, F3.1, F3.2 e F3.3 como controles ativos.

## Status final

Status: proposta/parcial evidenciada documentalmente.
