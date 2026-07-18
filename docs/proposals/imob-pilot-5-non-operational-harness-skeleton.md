# IMOB-PILOT-5 - Non-Operational Harness Skeleton

Status: parcial/evidenciado localmente; aguardando PR/CI remoto.

## Resumo

IMOB-PILOT-5 cria um skeleton documental e nao-operacional para um futuro harness de shadow dry-run IMOB. Esta entrega nao cria script executavel, nao registra package script, nao altera CI, nao executa dry-run real, nao inicia shadow real, nao ativa pilot ou small rollout, nao chama provider, nao escreve DB, ledger ou audit, nao gera receipt, bundle ou proof, nao cria preview frontend, nao altera frontend, nao altera `ChatAgentLauncher`, nao altera runtime, engine ou API, nao declara Receipt Canon fechado e nao declara IMOB operacionalmente fechado.

O skeleton transforma a spec IMOB-PILOT-4 em uma estrutura futura de artefatos, fases, interfaces conceituais e output esperado. Ele nao e um runner, nao e um teste, nao e um harness executavel e nao autoriza operacao produtiva.

## Pre-condicao registrada

Pre-condicao fornecida e confirmada antes desta alteracao:

- IMOB-PILOT-4 mergeado em `191e49a1a3ed2d6674e312c593a9efbd6007dc19`.
- `IMOB Worker Mutation E2E` run `29639104244`: `completed success`.
- `CI Monorepo` run `29639104264`: `completed success`.
- Worktree limpa antes das alteracoes.

Pre-check local executado antes de alteracao:

- `git switch main`: ja em `main`.
- `git pull --ff-only origin main`: `Already up to date`.
- `git fetch --prune`: concluido.
- `git status --short`: limpo.
- `git log --oneline -5`: topo `191e49a Merge pull request #335 from 5906375/docs/imob-pilot-4-non-operational-harness-spec`.

## Fontes lidas

- `CODEX.md`.
- `IA_EIAH.md`.
- `AGENTS.md`.
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`.
- `docs/architecture/agent-chat-runtime.md`.
- `docs/EVIDENCE_INDEX.md`.
- `docs/proposals/imob-pilot-0-shadow-readiness-checklist.md`.
- `docs/proposals/imob-pilot-1-shadow-dry-run-evidence-plan.md`.
- `docs/proposals/imob-pilot-2-dry-run-fixture-pack-evidence-template.md`.
- `docs/proposals/imob-pilot-3-shadow-dry-run-harness-plan.md`.
- `docs/proposals/imob-pilot-4-non-operational-dry-run-harness-spec.md`.
- `ops/evidence/templates/imob-pilot-2-shadow-dry-run-evidence-template.md`.
- `apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json`.
- `contracts/chat/chat.vertical_handoff.v1.schema.json`.
- `contracts/chat/hitl.gate_state.v1.schema.json`.
- `contracts/chat/proof_receipt_bundle_state.v1.schema.json`.
- `apps/api/src/services/chatVerticalHandoffSnapshot.ts`.
- `apps/api/src/services/chatGateProofAdapters.ts`.
- `apps/web/src/components/chat/ChatVerticalHandoffSurface.tsx`.
- `package.json`.
- `.github/workflows/ci.yml`.

## Estado atual observado

- O Evidence Index deve apontar apenas para evidencias reais e existentes, nao planos futuros, conforme `IA_EIAH.md:42` e `IA_EIAH.md:230`.
- O roadmap exige classificacao parcial/proposta quando nao houver evidencia real executada, conforme `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md:34`.
- A arquitetura do chat e agent-driven: agente define, engine executa e launcher renderiza, conforme `AGENTS.md:5` e `AGENTS.md:7`.
- O `ChatAgentLauncher` nao deve decidir especialista, inventar handoff, definir quick replies ou concentrar regras cognitivas/de negocio, conforme `docs/architecture/agent-chat-runtime.md:60`.
- IMOB-PILOT-0 define checklist documental e nao inicia shadow/pilot/small, nao executa acao critica, nao gera receipt/bundle/proof/ledger/audit e nao altera frontend/runtime/API, conforme `docs/proposals/imob-pilot-0-shadow-readiness-checklist.md:5`.
- IMOB-PILOT-1 define plano de evidencia futura sem shadow real, dry-run real, pilot, small, acao critica, receipt, bundle, DB, ledger, audit ou provider externo, conforme `docs/proposals/imob-pilot-1-shadow-dry-run-evidence-plan.md:5`.
- IMOB-PILOT-2 criou fixture e template sem transformar preparacao em dry-run real, conforme `docs/proposals/imob-pilot-2-dry-run-fixture-pack-evidence-template.md:45`.
- IMOB-PILOT-3 define plano documental e nao cria script executavel, package script, CI, harness, shadow, dry-run, pilot, small, provider, DB, ledger, audit, frontend, runtime, engine ou API, conforme `docs/proposals/imob-pilot-3-shadow-dry-run-harness-plan.md:5`.
- IMOB-PILOT-4 define a spec do futuro harness e declara que nao implementa o harness em `docs/proposals/imob-pilot-4-non-operational-dry-run-harness-spec.md:76`.
- A fixture IMOB-PILOT-2 declara dados sinteticos/sanitizados, sem PII, dados sensiveis, secret produtivo ou webhook produtivo, conforme `apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json:5`.
- A fixture IMOB-PILOT-2 fixa `dryRunExecutedByThisChange=0`, `shadowStartedByThisChange=0`, `pilotStartedByThisChange=0`, `providerExternalCall=0`, `dbWrite=0`, `ledgerWrite=0`, `auditWrite=0`, `receiptGenerated=0`, `bundleGenerated=0` e `proofGenerated=0`, conforme `apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json:14`.
- O template IMOB-PILOT-2 e explicitamente evidencia futura, nao executada, e nao inicia shadow/dry-run/pilot/small, conforme `ops/evidence/templates/imob-pilot-2-shadow-dry-run-evidence-template.md:1`.
- `chat.vertical_handoff.v1`, `hitl.gate_state.v1` e `proof_receipt_bundle_state.v1` possuem campos obrigatorios fisicos para tenant, workspace, scope e reasonCode, conforme `contracts/chat/chat.vertical_handoff.v1.schema.json:6`, `contracts/chat/hitl.gate_state.v1.schema.json:6` e `contracts/chat/proof_receipt_bundle_state.v1.schema.json:6`.
- `buildChatVerticalHandoffSnapshot`, `buildReadOnlyHitlGateState` e `buildReadOnlyProofReceiptBundleState` retornam `sideEffects: 0` em paths validos, conforme `apps/api/src/services/chatVerticalHandoffSnapshot.ts:221`, `apps/api/src/services/chatGateProofAdapters.ts:329` e `apps/api/src/services/chatGateProofAdapters.ts:430`.
- `ChatVerticalHandoffSurface` renderiza estado read-only e aviso visual de HITL sem executar aprovacao, conforme `apps/web/src/components/chat/ChatVerticalHandoffSurface.tsx:38`.
- `package.json` ja registra os scripts canonicos de testes de snapshot/surface/gate-proof e `check:arch-chat-contracts`, conforme `package.json:101`.
- O CI `ChatEngineRegression` ja executa contratos fisicos e `test:chat-vertical-handoff-snapshot`, conforme `.github/workflows/ci.yml:257`.

## Skeleton criado

Este skeleton e uma estrutura conceitual para uma fase futura, nao um arquivo executavel. A estrutura futura recomendada, se e somente se uma fase posterior autorizar implementacao, seria:

```text
tools/imob-harness/
  README.md
  contracts/
    input.fixture.contract.md
    output.skeleton.contract.md
  fixtures/
    imob-pilot-2-shadow-dry-run.fixture.json -> reference only
  outputs/
    input-snapshot.json
    handoff-snapshot.json
    hitl-gate-state.json
    proof-receipt-bundle-state.json
    render-output.md
    metrics.json
    reason-codes.json
    checksum-manifest.json
    evidence-draft.md
    no-go-go-decision.md
```

IMOB-PILOT-5 nao cria essa pasta e nao materializa esses artefatos. A estrutura acima define somente nomes e responsabilidades futuras.

## Fases futuras do harness

As fases futuras, ainda nao executadas, sao:

1. `load fixture`: carregar a fixture IMOB-PILOT-2 por caminho fixo e sem input externo.
2. `validate fixture`: validar JSON parse, status `fixture_only_not_executed`, dados sinteticos e ausencia de PII/sensiveis.
3. `validate schemas`: validar handoff, HITL gate e proof state contra contratos fisicos.
4. `validate render expectation`: comparar o render expectation read-only com output textual planejado, sem preview frontend.
5. `collect metrics`: coletar metricas obrigatorias com valores esperados.
6. `collect reasonCodes`: consolidar reasonCodes observados e herdados da fixture/spec.
7. `build checksum manifest`: calcular hashes apenas para artefatos futuros autorizados.
8. `prepare evidence draft`: preencher draft local usando template de IMOB-PILOT-2.
9. `emit No-Go/Go-for-next-review-only`: emitir decisao sem autorizacao produtiva.

## Interfaces conceituais nao executaveis

As interfaces abaixo sao descricoes de contrato, nao TypeScript, nao JSON Schema novo e nao codigo:

```text
HarnessInput
  fixturePath: fixed path to IMOB-PILOT-2 fixture
  contracts: chat.vertical_handoff.v1, hitl.gate_state.v1, proof_receipt_bundle_state.v1
  evidenceTemplatePath: ops/evidence/templates/imob-pilot-2-shadow-dry-run-evidence-template.md
  executionAuthorization: required in future phase, absent in IMOB-PILOT-5

HarnessContext
  tenantId: synthetic only
  workspaceId: synthetic only
  scope: synthetic read-only scope
  verticalId: imob
  runId: synthetic fixture reference only
  dataPolicy: syntheticOnly=true, sanitized=true, containsPii=false

HarnessStageResult
  stageName: one of load_fixture, validate_fixture, validate_schemas, validate_render_expectation, collect_metrics, collect_reasonCodes, build_checksum_manifest, prepare_evidence_draft, emit_decision
  status: pass | fail | skipped
  reasonCodes: string[]
  metricsDelta: key/value map
  sideEffects: 0

HarnessDecision
  decision: No-Go | Go-for-next-review-only
  productionAuthorization: false
  shadowAuthorization: false
  dryRunAuthorization: false
  reasonCodes: string[]
```

## Output skeleton

O output skeleton futuro minimo deve conter:

```text
outputSkeleton
  metadata
    harnessId
    generatedAt
    branchOrSha
    fixturePath
    status
    productionAuthorization=false
  inputs
    fixtureChecksumSha256
    syntheticOnly=true
    containsPii=false
    containsSensitiveData=false
  snapshots
    inputSnapshotPath
    handoffSnapshotPath
    hitlGateStatePath
    proofReceiptBundleStatePath
    renderOutputPath
  validations
    fixtureParse
    piiScan
    handoffSchema
    hitlGateSchema
    proofStateSchema
    renderReadOnly
    tenantWorkspaceScopeConsistency
    reasonCodeCoverage
  metrics
    sideEffects=0
    providerExternalCall=0
    mutationExternalSideEffect=0
    dbWrite=0
    ledgerWrite=0
    auditWrite=0
    receiptGenerated=0
    bundleGenerated=0
    proofGenerated=0
    proofFabricatedInFrontend=0
    frontendPolicyDecision=0
    chatLauncherBusinessRule=0
    criticalActionExecuted=0
    criticalActionWithoutHITL=0
    piiLeakageDetected=0
    missingReasonCode=0
    checksumMismatch=0
  reasonCodes
    observed
    inherited
    noGo
  checksumManifest
    fixtureSha256
    inputSnapshotSha256
    handoffSnapshotSha256
    hitlGateStateSha256
    proofReceiptBundleStateSha256
    renderOutputSha256
    evidenceDraftSha256
  decision
    value=No-Go | Go-for-next-review-only
    reviewer
    productionAuthorization=false
```

Este output skeleton nao foi criado como artefato separado nesta fase para evitar transformar a proposta em evidencia ou runner executavel.

## Boundary explicito

O futuro harness deve preservar:

- nao chama provider;
- nao escreve DB;
- nao escreve ledger;
- nao escreve audit;
- nao gera receipt;
- nao gera bundle;
- nao gera proof;
- nao decide policy no frontend;
- nao adiciona regra ao `ChatAgentLauncher`;
- nao cria API;
- nao altera runtime;
- nao altera engine;
- nao altera frontend;
- nao cria preview frontend;
- nao usa secret produtivo;
- nao habilita webhook produtivo.

## Metricas obrigatorias

As metricas obrigatorias do output skeleton futuro sao:

| Metrica | Esperado |
| --- | ---: |
| `sideEffects` | `0` |
| `providerExternalCall` | `0` |
| `mutationExternalSideEffect` | `0` |
| `dbWrite` | `0` |
| `ledgerWrite` | `0` |
| `auditWrite` | `0` |
| `receiptGenerated` | `0` |
| `bundleGenerated` | `0` |
| `proofGenerated` | `0` |
| `proofFabricatedInFrontend` | `0` |
| `frontendPolicyDecision` | `0` |
| `chatLauncherBusinessRule` | `0` |
| `criticalActionExecuted` | `0` |
| `criticalActionWithoutHITL` | `0` |
| `piiLeakageDetected` | `0` |
| `missingReasonCode` | `0` |
| `checksumMismatch` | `0` |

## ReasonCodes

ReasonCodes especificos de IMOB-PILOT-5:

- `IMOB_PILOT_5_SKELETON_ONLY`.
- `IMOB_HARNESS_NO_GO`.
- `IMOB_HARNESS_GO_FOR_NEXT_REVIEW_ONLY`.

ReasonCodes herdados da spec IMOB-PILOT-4:

- `IMOB_HARNESS_SPEC_ONLY`.
- `IMOB_HARNESS_FIXTURE_PARSE_FAILED`.
- `IMOB_HARNESS_PII_SCAN_FAILED`.
- `IMOB_HARNESS_SCOPE_CONTEXT_INVALID`.
- `IMOB_HARNESS_RBAC_FIXTURE_INVALID`.
- `IMOB_HARNESS_ENTITLEMENT_FIXTURE_INVALID`.
- `IMOB_HARNESS_HANDOFF_SCHEMA_INVALID`.
- `IMOB_HARNESS_HITL_GATE_SCHEMA_INVALID`.
- `IMOB_HARNESS_PROOF_STATE_SCHEMA_INVALID`.
- `IMOB_HARNESS_RENDER_OUTPUT_INVALID`.
- `IMOB_HARNESS_SIDE_EFFECT_BLOCKED`.
- `IMOB_HARNESS_PROVIDER_CALL_BLOCKED`.
- `IMOB_HARNESS_MUTATION_BOUNDARY_BLOCKED`.
- `IMOB_HARNESS_DB_LEDGER_AUDIT_BLOCKED`.
- `IMOB_HARNESS_EVIDENCE_GENERATION_BLOCKED`.
- `IMOB_HARNESS_PROOF_FABRICATION_BLOCKED`.
- `IMOB_HARNESS_CHAT_LAUNCHER_RULE_BLOCKED`.
- `IMOB_HARNESS_REASON_CODE_REQUIRED`.
- `IMOB_HARNESS_HITL_REQUIRED`.
- `IMOB_HARNESS_CHECKSUM_MISMATCH`.

ReasonCodes herdados da fixture/template IMOB-PILOT-2:

- `IMOB_PILOT_2_FIXTURE_PACK_ONLY`.
- `CHAT_VERTICAL_HANDOFF_TO_COCKPIT`.
- `APPROVAL_REQUIRED`.
- `PROOF_UNAVAILABLE_READ_ONLY`.
- `NO_PROVIDER_EXTERNAL_CALL`.
- `NO_MUTATION_EXTERNAL_SIDE_EFFECT`.
- `NO_DB_LEDGER_AUDIT_WRITE`.
- `NO_RECEIPT_BUNDLE_PROOF_GENERATION`.
- `NO_PII_LEAKAGE`.
- `NO_SHADOW_DRY_RUN_EXECUTION`.
- `NO_PILOT_SMALL_ROLLOUT_EXECUTION`.

## No-Go criteria

Qualquer item abaixo deve produzir `No-Go` em fase futura:

- qualquer side effect;
- provider call;
- DB write;
- ledger write;
- audit write;
- receipt generation;
- bundle generation;
- proof generation;
- proof fabricado;
- PII ou dado sensivel real;
- schema invalido;
- render nao read-only;
- missing reasonCode;
- checksum inconsistente;
- critical action executada;
- critical action sem HITL;
- policy/risk/entitlement decidida no frontend;
- regra de negocio adicionada ao `ChatAgentLauncher`;
- tentativa de tratar skeleton como autorizacao produtiva;
- tentativa de iniciar shadow/dry-run/pilot/small sem PR e aprovacao especificos.

## Proxima fase proposta

Proxima fase recomendada, ainda nao iniciada por IMOB-PILOT-5:

- `IMOB-PILOT-6 - Static Harness Contract Check` ou `Frontend Fixture Preview Decision`.

Se a proxima fase for `Static Harness Contract Check`, ela deve continuar sem provider, sem mutacao e sem evidencia produtiva. Se a proxima fase for `Frontend Fixture Preview Decision`, ela deve ser uma decisao documental antes de qualquer preview ou alteracao de frontend.

## Decisao de nao implementacao

Nesta fase:

- nao cria script executavel;
- nao registra package script;
- nao altera CI;
- nao cria teste que execute harness real;
- nao executa dry-run real;
- nao inicia shadow real;
- nao ativa pilot;
- nao ativa small rollout;
- nao cria API;
- nao chama provider;
- nao escreve DB;
- nao escreve ledger;
- nao escreve audit;
- nao gera receipt;
- nao gera bundle;
- nao gera proof;
- nao altera frontend;
- nao altera `ChatAgentLauncher`;
- nao altera runtime;
- nao altera engine;
- nao altera schema Prisma;
- nao altera seeds/migrations;
- nao usa secrets produtivos;
- nao cria webhook produtivo;
- nao cria preview frontend;
- nao declara Receipt Canon fechado;
- nao declara IMOB operacionalmente fechado.

## Checks requeridos para esta entrega

- `pnpm test:chat-gate-proof-adapters`.
- `pnpm test:chat-vertical-handoff-surface`.
- `pnpm test:chat-vertical-handoff-snapshot`.
- `pnpm check:arch-chat-contracts`.
- `pnpm check:evidence-index`.
- `pnpm check:docs-link-integrity`.
- `pnpm check:orphan-tests`.
- `git diff --check`.
- `git diff -- .github/workflows release.yml apps packages scripts`.
- `git diff --cached --check`.
- `git diff --cached -- .github/workflows release.yml apps packages scripts`.

## Status final

Status: parcial/evidenciado localmente; aguardando PR/CI remoto.
