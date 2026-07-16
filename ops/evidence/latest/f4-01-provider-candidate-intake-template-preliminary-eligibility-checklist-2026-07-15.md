# F4.1 — Provider Candidate Intake Template / Preliminary Eligibility Checklist — 2026-07-15

## Resumo executivo

Foi criado o Provider Candidate Intake Template / Preliminary Eligibility Checklist da F4.1 para organizar informacoes e elegibilidade preliminar de candidatos hipoteticos a provider WhatsApp em modo selection-only.

F4.1 nao autoriza selecao final de provider, implementacao, execucao, producao, provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacoes ou side effects. Provider integration permanece `blocked`, provider final selection permanece `not authorized` e F4.0 Selection-Only Charter permanece ativo.

## Pré-condição F4.0

Pre-condicao comprovada antes das alteracoes:

- F4.0 mergeada em `main` no commit `44e3bdbf3dbd4d1df3d3d7c22a8f7789b3db3c53`.
- `origin/main` aponta para `44e3bdbf3dbd4d1df3d3d7c22a8f7789b3db3c53`.
- `CI Monorepo`: `completed success`, run `29530394177`.
- `IMOB Worker Mutation E2E`: `completed success`, run `29530394256`.

## Arquivos lidos

- `CODEX.md`
- `/home/jusall/.codex/attachments/ac082bf2-020c-4708-b543-1fd60146d05e/pasted-text.txt`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/ops/whatsapp-provider-selection-formal-phase-opening-selection-only-charter.md`
- `docs/ops/whatsapp-provider-integration-design-only-closure-pre-selection-boundary.md`
- `docs/ops/whatsapp-provider-integration-review-outcome-template-no-go-decision-record.md`
- `docs/ops/whatsapp-provider-integration-governance-closure-end-of-track-summary.md`
- `ops/evidence/latest/f4-00-provider-selection-formal-phase-opening-selection-only-charter-2026-07-15.md`

## Problema resolvido

F4.0 abriu a fase selection-only, mas ainda faltava um template padronizado para intake de candidatos e um checklist preliminar para avaliar elegibilidade documental por categoria.

F4.1 resolve essa lacuna sem selecionar provider e sem relaxar os bloqueios de provider integration.

## Provider Candidate Intake Template

O template foi criado em `docs/ops/whatsapp-provider-candidate-intake-template-preliminary-eligibility-checklist.md`.

Ele padroniza os campos obrigatorios de um candidato hipotetico, incluindo contatos, capacidades, security, privacy, SLO, rollback, observability, tenant/workspace/scope, evidencias e owner.

## Preliminary Eligibility Checklist

O checklist preliminar organiza a avaliacao documental por categoria. O resultado maximo permitido e `eligible-for-selection-review-only`, sem selecao final.

## Campos obrigatórios do candidato

- `candidateId`
- `providerName`
- `providerType`
- `officialWebsite`
- `jurisdiction`
- `commercialContact`
- `technicalContact`
- `securityContact`
- `supportedAPIs`
- `webhookCapabilities`
- `signatureVerification`
- `replayProtection`
- `idempotencySupport`
- `secretManagementModel`
- `dataResidency`
- `PIIHandling`
- `complianceClaims`
- `SLOClaims`
- `rollbackDisableSupport`
- `observabilitySupport`
- `tenantWorkspaceScopeSupport`
- `knownLimitations`
- `requiredEvidenceRefs`
- `intakeOwner`
- `reviewStatus`

## Checklist por categoria

- `security`
- `privacy/compliance`
- `contract compatibility`
- `webhook/event model`
- `replay/idempotency`
- `secret management`
- `observability/SLO`
- `rollback/disable`
- `tenant/workspace/scope safety`
- `PII/sensitive data handling`
- `operational support`
- `commercial/cost`

## Status de intake

- `not-submitted`
- `incomplete`
- `in-review`
- `blocked`
- `eligible-for-selection-review-only`
- `rejected`

Nenhum status autoriza selecao final, implementacao, execucao, producao, provider real, secret produtivo, webhook produtivo, mutacao ou side effect.

## Gates preliminares

- Campos obrigatorios ausentes bloqueiam o intake.
- `intakeOwner` ausente bloqueia o intake.
- `requiredEvidenceRefs` ausentes bloqueiam o intake.
- Contacts commercial, technical ou security ausentes bloqueiam o intake.
- Official website ou jurisdiction ausente bloqueia o intake.
- Signature verification nao documentada bloqueia o intake.
- Replay protection ou idempotency support nao documentado bloqueia o intake.
- Secret management model ausente bloqueia o intake.
- PII handling ou privacy/compliance claims ausentes bloqueiam o intake.
- Rollback/disable support ausente bloqueia o intake.
- Observability/SLO support ausente bloqueia o intake.
- Tenant/workspace/scope support ausente bloqueia o intake.
- Contract compatibility ausente bloqueia o intake.
- Evidence Index, docs link integrity ou isolation diff falhando bloqueiam o intake.
- Qualquer dependencia de provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, acao critica, provider external call, mutation external side effect ou `sideEffects != 0` bloqueia o intake.

## ReasonCodes

- `CANDIDATE_INTAKE_TEMPLATE_ONLY`
- `PRELIMINARY_ELIGIBILITY_CHECKLIST_ONLY`
- `CANDIDATE_INTAKE_INCOMPLETE`
- `CANDIDATE_EVIDENCE_MISSING`
- `CANDIDATE_OWNER_MISSING`
- `CANDIDATE_SECURITY_GAP`
- `CANDIDATE_PRIVACY_GAP`
- `CANDIDATE_ROLLBACK_GAP`
- `CANDIDATE_ELIGIBILITY_NOT_PROVIDER_SELECTION`
- `PROVIDER_FINAL_SELECTION_NOT_AUTHORIZED`

## Provider selection boundary

Provider final selection permanece `not authorized`. F4.1 nao seleciona provider, nao recomenda provider como final, nao aprova procurement, nao cria contrato, nao cria configuracao e nao permite interpretar intake ou preliminary eligibility como selecao implicita.

## Provider integration boundary

Provider integration permanece `blocked`. F4.1 nao cria provider, nao integra provider real, nao cria webhook, nao provisiona secret, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes e nao executa acao critica.

## Selection-only continuity

F4.0 Selection-Only Charter permanece ativo. F4.1 preserva F3.6 pre-selection boundary, F3.5 No-Go Decision Record e F2.26 governance closure como controles ativos.

## Não-autorização de seleção final de provider

F4.1 nao autoriza selecao final de provider. O intake e o checklist apenas organizam informacoes e elegibilidade preliminar documental.

## Não-autorização de implementação

F4.1 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine, launcher, workflow, app, package ou script.

## Não-autorização de execução

F4.1 nao autoriza execucao, configuracao, teste com provider real, provider external call, mutation external side effect, uso de secret produtivo, webhook produtivo, mutacao, lead action, acao critica ou `sideEffects != 0`.

## Não-autorização produtiva

F4.1 nao e autorizacao de producao. Candidate intake, preliminary eligibility checklist, F4.0 charter, F3.6 boundary ou F3.5 No-Go Decision Record nao podem ser tratados como permissao para operar WhatsApp, selecionar provider final, integrar provider, provisionar secret produtivo, habilitar webhook produtivo ou executar mutacoes.

## Checks executados

- `pnpm check:evidence-index`: passou (`ok: true`, `refsChecked: 583`).
- `pnpm check:docs-link-integrity`: passou (`ok: true`, `filesChecked: 15`).
- `git diff --check`: passou sem saida.
- `git diff -- .github/workflows release.yml apps packages scripts`: passou sem saida.

## Prova de isolamento

Alteracoes planejadas apenas em documentacao operacional e evidencia:

- `docs/ops/whatsapp-provider-candidate-intake-template-preliminary-eligibility-checklist.md`
- `ops/evidence/latest/f4-01-provider-candidate-intake-template-preliminary-eligibility-checklist-2026-07-15.md`
- `docs/EVIDENCE_INDEX.md`

`git diff -- .github/workflows release.yml apps packages scripts` nao retornou saida. Nenhuma alteracao foi feita em workflows, `release.yml`, apps, packages, scripts, runtime, engine ou `ChatAgentLauncher`.

## Riscos residuais

- F4.1 nao seleciona provider e nao valida claims de um provider real.
- Eligibility preliminar depende de evidencias futuras por candidato.
- Provider integration permanece bloqueada e a cadeia permanece documental.

## Próximos passos

- Manter provider final selection `not authorized`.
- Manter provider integration `blocked`.
- Usar F4.1 somente para intake selection-only documental.
- Exigir evidencia e owner antes de qualquer status `eligible-for-selection-review-only`.
- Bloquear provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacoes, acao critica e side effects.

## Status final

Status: proposta/parcial evidenciada documentalmente.
