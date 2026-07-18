# IMOB-PILOT-6B - Static Check Implementation Design

Status: parcial/evidenciado localmente; aguardando PR/CI remoto.

## Resumo

IMOB-PILOT-6B cria somente o design documental de uma implementacao futura do static harness contract check definido em IMOB-PILOT-6A. Esta entrega nao cria script executavel, nao registra package script, nao altera CI, nao cria teste executavel de harness, nao executa dry-run real, nao inicia shadow real, nao ativa pilot ou small rollout, nao cria preview frontend, nao altera frontend, nao altera `ChatAgentLauncher`, nao altera runtime, engine ou API, nao cria provider, nao escreve DB, ledger ou audit, nao gera receipt, bundle ou proof, nao altera `docs/EVIDENCE_INDEX.md`, nao declara Receipt Canon fechado e nao declara IMOB operacionalmente fechado.

O objetivo e transformar o contrato estatico de IMOB-PILOT-6A em um desenho tecnico futuro, mantendo execucao proibida nesta fase.

## Pre-condicao registrada

Pre-condicao fornecida e confirmada antes desta alteracao:

- IMOB-PILOT-6A mergeado em `24c2d1ed491f6503ca7e3531bea47d6257459d96`.
- `CI Monorepo` run `29640732580`: `completed success`.
- `IMOB Worker Mutation E2E` run `29640732581`: `completed success`.
- Worktree limpa antes das alteracoes.

Pre-check local executado antes de alteracao:

- `git switch main`: ja em `main`.
- `git pull --ff-only origin main`: `Already up to date`.
- `git fetch --prune`: concluido.
- `git status --short`: limpo.
- `git log --oneline -5`: topo `24c2d1e Merge pull request #337 from 5906375/docs/imob-pilot-6a-static-harness-contract-check`.

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
- `docs/proposals/imob-pilot-5-non-operational-harness-skeleton.md`.
- `docs/proposals/imob-pilot-6a-static-harness-contract-check.md`.
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

- O Evidence Index deve apontar apenas para evidencias reais existentes; esta fase e design documental e nao deve atualizar `docs/EVIDENCE_INDEX.md`.
- A arquitetura do chat permanece agent-driven: agente define, engine executa e `ChatAgentLauncher` renderiza.
- `ChatAgentLauncher` nao deve receber regra cognitiva, regra de negocio, decisao de policy, handoff, fallback, quick reply, risco ou entitlement.
- IMOB-PILOT-0 a IMOB-PILOT-6A preservam estado nao operacional para a cadeia de harness/dry-run.
- IMOB-PILOT-6A define que o static check futuro deve bloquear drift entre fixture, template, spec, skeleton, contratos fisicos, metricas, reasonCodes e boundaries.
- A fixture IMOB-PILOT-2 e sintetica, sanitizada, fixture-only e declara `providerExternalCall=0`, `mutationExternalSideEffect=0`, `dbWrite=0`, `ledgerWrite=0`, `auditWrite=0`, `receiptGenerated=0`, `bundleGenerated=0` e `proofGenerated=0`.
- O template IMOB-PILOT-2 e evidencia futura, nao executada, e exige preconditions sem provider produtivo, secret produtivo, webhook produtivo e mutation path.
- IMOB-PILOT-4 define sequencia, validacoes, metricas, reasonCodes e No-Go do futuro harness nao operacional.
- IMOB-PILOT-5 define skeleton conceitual, fases futuras e output minimo sem materializar runner.
- `chat.vertical_handoff.v1`, `hitl.gate_state.v1` e `proof_receipt_bundle_state.v1` exigem campos fisicos de tenant, workspace, scope e reasonCode.
- Os builders/adapters read-only retornam `sideEffects: 0` e falham fechado para campos obrigatorios ausentes ou estados invalidos.
- O CI ja possui gates canonicos para contratos fisicos e snapshot de handoff vertical; IMOB-PILOT-6B nao altera CI.

## Objetivo do design

O design de implementacao futura deve:

1. Desenhar uma implementacao futura do static harness contract check.
2. Transformar o contrato de IMOB-PILOT-6A em componentes tecnicos futuros.
3. Preservar execucao proibida nesta fase.
4. Definir como uma fase futura poderia verificar docs, fixture, template, contratos e boundaries sem executar dry-run.
5. Definir como falhas futuras seriam agregadas em modo fail-closed.
6. Impedir que `Go-for-next-review-only` seja tratado como autorizacao produtiva.

IMOB-PILOT-6B nao implementa esse check.

## Componentes futuros propostos

Os componentes abaixo sao desenho tecnico, nao arquivos criados nesta fase:

| Componente futuro | Responsabilidade | Boundary |
| --- | --- | --- |
| Leitor de referencias | Ler caminhos canonicos exigidos por IMOB-PILOT-6A e confirmar existencia local. | Somente filesystem read; sem rede, provider, DB, ledger ou audit. |
| Validador de metricas obrigatorias | Confirmar que IMOB-PILOT-4, IMOB-PILOT-5, IMOB-PILOT-6A, fixture e template declaram metricas minimas. | Nao coleta metricas executadas. |
| Validador de reasonCodes | Confirmar reasonCodes especificos, herdados e de decisao No-Go/Go. | Nao inventa reasonCode em runtime. |
| Validador de No-Go criteria | Confirmar que criterios de falha permanecem declarados e fail-closed. | Nao autoriza promocao. |
| Validador de boundaries | Confirmar ausencia de provider, DB, ledger, audit, receipt, bundle, proof, frontend preview e `ChatAgentLauncher` logic. | Nao inspeciona runtime produtivo. |
| Detector de linguagem produtiva proibida | Procurar linguagem que autorize producao, shadow, dry-run, pilot, small, provider real, secret produtivo, webhook produtivo ou mutacao. | Deve falhar fechado em caso de ambiguidade. |
| Detector de drift spec vs skeleton | Comparar listas documentais de metricas, reasonCodes, outputs, fases e boundaries entre IMOB-PILOT-4 e IMOB-PILOT-5. | Comparacao textual/estrutural futura; sem executar harness. |
| Emissor de relatorio local futuro | Gerar relatorio local com status, falhas fail-closed, metricas checked, reasonCodes checked e drift summary. | Nao atualiza Evidence Index automaticamente. |

## Arquitetura futura proposta

Um desenho futuro possivel, ainda nao implementado, seria:

```text
staticCheckDesign
  loadReferenceSet
    inputs: canonical file paths from IMOB-PILOT-6A
    output: referenceReadResults
  validateReferenceSet
    inputs: referenceReadResults
    output: brokenReferences[]
  validateRequiredMetrics
    inputs: IMOB-PILOT-4, IMOB-PILOT-5, IMOB-PILOT-6A, fixture, template
    output: missingMetrics[]
  validateReasonCodes
    inputs: IMOB-PILOT-4, IMOB-PILOT-5, IMOB-PILOT-6A, fixture, template
    output: missingReasonCodes[]
  validateNoGoCriteria
    inputs: IMOB-PILOT-4, IMOB-PILOT-5, IMOB-PILOT-6A
    output: missingNoGoCriteria[]
  validateBoundaries
    inputs: proposal docs, AGENTS.md, agent-chat-runtime
    output: boundaryViolations[]
  detectForbiddenProductiveLanguage
    inputs: proposal docs and future implementation docs
    output: forbiddenLanguageFindings[]
  detectSpecSkeletonDrift
    inputs: IMOB-PILOT-4, IMOB-PILOT-5
    output: driftFindings[]
  emitLocalReport
    inputs: all findings
    output: local report only
```

Esta arquitetura e conceitual. IMOB-PILOT-6B nao cria pasta, modulo, script, teste ou relatorio executado.

## Entradas futuras

Entradas futuras permitidas para uma implementacao separada:

- `docs/proposals/imob-pilot-2-dry-run-fixture-pack-evidence-template.md`.
- `docs/proposals/imob-pilot-4-non-operational-dry-run-harness-spec.md`.
- `docs/proposals/imob-pilot-5-non-operational-harness-skeleton.md`.
- `docs/proposals/imob-pilot-6a-static-harness-contract-check.md`.
- `ops/evidence/templates/imob-pilot-2-shadow-dry-run-evidence-template.md`.
- `apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json`.
- `contracts/chat/chat.vertical_handoff.v1.schema.json`.
- `contracts/chat/hitl.gate_state.v1.schema.json`.
- `contracts/chat/proof_receipt_bundle_state.v1.schema.json`.
- `AGENTS.md`.
- `docs/architecture/agent-chat-runtime.md`.
- `package.json`, apenas quando a fase futura autorizar verificar registro ou ausencia de script.
- `.github/workflows/ci.yml`, apenas quando a fase futura autorizar verificar registro ou ausencia de CI.

Entradas proibidas:

- Provider payload real.
- PII real ou dados sensiveis reais.
- Secrets, tokens ou credenciais.
- Webhook produtivo.
- Tenant/workspace produtivo.
- DB, ledger ou audit como fonte.
- Receipt, bundle ou proof real gerado por execucao.
- Frontend preview como fonte.

## Saidas futuras

Saidas futuras permitidas, somente em fase separada:

- Relatorio local futuro do static check.
- Lista de falhas fail-closed.
- Lista de metricas checked.
- Lista de reasonCodes checked.
- Drift summary entre spec e skeleton.
- Status `No-Go` ou `Go-for-next-review-only`.
- Confirmacao explicita de que nenhuma Evidence Index update automatica ocorreu.

Saidas proibidas:

- Atualizacao automatica de `docs/EVIDENCE_INDEX.md`.
- Evidence draft tratado como evidencia real sem execucao.
- Hashes reais de dry-run quando nao houver dry-run autorizado.
- Receipt gerado.
- Bundle gerado ou exportado.
- Proof gerado ou fabricado.
- Ledger/audit/DB write.
- Provider call.
- Frontend preview.
- API route.
- Package script.
- CI step.

## Modelo de resultado futuro

Um relatorio local futuro poderia usar o seguinte formato conceitual:

```text
StaticHarnessContractCheckReport
  checkId
  generatedAt
  branchOrSha
  status: No-Go | Go-for-next-review-only
  productionAuthorization: false
  shadowAuthorization: false
  dryRunAuthorization: false
  references
    checked[]
    missing[]
  metrics
    checked[]
    missing[]
  reasonCodes
    checked[]
    missing[]
  noGoCriteria
    checked[]
    missing[]
  boundaries
    checked[]
    violations[]
  forbiddenLanguage
    findings[]
  drift
    specVsSkeletonFindings[]
  evidenceIndex
    updatedAutomatically: false
  sideEffects: 0
```

Este modelo nao e schema, nao e TypeScript e nao e artefato executavel nesta fase.

## Metricas futuras a checar

A implementacao futura deve checar a declaracao das metricas abaixo, sem coleta operacional nesta fase:

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

## ReasonCodes futuros a checar

ReasonCodes especificos desta fase de design:

- `IMOB_PILOT_6B_IMPLEMENTATION_DESIGN_ONLY`.
- `IMOB_PILOT_6A_STATIC_CHECK_ONLY`.
- `IMOB_HARNESS_NO_GO`.
- `IMOB_HARNESS_GO_FOR_NEXT_REVIEW_ONLY`.

ReasonCodes herdados que a implementacao futura deve preservar:

- `IMOB_PILOT_5_SKELETON_ONLY`.
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
- `IMOB_HARNESS_HITL_REQUIRED`.
- `IMOB_HARNESS_SIDE_EFFECT_BLOCKED`.
- `IMOB_HARNESS_PROVIDER_CALL_BLOCKED`.
- `IMOB_HARNESS_MUTATION_BOUNDARY_BLOCKED`.
- `IMOB_HARNESS_DB_LEDGER_AUDIT_BLOCKED`.
- `IMOB_HARNESS_EVIDENCE_GENERATION_BLOCKED`.
- `IMOB_HARNESS_PROOF_FABRICATION_BLOCKED`.
- `IMOB_HARNESS_CHAT_LAUNCHER_RULE_BLOCKED`.
- `IMOB_HARNESS_REASON_CODE_REQUIRED`.
- `IMOB_HARNESS_CHECKSUM_MISMATCH`.
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

## Boundaries

O design futuro deve preservar:

- sem provider;
- sem provider payload real;
- sem secret produtivo;
- sem webhook produtivo;
- sem DB;
- sem DB write;
- sem ledger;
- sem audit;
- sem ledger/audit write;
- sem receipt generation;
- sem bundle generation/export;
- sem proof generation;
- sem proof fabricado;
- sem frontend preview;
- sem alteracao de frontend;
- sem regra de negocio no `ChatAgentLauncher`;
- sem decisao de policy, risco, HITL, entitlement ou proof no frontend;
- sem runtime change;
- sem engine change;
- sem API;
- sem mutacao;
- sem acao critica;
- sem autorizacao produtiva;
- sem Evidence Index automatico.

## Criterios fail-closed

Qualquer item abaixo deve tornar o resultado futuro `No-Go`:

- Referencia quebrada.
- Metrica obrigatoria ausente.
- ReasonCode obrigatorio ausente.
- No-Go criteria ausente.
- Boundary obrigatorio ausente.
- Linguagem que autoriza producao.
- Linguagem que autoriza shadow real.
- Linguagem que autoriza dry-run real.
- Linguagem que autoriza pilot ou small rollout.
- Drift entre IMOB-PILOT-4 e IMOB-PILOT-5.
- Frontend preview no escopo.
- Provider no escopo.
- DB no escopo.
- Ledger/audit no escopo.
- Provider/DB/ledger/audit write no escopo.
- Receipt generation no escopo.
- Bundle generation/export no escopo.
- Proof generation ou proof fabrication no escopo.
- Regra de negocio no `ChatAgentLauncher`.
- Policy/risk/HITL/entitlement/proof decision no frontend.
- Evidence Index update automatica.
- `Go-for-next-review-only` tratado como autorizacao de producao.

## Decisao de implementacao

Nesta fase:

- nao implementa o check;
- nao cria script executavel;
- nao cria `scripts/checkImobHarnessContract.ts`;
- nao cria `pnpm check:imob-harness-contract`;
- nao registra package script;
- nao adiciona CI gate;
- nao cria teste executavel de harness;
- nao executa harness;
- nao cria relatorio local executado;
- nao atualiza Evidence Index;
- nao altera codigo de producao.

Implementacao futura exige fase separada, PR proprio, escopo de escrita novo e checks especificos. Um CI gate futuro tambem exige PR separado. Evidence Index futuro so pode ser atualizado se houver evidencia fisica, real, verificavel e indexavel.

## Proxima fase proposta

Proxima fase recomendada, ainda nao iniciada por IMOB-PILOT-6B:

- `IMOB-PILOT-6C - Static Check Non-Executable Pseudocode`; ou
- `IMOB-PILOT-7A - Frontend Fixture Preview Decision Gate`, somente apos 6C/CI design e antes de qualquer preview ou alteracao de frontend.

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
