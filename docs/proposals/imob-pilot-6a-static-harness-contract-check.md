# IMOB-PILOT-6A - Static Harness Contract Check

Status: parcial/evidenciado localmente; aguardando PR/CI remoto.

## Resumo

IMOB-PILOT-6A cria somente uma proposta documental para um futuro check estatico de contrato do harness IMOB. Esta entrega nao cria script, nao registra package script, nao altera CI, nao executa teste novo, nao executa harness, nao executa dry-run, nao inicia shadow, pilot ou small rollout, nao cria preview frontend, nao altera frontend, nao altera `ChatAgentLauncher`, nao altera runtime, engine ou API, nao chama provider, nao escreve DB, ledger ou audit, nao gera receipt, bundle ou proof, nao altera `docs/EVIDENCE_INDEX.md`, nao declara Receipt Canon fechado e nao declara IMOB operacionalmente fechado.

O objetivo e definir o contrato de uma verificacao estatica futura que bloqueie drift entre fixture, template, spec, skeleton, contratos fisicos e boundaries antes de qualquer implementacao executavel.

## Pre-condicao registrada

Pre-condicao fornecida e confirmada antes desta alteracao:

- IMOB-PILOT-5 mergeado em `d288f1049e61f9afc5886e42ce35d17f0b7e9ba0`.
- `CI Monorepo` run `29640301692`: `completed success`.
- `IMOB Worker Mutation E2E` run `29640301721`: `completed success`.
- Worktree limpa antes das alteracoes.

Pre-check local executado antes de alteracao:

- `git switch main`: ja em `main`.
- `git pull --ff-only origin main`: `Already up to date`.
- `git fetch --prune`: concluido.
- `git status --short`: limpo.
- `git log --oneline -5`: topo `d288f10 Merge pull request #336 from 5906375/docs/imob-pilot-5-non-operational-harness-skeleton`.

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

- O Evidence Index deve apontar apenas para evidencias reais e existentes; esta fase e proposta documental e nao deve atualizar `docs/EVIDENCE_INDEX.md`.
- A arquitetura do chat e agent-driven: agente define, engine executa e `ChatAgentLauncher` apenas renderiza.
- `ChatAgentLauncher` nao deve concentrar regra cognitiva, regra de negocio, decisao de policy, handoff, fallback ou quick reply.
- IMOB-PILOT-0 a IMOB-PILOT-5 preservam estado nao operacional e bloqueiam shadow real, dry-run real, pilot, small rollout, acao critica, provider, DB, ledger, audit, receipt, bundle e proof generation.
- A fixture IMOB-PILOT-2 e sintetica, sanitizada e declara ausencia de PII, dado sensivel, secret produtivo e webhook produtivo.
- A fixture IMOB-PILOT-2 fixa `providerExternalCall=0`, `mutationExternalSideEffect=0`, `dbWrite=0`, `ledgerWrite=0`, `auditWrite=0`, `receiptGenerated=0`, `bundleGenerated=0` e `proofGenerated=0`.
- O template IMOB-PILOT-2 e evidencia futura, nao executada, e exige preconditions sem provider produtivo, secret produtivo, webhook produtivo e mutation path.
- IMOB-PILOT-4 define a spec de um futuro harness nao operacional e IMOB-PILOT-5 define o skeleton conceitual sem materializar runner.
- `chat.vertical_handoff.v1`, `hitl.gate_state.v1` e `proof_receipt_bundle_state.v1` exigem campos fisicos de tenant, workspace, scope e reasonCode.
- `buildChatVerticalHandoffSnapshot`, `buildReadOnlyHitlGateState` e `buildReadOnlyProofReceiptBundleState` retornam `sideEffects: 0` nos paths validos.
- `ChatVerticalHandoffSurface` renderiza estado read-only e informacao de HITL sem executar aprovacao.
- `package.json` ja registra os testes canonicos de handoff snapshot, surface, gate/proof adapters e `check:arch-chat-contracts`.
- O CI ja executa o gate de contratos fisicos e o teste de snapshot de handoff vertical no job `ChatEngineRegression`.

## Objetivo do static check

O futuro static check, se autorizado em fase separada, deve validar estaticamente que qualquer implementacao futura do harness:

1. Mantem compatibilidade com IMOB-PILOT-4.
2. Mantem compatibilidade com o skeleton IMOB-PILOT-5.
3. Referencia a fixture IMOB-PILOT-2 e o template IMOB-PILOT-2 por caminhos canonicos.
4. Preserva os contratos fisicos `chat.vertical_handoff.v1`, `hitl.gate_state.v1` e `proof_receipt_bundle_state.v1`.
5. Preserva o boundary agent-driven: regras no agente/engine, render apenas no launcher/superficie.
6. Bloqueia promocao quando qualquer metrica, reasonCode, boundary ou referencia obrigatoria estiver ausente.
7. Emite apenas `No-Go` ou `Go-for-next-review-only`, sem autorizacao produtiva.

IMOB-PILOT-6A nao implementa esse static check.

## Entradas futuras do check

Entradas futuras permitidas para um check estatico, em fase separada e autorizada:

- `docs/proposals/imob-pilot-2-dry-run-fixture-pack-evidence-template.md`.
- `ops/evidence/templates/imob-pilot-2-shadow-dry-run-evidence-template.md`.
- `apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json`.
- `docs/proposals/imob-pilot-4-non-operational-dry-run-harness-spec.md`.
- `docs/proposals/imob-pilot-5-non-operational-harness-skeleton.md`.
- `contracts/chat/chat.vertical_handoff.v1.schema.json`.
- `contracts/chat/hitl.gate_state.v1.schema.json`.
- `contracts/chat/proof_receipt_bundle_state.v1.schema.json`.
- `docs/architecture/agent-chat-runtime.md`.
- `AGENTS.md`.
- `package.json`, somente para confirmar ausencia de script novo quando a fase ainda nao autorizar implementacao.
- `.github/workflows/ci.yml`, somente para confirmar ausencia de CI novo quando a fase ainda nao autorizar implementacao.

Entradas proibidas para esta fase documental e para qualquer check estatico futuro sem autorizacao adicional:

- Payload real de provider.
- PII real ou dado sensivel real.
- Secret produtivo.
- Webhook produtivo.
- Tenant/workspace produtivo.
- DB, ledger ou audit como fonte de execucao.
- Receipt, bundle ou proof real gerado por execucao.
- Frontend preview como fonte de validacao.

## Validacoes futuras

O check estatico futuro deve validar, sem executar harness, sem gerar artefatos operacionais e sem iniciar dry-run:

| Validacao | Esperado | Falha futura |
| --- | --- | --- |
| Referencias obrigatorias | Todos os caminhos canonicos existem e continuam citados. | `IMOB_HARNESS_NO_GO` |
| Fixture canonical | Fixture IMOB-PILOT-2 permanece sintetica, sanitizada e fixture-only. | `IMOB_HARNESS_NO_GO` |
| Template canonical | Template IMOB-PILOT-2 preserva preconditions, metricas, hashes e decisao No-Go/Go. | `IMOB_HARNESS_NO_GO` |
| Spec compatibility | IMOB-PILOT-4 continua fonte normativa de sequencia, validacoes, metricas e No-Go. | `IMOB_HARNESS_NO_GO` |
| Skeleton compatibility | IMOB-PILOT-5 continua skeleton nao executavel e nao operacional. | `IMOB_HARNESS_NO_GO` |
| Physical contracts | Contratos de handoff, HITL gate e proof state continuam referenciados por caminho fisico. | `IMOB_HARNESS_NO_GO` |
| Mandatory reasonCodes | ReasonCodes especificos, herdados e No-Go/Go existem. | `IMOB_HARNESS_NO_GO` |
| Mandatory metrics | Todas as metricas obrigatorias existem com esperado `0` onde aplicavel. | `IMOB_HARNESS_NO_GO` |
| No-Go criteria | Criterios de falha futura estao declarados e fail-closed. | `IMOB_HARNESS_NO_GO` |
| Boundary declarations | Provider, mutation, DB, ledger, audit, receipt, bundle, proof, frontend preview e launcher boundary estao declarados. | `IMOB_HARNESS_NO_GO` |
| Productive authorization language | Documento nao autoriza producao, provider, secret, webhook, mutacao, dry-run, shadow, pilot ou small rollout. | `IMOB_HARNESS_NO_GO` |
| Frontend boundary | Nenhuma preview frontend fica em escopo. | `IMOB_HARNESS_NO_GO` |
| Launcher boundary | Nenhuma regra de negocio ou policy e atribuida ao `ChatAgentLauncher`. | `IMOB_HARNESS_NO_GO` |
| Drift spec vs skeleton | IMOB-PILOT-4 e IMOB-PILOT-5 continuam consistentes em metricas, reasonCodes, outputs e boundaries. | `IMOB_HARNESS_NO_GO` |

## Metricas obrigatorias

O static check futuro deve exigir as metricas abaixo como contrato minimo do harness futuro. Todas sao expectativas contratuais; IMOB-PILOT-6A nao coleta metricas executadas.

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

ReasonCodes especificos de IMOB-PILOT-6A:

- `IMOB_PILOT_6A_STATIC_CHECK_ONLY`.
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

## Criterios de falha futura

Qualquer item abaixo deve falhar fechado em uma futura implementacao do static check:

- Referencia obrigatoria quebrada.
- Metrica obrigatoria ausente.
- ReasonCode obrigatorio ausente.
- Boundary obrigatorio ausente.
- Linguagem que autorize producao.
- Linguagem que autorize shadow, dry-run, pilot ou small rollout.
- Linguagem que autorize provider real.
- Linguagem que autorize secret produtivo.
- Linguagem que autorize webhook produtivo.
- Linguagem que autorize mutacao.
- Frontend preview em escopo.
- Provider call em escopo.
- DB write em escopo.
- Ledger write em escopo.
- Audit write em escopo.
- Receipt generation em escopo.
- Bundle generation em escopo.
- Proof generation em escopo.
- Regra de negocio, policy ou risk decision no `ChatAgentLauncher`.
- Drift entre IMOB-PILOT-4 e IMOB-PILOT-5.
- Incompatibilidade com contratos fisicos de handoff, HITL gate ou proof state.
- Tentativa de atualizar Evidence Index sem evidencia real, fisica, verificavel e indexavel.

## Boundary explicito

IMOB-PILOT-6A preserva:

- sem script;
- sem package script;
- sem CI;
- sem teste novo;
- sem dry-run;
- sem shadow;
- sem pilot;
- sem small rollout;
- sem frontend preview;
- sem alteracao de frontend;
- sem alteracao de `ChatAgentLauncher`;
- sem alteracao de runtime;
- sem alteracao de engine;
- sem alteracao de API;
- sem provider;
- sem secret produtivo;
- sem webhook produtivo;
- sem mutacao;
- sem DB write;
- sem ledger write;
- sem audit write;
- sem receipt generation;
- sem bundle generation;
- sem proof generation;
- sem Evidence Index;
- sem fechamento do Receipt Canon;
- sem fechamento operacional IMOB.

## Compatibilidade com contratos fisicos

O static check futuro deve preservar compatibilidade fisica com:

- `chat.vertical_handoff.v1`: `version`, `handoffId`, `tenantId`, `workspaceId`, `scope`, `userId`, `verticalId`, `intentId`, `handoffMessage`, `reasonCode`, `riskLevel` e `hitlRequired`.
- `hitl.gate_state.v1`: `version`, `gateId`, `gateType`, `tenantId`, `workspaceId`, `scope`, `approvalState`, `hitlRequired`, `riskLevel`, `reasonCode`, `verticalId` e `message`.
- `proof_receipt_bundle_state.v1`: `version`, `proofKind`, `proofStatus`, `runId`, `verticalId`, `tenantId`, `workspaceId`, `scope`, `source`, `reasonCode` e `accessibilityLabel`.

A compatibilidade aqui e documental. Esta fase nao executa validacao de schema nova e nao cria runner.

## Decisao de nao implementacao

Nesta fase:

- nao cria `scripts/checkImobHarnessContract.ts`;
- nao cria `pnpm check:imob-harness-contract`;
- nao adiciona step ao CI;
- nao cria teste canonico novo;
- nao executa harness;
- nao materializa pasta `tools/imob-harness`;
- nao cria outputs de harness;
- nao cria evidence draft executado;
- nao cria hashes reais de execucao;
- nao altera `docs/EVIDENCE_INDEX.md`;
- nao muda codigo de producao;
- nao muda frontend;
- nao muda API.

## Proxima fase proposta

Proxima fase recomendada, ainda nao iniciada por IMOB-PILOT-6A:

- `IMOB-PILOT-6B - Static Check Implementation Design`, mantendo escopo documental e sem runner; ou
- `IMOB-PILOT-7 - Frontend Fixture Preview Decision`, somente como decisao documental antes de qualquer preview ou alteracao de frontend.

Qualquer fase executavel futura precisa de PR, autorizacao explicita e gates separados.

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
