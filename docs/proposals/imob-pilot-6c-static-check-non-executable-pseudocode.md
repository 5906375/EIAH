# IMOB-PILOT-6C - Static Check Non-Executable Pseudocode

Status: parcial/evidenciado localmente; aguardando PR/CI remoto.

## Resumo

Este documento registra pseudocodigo nao executavel para uma checagem estatica futura do IMOB shadow dry-run harness. Ele transforma o desenho da IMOB-PILOT-6B em fluxo textual, sem criar script, pacote, CI, teste, endpoint, provider, escrita de banco, ledger, auditoria, receipt, bundle ou proof.

A IMOB-PILOT-6C nao executa shadow, dry-run, pilot ou small rollout. Ela nao autoriza preview frontend, nao altera `ChatAgentLauncher`, runtime, engine, API ou contratos, nao atualiza o Evidence Index e nao declara Receipt Canon fechado nem IMOB operacionalmente fechado.

## Pre-condicao registrada

- IMOB-PILOT-6B mergeada em `main`: `b408a3efec6fb1082b57e3c0c12e286352381c7a`.
- CI Monorepo: run `29641148640`, `completed success`.
- IMOB Worker Mutation E2E: run `29641148630`, `completed success`.
- Worktree limpa antes das alteracoes locais.

## Fontes lidas

- `CODEX.md`
- `IA_EIAH.md`
- `AGENTS.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/proposals/imob-pilot-0-shadow-readiness-checklist.md`
- `docs/proposals/imob-pilot-1-shadow-dry-run-evidence-plan.md`
- `docs/proposals/imob-pilot-2-dry-run-fixture-pack-evidence-template.md`
- `docs/proposals/imob-pilot-3-shadow-dry-run-harness-plan.md`
- `docs/proposals/imob-pilot-4-non-operational-dry-run-harness-spec.md`
- `docs/proposals/imob-pilot-5-non-operational-harness-skeleton.md`
- `docs/proposals/imob-pilot-6a-static-harness-contract-check.md`
- `docs/proposals/imob-pilot-6b-static-check-implementation-design.md`
- `ops/evidence/templates/imob-pilot-2-shadow-dry-run-evidence-template.md`
- `apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json`
- `contracts/chat/chat.vertical_handoff.v1.schema.json`
- `contracts/chat/hitl.gate_state.v1.schema.json`
- `contracts/chat/proof_receipt_bundle_state.v1.schema.json`
- `apps/api/src/services/chatVerticalHandoffSnapshot.ts`
- `apps/api/src/services/chatGateProofAdapters.ts`
- `apps/web/src/components/chat/ChatVerticalHandoffSurface.tsx`
- `package.json`
- `.github/workflows/ci.yml`

## Estado atual observado

- A cadeia IMOB-PILOT-0 a IMOB-PILOT-6B permanece documental e nao operacional.
- A fixture IMOB-PILOT-2 declara dados sinteticos, sanitizados, `sideEffects=0`, `providerExternalCall=0`, `mutationExternalSideEffect=0`, `dbWrite=0`, `ledgerWrite=0`, `auditWrite=0`, `receiptGenerated=0`, `bundleGenerated=0` e `proofGenerated=0`.
- Os contratos fisicos de handoff, HITL gate e proof receipt bundle state existem em `contracts/chat`.
- A superficie `ChatVerticalHandoffSurface` renderiza snapshots read-only e nao deve receber regras cognitivas ou decisorias.
- A IMOB-PILOT-6A definiu um check estatico conceitual; a IMOB-PILOT-6B definiu componentes de implementacao futura sem executar a implementacao.

## Objetivo do pseudocodigo

O pseudocodigo abaixo descreve como uma checagem estatica futura poderia avaliar consistencia documental entre plano, spec, skeleton, fixture, template, contratos e limites arquiteturais antes de qualquer etapa operacional.

Este conteudo e intencionalmente nao importavel, nao compilavel e nao executavel. Os blocos usam formato `text` e linguagem descritiva para evitar ambiguidade com codigo de producao.

## Main flow futuro pseudocode

```text
NON_EXECUTABLE main static check flow:

receive conceptual StaticCheckInput
set productionAuthorization to false
set executionAuthorization to false
set dryRunAuthorization to false
set shadowAuthorization to false

references = ReferenceLoader.loadRequiredReferences(input.requiredReferencePaths)
if references has missing files:
  return failClosed("REFERENCE_MISSING", references.missing)

referenceValidation = ReferenceLoader.validateReferenceIntegrity(references)
if referenceValidation has broken links or unreadable required references:
  return failClosed("REFERENCE_INVALID", referenceValidation.failures)

metricsValidation = RequiredMetricsValidator.validate(references)
if metricsValidation is not complete:
  return failClosed("IMOB_STATIC_CHECK_REQUIRED_METRIC_MISSING", metricsValidation.failures)

reasonCodeValidation = ReasonCodeValidator.validate(references)
if reasonCodeValidation is not complete:
  return failClosed("IMOB_STATIC_CHECK_REASON_CODE_MISSING", reasonCodeValidation.failures)

noGoValidation = NoGoCriteriaValidator.validate(references)
if noGoValidation cannot prove No-Go or go-for-next-review-only language:
  return failClosed("IMOB_STATIC_CHECK_NO_GO_CRITERIA_MISSING", noGoValidation.failures)

boundaryValidation = BoundaryValidator.validate(references)
if boundaryValidation finds provider, DB, ledger, audit, receipt, bundle, proof, API, runtime, engine, frontend preview, or ChatAgentLauncher execution in scope:
  return failClosed("IMOB_STATIC_CHECK_BOUNDARY_VIOLATION", boundaryValidation.failures)

productiveLanguageValidation = ProductiveLanguageDetector.scan(references)
if productiveLanguageValidation finds productive authorization language:
  return failClosed("IMOB_STATIC_CHECK_PRODUCTIVE_LANGUAGE_FORBIDDEN", productiveLanguageValidation.failures)

driftValidation = SpecSkeletonDriftDetector.compare(references)
if driftValidation finds required spec rule absent from skeleton/design:
  return failClosed("IMOB_STATIC_CHECK_SPEC_SKELETON_DRIFT", driftValidation.failures)

reportDraft = FutureReportEmitter.composeLocalReport(
  references,
  metricsValidation,
  reasonCodeValidation,
  noGoValidation,
  boundaryValidation,
  productiveLanguageValidation,
  driftValidation
)

return completeStaticCheckResult(
  decision = "GO_FOR_NEXT_REVIEW_ONLY",
  productionAuthorization = false,
  executionAuthorization = false,
  reportDraft = reportDraft
)
```

## Modulos conceituais

| Modulo conceitual | Responsabilidade futura | Saida esperada |
| --- | --- | --- |
| `ReferenceLoader` | Ler somente caminhos obrigatorios aprovados e verificar existencia, legibilidade e escopo documental. | Lista de referencias, ausencias e falhas de leitura. |
| `RequiredMetricsValidator` | Confirmar que metricas obrigatorias estao declaradas com expectativa correta. | Falhas por metrica ausente, divergente ou ambigua. |
| `ReasonCodeValidator` | Confirmar reasonCodes herdados e especificos da checagem estatica. | Falhas por reasonCode ausente ou incompatibilidade de uso. |
| `NoGoCriteriaValidator` | Confirmar que estados de saida continuam `NO_GO` ou `GO_FOR_NEXT_REVIEW_ONLY`. | Falhas quando houver linguagem de autorizacao operacional/produtiva. |
| `BoundaryValidator` | Confirmar limites contra provider, mutacao, DB, ledger, audit, receipt, bundle, proof, frontend preview e ChatAgentLauncher. | Achados de boundary violation. |
| `ProductiveLanguageDetector` | Procurar termos que declarem producao, execucao, fechamento operacional ou Receipt Canon fechado. | Achados de linguagem proibida. |
| `SpecSkeletonDriftDetector` | Comparar IMOB-PILOT-4, IMOB-PILOT-5, IMOB-PILOT-6A e IMOB-PILOT-6B. | Achados de drift entre spec, skeleton e desenho futuro. |
| `FutureReportEmitter` | Montar um relatorio local futuro, sem Evidence Index automatico. | `ReportDraft` conceitual, nao evidencia executada. |

## ReferenceLoader pseudocode

```text
NON_EXECUTABLE ReferenceLoader:

input: list of approved relative repository paths
for each path:
  if path is outside repository:
    add failure "REFERENCE_OUT_OF_SCOPE"
  if path points to workflow/runtime/API/frontend implementation for mutation:
    add failure "REFERENCE_SCOPE_FORBIDDEN"
  if file does not exist:
    add failure "REFERENCE_MISSING"
  if file cannot be read:
    add failure "REFERENCE_UNREADABLE"
return references and failures
```

## RequiredMetricsValidator pseudocode

```text
NON_EXECUTABLE RequiredMetricsValidator:

required metrics must include:
  handoffSnapshotBuilt
  handoffSnapshotValidationFailures
  hitlGateStateBuilt
  proofReceiptBundleStateBuilt
  renderSurfaceSerialized
  sideEffects
  providerExternalCall
  mutationExternalSideEffect
  dbWrite
  ledgerWrite
  auditWrite
  receiptGenerated
  bundleGenerated
  proofGenerated
  proofFabricatedInFrontend
  frontendPolicyDecision
  chatLauncherBusinessRule
  criticalActionExecuted
  criticalActionWithoutHITL
  piiLeakageDetected
  missingReasonCode
  checksumMismatch

for each required metric:
  if missing from fixture, template, spec, skeleton, 6A, or 6B where expected:
    add failure "IMOB_STATIC_CHECK_REQUIRED_METRIC_MISSING"
  if side-effect metric expected value is not zero:
    add failure "IMOB_STATIC_CHECK_SIDE_EFFECT_ZERO_NOT_PROVEN"
return metric validation result
```

## ReasonCodeValidator pseudocode

```text
NON_EXECUTABLE ReasonCodeValidator:

required reasonCodes must include:
  IMOB_PILOT_2_FIXTURE_PACK_ONLY
  CHAT_VERTICAL_HANDOFF_TO_COCKPIT
  APPROVAL_REQUIRED
  PROOF_UNAVAILABLE_READ_ONLY
  NO_PROVIDER_EXTERNAL_CALL
  NO_MUTATION_EXTERNAL_SIDE_EFFECT
  NO_DB_LEDGER_AUDIT_WRITE
  NO_RECEIPT_BUNDLE_PROOF_GENERATION
  NO_PII_LEAKAGE
  NO_SHADOW_DRY_RUN_EXECUTION
  NO_PILOT_SMALL_ROLLOUT_EXECUTION
  IMOB_PILOT_6A_STATIC_CHECK_ONLY
  IMOB_PILOT_6B_IMPLEMENTATION_DESIGN_ONLY
  IMOB_HARNESS_NO_GO
  IMOB_HARNESS_GO_FOR_NEXT_REVIEW_ONLY
  IMOB_PILOT_6C_PSEUDOCODE_ONLY
  IMOB_STATIC_CHECK_NON_EXECUTABLE
  IMOB_STATIC_CHECK_FAIL_CLOSED

for each required reasonCode:
  if absent from appropriate source:
    add failure "IMOB_STATIC_CHECK_REASON_CODE_MISSING"
  if used to authorize execution, production, provider, mutation, receipt, bundle, proof, shadow, pilot, or small:
    add failure "IMOB_STATIC_CHECK_REASON_CODE_MISUSED"
return reasonCode validation result
```

## NoGoCriteriaValidator pseudocode

```text
NON_EXECUTABLE NoGoCriteriaValidator:

allowed decisions:
  NO_GO
  GO_FOR_NEXT_REVIEW_ONLY

for each source document:
  require explicit non-authorization language
  reject DONE, production ready, operationally closed, Receipt Canon closed, provider enabled, pilot started, small rollout started

if any source implies execution approval:
  add failure "IMOB_STATIC_CHECK_NO_GO_CRITERIA_MISSING"
return no-go validation result
```

## BoundaryValidator pseudocode

```text
NON_EXECUTABLE BoundaryValidator:

blocked surfaces:
  provider integration
  productive secret
  production webhook
  endpoint creation
  runtime mutation
  engine behavior change
  ChatAgentLauncher business rule
  frontend preview authorization
  database write
  ledger write
  audit write
  receipt generation
  bundle generation
  proof generation
  shadow execution
  dry-run execution
  pilot execution
  small rollout execution

for each reference:
  scan stated scope and expected outputs
  if blocked surface appears as implemented or authorized:
    add failure "IMOB_STATIC_CHECK_BOUNDARY_VIOLATION"
return boundary validation result
```

## ProductiveLanguageDetector pseudocode

```text
NON_EXECUTABLE ProductiveLanguageDetector:

forbidden conclusions:
  WhatsApp operational
  IMOB operationally closed
  Receipt Canon closed
  provider selected
  provider integrated
  production authorized
  dry-run executed
  shadow started
  pilot started
  small rollout started
  critical action executed

if any forbidden conclusion appears outside a negated/non-authorization statement:
  add failure "IMOB_STATIC_CHECK_PRODUCTIVE_LANGUAGE_FORBIDDEN"
return productive language validation result
```

## SpecSkeletonDriftDetector pseudocode

```text
NON_EXECUTABLE SpecSkeletonDriftDetector:

compare IMOB-PILOT-4 non-operational harness spec
compare IMOB-PILOT-5 non-operational skeleton
compare IMOB-PILOT-6A static contract check
compare IMOB-PILOT-6B implementation design

required continuity:
  fixture remains synthetic and sanitized
  template remains future evidence only
  report remains future local artifact only
  Evidence Index remains unchanged until real evidence
  sideEffects remains zero
  providerExternalCall remains zero
  mutationExternalSideEffect remains zero
  DB/ledger/audit writes remain zero
  receipt/bundle/proof generation remains zero
  frontend preview remains unauthorized
  ChatAgentLauncher remains render-only

if any required continuity item is missing or contradicted:
  add failure "IMOB_STATIC_CHECK_SPEC_SKELETON_DRIFT"
return drift validation result
```

## FutureReportEmitter pseudocode

```text
NON_EXECUTABLE FutureReportEmitter:

compose report draft with:
  status
  references checked
  metrics checked
  reasonCodes checked
  No-Go criteria checked
  boundary findings
  productive language findings
  drift findings
  productionAuthorization = false
  executionAuthorization = false
  evidenceIndexUpdate = false
  decision = NO_GO or GO_FOR_NEXT_REVIEW_ONLY

do not write Evidence Index
do not create receipt, bundle, proof, ledger, audit, DB record, provider call, endpoint, CI step, package script, or frontend preview
return conceptual ReportDraft only
```

## Tipos conceituais nao executaveis

```text
CONCEPT StaticCheckInput:
  repositoryRoot
  requiredReferencePaths
  expectedMetrics
  expectedReasonCodes
  forbiddenBoundaries
  allowedDecisions
  executionAuthorization = false
  productionAuthorization = false

CONCEPT StaticCheckResult:
  status = fail_closed or pass_for_next_review_only
  decision = NO_GO or GO_FOR_NEXT_REVIEW_ONLY
  failures
  driftFindings
  boundaryFindings
  reportDraft
  sideEffects = 0
  providerExternalCall = 0
  mutationExternalSideEffect = 0
  dbWrite = 0
  ledgerWrite = 0
  auditWrite = 0
  receiptGenerated = 0
  bundleGenerated = 0
  proofGenerated = 0
  evidenceIndexUpdate = false
  productionAuthorization = false

CONCEPT StaticCheckFailure:
  reasonCode
  sourcePath
  message
  severity = blocking or required or advisory

CONCEPT DriftFinding:
  sourceA
  sourceB
  expectedRule
  observedGap
  reasonCode

CONCEPT BoundaryFinding:
  boundaryName
  blockedAction
  sourcePath
  reasonCode

CONCEPT ReportDraft:
  generatedByFutureStaticCheck
  references
  metrics
  reasonCodes
  noGoCriteria
  boundaryFindings
  driftFindings
  decision
```

## Regras fail-closed

O check estatico futuro deve retornar `NO_GO` quando qualquer uma das condicoes abaixo ocorrer:

- Referencia obrigatoria ausente, quebrada, ilegivel ou fora do repositorio.
- Metrica obrigatoria ausente, ambigua ou com expectativa diferente de zero para efeitos colaterais.
- ReasonCode obrigatorio ausente ou usado para autorizar execucao.
- Criterio No-Go ausente, incompleto ou contraditorio.
- Limite de provider, secret, webhook produtivo, endpoint publico, mutacao, DB, ledger, audit, receipt, bundle ou proof violado.
- Linguagem que declare producao, operacao fechada, Receipt Canon fechado, shadow iniciado, dry-run executado, pilot iniciado ou small rollout iniciado.
- Drift entre spec, skeleton, 6A e 6B.
- Qualquer tentativa de introduzir decisao de negocio no `ChatAgentLauncher`.
- Qualquer autorizacao de preview frontend antes de gate explicito.

## Exclusoes explicitas

- Este arquivo nao e script.
- Este arquivo nao e teste.
- Este arquivo nao e harness executavel.
- Este arquivo nao e importavel por TypeScript, JavaScript ou Node.
- Este arquivo nao registra script em `package.json`.
- Este arquivo nao altera CI.
- Este arquivo nao altera workflow.
- Este arquivo nao altera frontend.
- Este arquivo nao altera `ChatAgentLauncher`.
- Este arquivo nao altera runtime, engine ou API.
- Este arquivo nao cria provider externo.
- Este arquivo nao usa secret produtivo.
- Este arquivo nao cria webhook produtivo.
- Este arquivo nao cria endpoint publico.
- Este arquivo nao executa dry-run, shadow, pilot ou small rollout.
- Este arquivo nao cria DB write, ledger write ou audit write.
- Este arquivo nao gera receipt, bundle ou proof.
- Este arquivo nao atualiza `docs/EVIDENCE_INDEX.md`.
- Este arquivo nao declara Receipt Canon fechado.
- Este arquivo nao declara IMOB operacionalmente fechado.

## Proxima fase proposta

A proxima fase segura pode ser uma das seguintes, desde que explicitamente autorizada em tarefa futura:

- `IMOB-PILOT-6D - Static Check Implementation Plan`: plano de implementacao ainda nao executavel, com escopo, entradas, saidas, checks e criterios de nao-autorizacao.
- `IMOB-PILOT-7A - Frontend Fixture Preview Decision Gate`: gate documental para decidir se uma preview frontend read-only podera ser planejada futuramente, sem implementa-la.

Nenhuma dessas proximas fases esta iniciada por este documento.

## Checks requeridos

Para esta tarefa documental, os checks locais requeridos sao:

- `pnpm test:chat-gate-proof-adapters`
- `pnpm test:chat-vertical-handoff-surface`
- `pnpm test:chat-vertical-handoff-snapshot`
- `pnpm check:arch-chat-contracts`
- `pnpm check:evidence-index`
- `pnpm check:docs-link-integrity`
- `pnpm check:orphan-tests`
- `git diff --check`
- `git diff --cached --check`
- `git diff -- .github/workflows release.yml apps packages scripts`

## Status final

Status: parcial/evidenciado localmente; aguardando PR/CI remoto.

IMOB-PILOT-6C permanece proposta documental de pseudocodigo nao executavel. Nao ha autorizacao de execucao, producao, provider, mutacao, preview frontend, shadow, dry-run, pilot, small rollout, Receipt Canon fechado ou fechamento operacional IMOB.
