# IMOB-PILOT-4 - Non-Operational Dry-Run Harness Spec

Status: parcial/evidenciado localmente; aguardando PR/CI remoto.

## Resumo

IMOB-PILOT-4 cria uma especificacao documental para um futuro harness de dry-run nao operacional. Esta entrega nao cria script executavel, nao registra package script, nao altera CI, nao executa harness, nao inicia dry-run real, nao inicia shadow real, nao ativa pilot ou small rollout, nao executa acao critica, nao gera receipt, nao gera bundle, nao gera proof, nao escreve DB, ledger ou audit, nao cria provider externo, nao altera frontend, nao altera `ChatAgentLauncher`, nao altera runtime, engine ou API, nao declara Receipt Canon fechado e nao declara IMOB operacionalmente fechado.

A especificacao existe para converter o plano IMOB-PILOT-3 em requisitos de interface, entradas, saidas, sequencia logica, validacoes, metricas, reasonCodes e criterios No-Go para uma fase futura separada e explicitamente autorizada.

## Pre-condicao registrada

Pre-condicao fornecida e confirmada antes desta alteracao:

- IMOB-PILOT-3 mergeado em `b80ddc6e659cb158a94e8c52f904a27f8a7500f0`.
- `CI Monorepo` run `29638654970`: `completed success`.
- `IMOB Worker Mutation E2E` run `29638654971`: `completed success`.
- Worktree limpa antes das alteracoes.

Pre-check local executado antes de alteracao:

- `git switch main`: ja em `main`.
- `git pull --ff-only origin main`: `Already up to date`.
- `git fetch --prune`: concluido.
- `git status --short`: limpo.
- `git log --oneline -5`: topo `b80ddc6 Merge pull request #334 from 5906375/docs/imob-pilot-3-shadow-dry-run-harness-plan`.

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
- O rollout de verticais segue `shadow -> pilot -> small` e depende de gates e evidencias, conforme `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md:143` e `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md:266`.
- IMOB-PILOT-0 e documental e nao inicia shadow/pilot/small, nao executa acao critica, nao gera receipt/bundle/proof/ledger/audit e nao altera frontend/runtime/API, conforme `docs/proposals/imob-pilot-0-shadow-readiness-checklist.md:5`.
- IMOB-PILOT-1 define evidencia futura de dry-run sem shadow real, dry-run real, pilot, small, acao critica, receipt, bundle, DB, ledger, audit ou provider externo, conforme `docs/proposals/imob-pilot-1-shadow-dry-run-evidence-plan.md:5`.
- IMOB-PILOT-2 criou fixture, template e proposta sem transformar preparacao em dry-run real, conforme `docs/proposals/imob-pilot-2-dry-run-fixture-pack-evidence-template.md:45`.
- IMOB-PILOT-3 define apenas plano documental de futuro harness e nao cria script executavel, package script, CI, harness, shadow, dry-run, pilot, small, provider, DB, ledger, audit, frontend, runtime, engine ou API, conforme `docs/proposals/imob-pilot-3-shadow-dry-run-harness-plan.md:5`.
- A fixture IMOB-PILOT-2 declara dados sinteticos/sanitizados, sem PII, sensiveis, secret produtivo ou webhook produtivo, conforme `apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json:5`.
- A fixture IMOB-PILOT-2 fixa `dryRunExecutedByThisChange=0`, `shadowStartedByThisChange=0`, `pilotStartedByThisChange=0`, `providerExternalCall=0`, `dbWrite=0`, `ledgerWrite=0`, `auditWrite=0`, `receiptGenerated=0`, `bundleGenerated=0` e `proofGenerated=0`, conforme `apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json:14`.
- O template IMOB-PILOT-2 exige preconditions sem provider produtivo, secret produtivo, webhook produtivo e mutation path, conforme `ops/evidence/templates/imob-pilot-2-shadow-dry-run-evidence-template.md:14`.
- O template IMOB-PILOT-2 exige metricas observadas, checksums, decisao No-Go/Go, `sideEffects=0`, `providerExternalCall=0`, `proofFabricatedInFrontend=0`, no mutation e no receipt/bundle/proof generation, conforme `ops/evidence/templates/imob-pilot-2-shadow-dry-run-evidence-template.md:112`.
- `chat.vertical_handoff.v1` exige `version`, `handoffId`, `tenantId`, `workspaceId`, `scope`, `userId`, `verticalId`, `intentId`, `handoffMessage`, `reasonCode`, `riskLevel` e `hitlRequired`, conforme `contracts/chat/chat.vertical_handoff.v1.schema.json:6`.
- `hitl.gate_state.v1` exige `version`, `gateId`, `gateType`, `tenantId`, `workspaceId`, `scope`, `approvalState`, `hitlRequired`, `riskLevel`, `reasonCode`, `verticalId` e `message`, conforme `contracts/chat/hitl.gate_state.v1.schema.json:6`.
- `proof_receipt_bundle_state.v1` exige `version`, `proofKind`, `proofStatus`, `runId`, `verticalId`, `tenantId`, `workspaceId`, `scope`, `source`, `reasonCode` e `accessibilityLabel`, conforme `contracts/chat/proof_receipt_bundle_state.v1.schema.json:6`.
- `buildChatVerticalHandoffSnapshot` valida campos obrigatorios, bloqueia `critical` sem HITL e retorna `sideEffects: 0`, conforme `apps/api/src/services/chatVerticalHandoffSnapshot.ts:221`.
- `buildReadOnlyHitlGateState` valida campos obrigatorios, bloqueia `critical` sem HITL e retorna `readOnly: true` com `sideEffects: 0`, conforme `apps/api/src/services/chatGateProofAdapters.ts:329`.
- `buildReadOnlyProofReceiptBundleState` valida campos obrigatorios, normaliza `unavailable` para `not_required`, preserva refs opcionais e retorna `readOnly: true` com `sideEffects: 0`, conforme `apps/api/src/services/chatGateProofAdapters.ts:430`.
- `ChatVerticalHandoffSurface` renderiza estado read-only, reasonCode, HITL e render hints sem executar aprovacao, conforme `apps/web/src/components/chat/ChatVerticalHandoffSurface.tsx:38`.
- `package.json` registra scripts canonicos de snapshot, surface, gate/proof adapters e contrato ARCH, conforme `package.json:101`.
- O CI `ChatEngineRegression` executa contratos fisicos e `test:chat-vertical-handoff-snapshot`, conforme `.github/workflows/ci.yml:257`.

## Objetivo futuro do harness

Um futuro harness, em fase separada e autorizada, deve ser um executor local nao operacional capaz de:

1. Consumir somente a fixture sintetica/sanitizada IMOB-PILOT-2.
2. Validar contratos fisicos read-only.
3. Serializar resultados deterministas.
4. Preencher um evidence draft a partir do template IMOB-PILOT-2.
5. Emitir decisao `No-Go` ou `Go-for-next-review-only`.
6. Bloquear qualquer promocao quando houver No-Go.
7. Provar `sideEffects=0`.
8. Provar ausencia de provider, mutacao, DB, ledger, audit, receipt, bundle e proof generation.
9. Manter Evidence Index fora do fluxo automatico.

IMOB-PILOT-4 nao implementa esse harness.

## Entradas planejadas

Entradas permitidas para a fase futura:

- `apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json`.
- `ops/evidence/templates/imob-pilot-2-shadow-dry-run-evidence-template.md`.
- `contracts/chat/chat.vertical_handoff.v1.schema.json`.
- `contracts/chat/hitl.gate_state.v1.schema.json`.
- `contracts/chat/proof_receipt_bundle_state.v1.schema.json`.
- Builders/adapters read-only existentes:
  - `buildChatVerticalHandoffSnapshot`.
  - `buildReadOnlyHitlGateState`.
  - `buildReadOnlyProofReceiptBundleState`.
- Snapshot esperado da superficie read-only `ChatVerticalHandoffSurface`, sem alterar frontend.
- Configuracao fixture-only para RBAC/entitlement, sem consulta externa.

Entradas proibidas:

- PII real.
- Dados sensiveis reais.
- Provider payload real.
- Secret produtivo.
- Webhook produtivo.
- Token ou credential.
- Tenant/workspace produtivo.
- DB, ledger ou audit como fonte de execucao.
- Receipt, bundle ou proof real gerado pela execucao.

## Saidas planejadas

Saidas permitidas somente em fase futura autorizada:

- Evidence draft local derivado do template IMOB-PILOT-2.
- Input snapshot serializado e sanitizado.
- Handoff snapshot serializado.
- HITL gate state serializado.
- Proof receipt bundle state serializado em modo read-only.
- Render output read-only serializado.
- Metrics observed.
- ReasonCodes observed.
- Checksum manifest.
- Decisao `No-Go` ou `Go-for-next-review-only`.
- Prova explicita de `sideEffects=0`.
- Prova explicita de `providerExternalCall=0`.
- Prova explicita de `mutationExternalSideEffect=0`.
- Prova explicita de `dbWrite=0`, `ledgerWrite=0` e `auditWrite=0`.
- Prova explicita de `receiptGenerated=0`, `bundleGenerated=0` e `proofGenerated=0`.

Saidas proibidas:

- Evidence Index automatico.
- Receipt gerado.
- Bundle gerado/exportado.
- Proof fabricado.
- Ledger write.
- Audit write.
- DB write.
- Provider call.
- API route nova.
- Package script novo.
- CI job novo.

## Sequencia logica planejada

A sequencia abaixo e normativa para uma fase futura e nao e executada por IMOB-PILOT-4:

1. Confirmar autorizacao explicita para executar harness futuro.
2. Confirmar worktree limpa.
3. Ler fixture IMOB-PILOT-2.
4. Validar JSON parse.
5. Executar PII/sensitive scan sobre fixture e output planejado.
6. Validar tenant/workspace/scope.
7. Validar RBAC fixture-only.
8. Validar entitlement fixture-only.
9. Construir handoff snapshot read-only.
10. Validar handoff contra `chat.vertical_handoff.v1`.
11. Construir HITL gate state read-only.
12. Validar HITL gate contra `hitl.gate_state.v1`.
13. Construir proof receipt bundle state read-only.
14. Validar proof state contra `proof_receipt_bundle_state.v1`.
15. Serializar render output read-only esperado.
16. Validar que render output nao contem PII/sensivel.
17. Capturar metricas observadas.
18. Capturar reasonCodes observados.
19. Calcular checksum manifest.
20. Preencher evidence draft local a partir do template IMOB-PILOT-2.
21. Emitir `No-Go` se qualquer criterio No-Go estiver presente.
22. Emitir `Go-for-next-review-only` somente quando todos os gates forem satisfeitos e sem autorizar execucao produtiva.
23. Manter Evidence Index inalterado ate existir evidencia real, fisica, verificavel e indexavel.

## Validacoes planejadas

O harness futuro deve falhar fechado se qualquer validacao abaixo falhar:

| Validacao | Esperado | ReasonCode planejado |
| --- | --- | --- |
| Fixture parse | JSON valido e deterministico. | `IMOB_HARNESS_FIXTURE_PARSE_FAILED` |
| Fixture-only status | Fixture marcada como nao executada. | `IMOB_HARNESS_SPEC_ONLY` |
| PII/sensitive scan | Sem PII real, segredo, token, telefone, email, CPF/CNPJ, endereco real ou payload bruto. | `IMOB_HARNESS_PII_SCAN_FAILED` |
| Tenant/workspace/scope | Presentes, nao vazios e consistentes entre input, handoff, gate e proof. | `IMOB_HARNESS_SCOPE_CONTEXT_INVALID` |
| RBAC fixture-only | Roles esperadas presentes na fixture sem consulta externa. | `IMOB_HARNESS_RBAC_FIXTURE_INVALID` |
| Entitlement fixture-only | Entitlement esperado presente na fixture sem provider ou DB. | `IMOB_HARNESS_ENTITLEMENT_FIXTURE_INVALID` |
| Handoff schema | Snapshot valido contra `chat.vertical_handoff.v1`. | `IMOB_HARNESS_HANDOFF_SCHEMA_INVALID` |
| HITL gate schema | Gate valido contra `hitl.gate_state.v1`. | `IMOB_HARNESS_HITL_GATE_SCHEMA_INVALID` |
| Proof state schema | Proof state valido contra `proof_receipt_bundle_state.v1`. | `IMOB_HARNESS_PROOF_STATE_SCHEMA_INVALID` |
| Render read-only | Render output contem apenas campos read-only esperados. | `IMOB_HARNESS_RENDER_OUTPUT_INVALID` |
| HITL criticality | `riskLevel=critical` nunca passa sem `hitlRequired=true`. | `IMOB_HARNESS_HITL_REQUIRED` |
| sideEffects | Valor agregado permanece `0`. | `IMOB_HARNESS_SIDE_EFFECT_BLOCKED` |
| Provider boundary | `providerExternalCall=0`. | `IMOB_HARNESS_PROVIDER_CALL_BLOCKED` |
| Mutation boundary | `mutationExternalSideEffect=0`. | `IMOB_HARNESS_MUTATION_BOUNDARY_BLOCKED` |
| Storage boundary | `dbWrite=0`, `ledgerWrite=0`, `auditWrite=0`. | `IMOB_HARNESS_DB_LEDGER_AUDIT_BLOCKED` |
| Evidence generation boundary | `receiptGenerated=0`, `bundleGenerated=0`, `proofGenerated=0`. | `IMOB_HARNESS_EVIDENCE_GENERATION_BLOCKED` |
| Frontend proof boundary | `proofFabricatedInFrontend=0`. | `IMOB_HARNESS_PROOF_FABRICATION_BLOCKED` |
| Launcher boundary | `chatLauncherBusinessRule=0`. | `IMOB_HARNESS_CHAT_LAUNCHER_RULE_BLOCKED` |
| ReasonCode coverage | `missingReasonCode=0`. | `IMOB_HARNESS_REASON_CODE_REQUIRED` |
| Checksum manifest | Hashes consistentes entre artefatos futuros e manifest. | `IMOB_HARNESS_CHECKSUM_MISMATCH` |

## Metricas obrigatorias

O harness futuro deve capturar no minimo:

| Metrica | Esperado |
| --- | ---: |
| `fixtureParsed` | `1` |
| `piiScanFailures` | `0` |
| `handoffSnapshotBuilt` | `1` |
| `handoffSnapshotValidationFailures` | `0` |
| `hitlGateStateBuilt` | `1` |
| `hitlGateStateValidationFailures` | `0` |
| `proofReceiptBundleStateBuilt` | `1` |
| `proofReceiptBundleStateValidationFailures` | `0` |
| `renderSurfaceSerialized` | `1` |
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

## ReasonCodes esperados

ReasonCodes minimos para a fase futura:

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
- `IMOB_HARNESS_NO_GO`.
- `IMOB_HARNESS_GO_FOR_NEXT_REVIEW_ONLY`.

ReasonCodes de fixture/template herdados que devem continuar observaveis quando aplicaveis:

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

## Criterios No-Go

Qualquer item abaixo deve produzir `No-Go`:

- Fixture ausente, invalida ou nao parseavel.
- PII real ou sensivel detectado em input, output, render output ou evidence draft.
- Secret produtivo, token, credential, webhook produtivo ou provider payload real detectado.
- Tenant/workspace/scope ausente, vazio ou inconsistente.
- RBAC fixture-only ausente ou invalido.
- Entitlement fixture-only ausente ou invalido.
- Handoff snapshot invalido.
- HITL gate state invalido.
- Proof receipt bundle state invalido.
- Render output invalido ou com comportamento nao read-only.
- `riskLevel=critical` sem `hitlRequired=true`.
- Qualquer critical action executada.
- Qualquer critical action sem HITL.
- Qualquer side effect.
- Qualquer provider call.
- Qualquer mutation external side effect.
- Qualquer DB write, ledger write ou audit write.
- Receipt generation, bundle generation ou proof generation.
- Proof fabricado no frontend.
- Policy/risk/entitlement decidida no frontend.
- Regra de negocio adicionada ao `ChatAgentLauncher`.
- ReasonCode ausente em path aceito, bloqueado ou degradado.
- Checksum inconsistente.
- CI vermelho quando uma fase futura registrar CI.
- Evidence Index atualizado automaticamente.
- Tentativa de promover `Go-for-next-review-only` como autorizacao produtiva.

## Decisao de nao implementacao

Nesta fase:

- nao cria script executavel;
- nao registra package script;
- nao altera CI;
- nao executa harness;
- nao executa dry-run;
- nao inicia shadow;
- nao ativa pilot;
- nao ativa small rollout;
- nao cria API route;
- nao cria provider externo;
- nao usa secret produtivo;
- nao cria webhook produtivo;
- nao altera frontend;
- nao altera `ChatAgentLauncher`;
- nao altera runtime;
- nao altera engine;
- nao cria mutacao;
- nao escreve DB;
- nao escreve ledger;
- nao escreve audit;
- nao gera receipt;
- nao gera bundle;
- nao gera proof;
- nao declara Receipt Canon fechado;
- nao declara IMOB operacionalmente fechado;
- nao altera schema Prisma;
- nao altera seeds/migrations;
- nao altera workflows;
- nao altera package scripts.

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

## Status final

Status: parcial/evidenciado localmente; aguardando PR/CI remoto.
