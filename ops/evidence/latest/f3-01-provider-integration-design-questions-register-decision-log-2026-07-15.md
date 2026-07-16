# F3.1 — Provider Integration Design Questions Register / Decision Log — 2026-07-15

## Resumo executivo

Foi criado o Design Questions Register / Decision Log da F3.1 para organizar perguntas e decisoes documentais da fase design-only de integracao futura hipotetica de provider WhatsApp.

F3.1 nao autoriza implementacao, execucao, producao, provider real, secret produtivo, webhook produtivo, mutacoes ou side effects. Provider integration permanece `blocked` e o Design-Only Charter F3.0 permanece ativo.

## Pré-condição F3.0

Pre-condicao comprovada antes das alteracoes:

- F3.0 mergeada em `main` no commit `7751005f49821f526b9f72d18d61de0dd14b12cb`.
- `origin/main` aponta para `7751005f49821f526b9f72d18d61de0dd14b12cb`.
- `CI Monorepo`: `completed success`, run `29516237523`.
- `IMOB Worker Mutation E2E`: `completed success`, run `29516237696`.

## Arquivos lidos

- `CODEX.md`
- `/home/jusall/.codex/attachments/3a3f8849-6c58-439a-9aac-ade0530ec7dd/pasted-text.txt`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/ops/whatsapp-provider-integration-formal-phase-opening-design-only-charter.md`
- `docs/ops/whatsapp-provider-integration-governance-closure-end-of-track-summary.md`
- `docs/ops/whatsapp-provider-integration-next-phase-charter-non-implementation-boundary.md`
- `docs/ops/whatsapp-provider-integration-stop-line-final-readiness-freeze.md`
- `ops/evidence/latest/f3-00-provider-integration-formal-phase-opening-design-only-charter-2026-07-15.md`

## Problema resolvido

F3.0 abriu a fase formal design-only, mas ainda faltava um artefato para registrar perguntas pendentes, estados de decisao e limites de uso das respostas de design.

F3.1 resolve essa lacuna com um register e um decision log documentais, sem transformar design em implementacao, execucao ou autorizacao produtiva.

## Design Questions Register

O register foi criado em `docs/ops/whatsapp-provider-integration-design-questions-register-decision-log.md`.

Ele define perguntas rastreaveis sobre provider futuro, assinatura, timestamp/replay, secret rotation, PII boundary, envelope, SLO, rollback/disable, owners e evidencia para eventual saida futura de design-only.

Cada pergunta exige owner minimo, status, evidencia requerida, boundary impact e blockers. Nenhuma resposta pode ser interpretada como aprovacao tecnica ou produtiva.

## Decision Log

O Decision Log registra decisoes de design vinculadas a perguntas por `questionId`.

As entradas iniciais mantem provider futuro nao selecionado, modelo de assinatura real nao aprovado, secret produtivo bloqueado e saida de design-only nao autorizada.

## Campos obrigatórios

- `questionId`
- `question`
- `context`
- `owner`
- `status`
- `options`
- `requiredEvidence`
- `boundaryImpact`
- `blockers`
- `decision`
- `decisionDate`
- `evidenceRefs`

## Decision states

- `open`
- `deferred`
- `answered-design-only`
- `blocked`
- `superseded`

Nenhum estado autoriza implementacao, execucao, producao, provider real, secret produtivo, webhook produtivo ou mutacao.

## Perguntas mínimas

- Provider futuro.
- Assinatura e verificacao de evento.
- Timestamp, replay e duplicidade.
- Secret rotation, revogacao e boundary por ambiente.
- PII/sensitive data boundary.
- Envelope e compatibilidade com contratos read-only.
- Observability, SLOs e thresholds.
- Rollback/disable.
- Owners, escalation e approvals.
- Evidencia necessaria para sair de design-only.

## ReasonCodes

- `DESIGN_QUESTION_REGISTER_ONLY`
- `DECISION_LOG_ONLY`
- `DECISION_LOG_INCOMPLETE`
- `DESIGN_DECISION_PENDING`
- `DESIGN_DECISION_NOT_IMPLEMENTATION_AUTHORIZATION`
- `PROVIDER_SELECTION_NOT_AUTHORIZED`
- `SECRET_DECISION_NOT_AUTHORIZED_FOR_USE`
- `WEBHOOK_DECISION_NOT_AUTHORIZED_FOR_PRODUCTION`
- `PROVIDER_IMPLEMENTATION_STILL_BLOCKED`

## Provider integration boundary

Provider integration permanece `blocked`. F3.1 nao cria provider real, nao usa secret produtivo, nao habilita webhook produtivo, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes, nao cria `lead.create`, nao cria `lead.discard` e nao executa acao critica.

## Design-only continuity

F3.1 preserva o Design-Only Charter F3.0.

F2.22 No-Go Ledger, F2.23 Final Readiness Freeze, F2.25 Non-Implementation Boundary e F2.26 governance baseline permanecem ativos. O register e o log servem apenas para continuidade documental de design.

## Não-autorização de implementação

F3.1 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine, launcher, workflow, app, package ou script.

## Não-autorização de execução

F3.1 nao autoriza execucao, integracao, configuracao, teste com provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, lead action, acao critica, provider external call, mutation external side effect ou `sideEffects != 0`.

## Não-autorização produtiva

F3.1 nao e autorizacao de producao. O Decision Log nao pode ser usado como approval de board, approval produtivo, autorizacao de integracao, permissao de provider real, permissao de secret produtivo ou permissao de webhook produtivo.

## Checks executados

- `pnpm check:evidence-index`: passou.
  - `ok: true`
  - `refsChecked: 569`
- `pnpm check:docs-link-integrity`: passou.
  - `ok: true`
  - `filesChecked: 15`
- `git diff --check`: passou sem saida.
- `git diff -- .github/workflows release.yml apps packages scripts`: passou sem saida.

## Prova de isolamento

Escopo documental restrito aos arquivos esperados:

- `docs/ops/whatsapp-provider-integration-design-questions-register-decision-log.md`
- `ops/evidence/latest/f3-01-provider-integration-design-questions-register-decision-log-2026-07-15.md`
- `docs/EVIDENCE_INDEX.md`

F3.1 nao altera `.github/workflows`, `release.yml`, `apps`, `packages`, `scripts`, runtime, engine ou `ChatAgentLauncher`.

## Riscos residuais

- F3.1 nao prova operacao de provider real.
- F3.1 nao seleciona provider futuro.
- F3.1 nao define assinatura real de provider.
- F3.1 nao provisiona secret produtivo.
- F3.1 nao substitui security review, privacy review, board approval ou decision record futuro.
- Provider integration permanece `blocked`.

## Próximos passos

- Manter perguntas de design rastreaveis por `questionId`.
- Registrar futuras respostas apenas como `answered-design-only`, quando houver evidencia documental suficiente.
- Exigir fase futura explicita para qualquer tentativa de sair de design-only.
- Preservar F2.22, F2.23, F2.25, F2.26 e F3.0 como controles ativos.

## Status final

Status: proposta/parcial evidenciada documentalmente.
