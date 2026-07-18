# IMOB-PILOT-3 - Shadow Dry-Run Harness Plan

Status: parcial/evidenciado localmente; aguardando PR/CI remoto.

## Resumo

IMOB-PILOT-3 define um plano documental para um futuro harness de shadow dry-run IMOB. Esta entrega nao cria script executavel, nao registra package script, nao altera CI, nao executa harness, nao inicia shadow real, nao executa dry-run real, nao ativa pilot ou small rollout, nao executa acao critica, nao gera receipt, nao gera bundle, nao fabrica proof, nao escreve DB, ledger ou audit, nao cria provider externo, nao altera frontend, nao altera `ChatAgentLauncher`, nao altera runtime, engine ou API e nao declara IMOB operacionalmente fechado.

O plano existe para orientar uma fase futura separada que possa consumir a fixture de IMOB-PILOT-2, preencher o template de evidencia de IMOB-PILOT-2, validar metricas obrigatorias, bloquear qualquer No-Go e preservar `sideEffects=0`.

## Pre-condicao registrada

Pre-condicao fornecida e confirmada antes desta alteracao:

- IMOB-PILOT-2 mergeado em `1fa9992179cb71062808488fcb55a3abd744a51c`.
- `CI Monorepo` run `29638308925`: `completed success`.
- `IMOB Worker Mutation E2E` run `29638308918`: `completed success`.
- Worktree limpa antes das alteracoes.

Pre-check local executado antes de alteracao:

- `git switch main`: ja em `main`.
- `git pull --ff-only origin main`: `Already up to date`.
- `git fetch --prune`: concluido.
- `git status --short`: limpo.
- `git log --oneline -5`: topo `1fa9992 Merge pull request #333 from 5906375/docs/imob-pilot-2-dry-run-fixture-template`.

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
- `ops/evidence/templates/imob-pilot-2-shadow-dry-run-evidence-template.md`.
- `apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json`.
- `docs/proposals/arch-impl-1-read-only-handoff-snapshot-producer.md`.
- `docs/proposals/arch-impl-2-universal-chat-render-surface-read-only.md`.
- `docs/proposals/arch-impl-3-read-only-gate-proof-adapters.md`.
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
- O roadmap exige que evidencia sem execucao real permaneça parcial/proposta e que Evidence Index aponte apenas para arquivos existentes e evidencias geradas por execucao real em `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md:34` e `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md:39`.
- A arquitetura do chat e agent-driven: agente define, engine executa e launcher renderiza em `AGENTS.md:5` e `AGENTS.md:7`.
- O `ChatAgentLauncher` nao deve decidir especialista, inventar handoff, definir quick replies ou concentrar regras cognitivas/de negocio em `docs/architecture/agent-chat-runtime.md:60`.
- O rollout de verticais segue `shadow -> pilot -> small` e depende de gates e evidencias, conforme `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md:143` e `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md:266`.
- IMOB-PILOT-0 e documental e nao inicia shadow/pilot/small, nao executa acao critica, nao gera receipt/bundle/proof/ledger/audit e nao altera frontend/runtime/API em `docs/proposals/imob-pilot-0-shadow-readiness-checklist.md:5`.
- IMOB-PILOT-0 define gates de tenant/workspace/scope, RBAC, entitlement, policy backend, HITL, proof, PII, reasonCode, fail-closed e `sideEffects=0` em `docs/proposals/imob-pilot-0-shadow-readiness-checklist.md:109`.
- IMOB-PILOT-1 define evidencia futura de dry-run sem shadow real, dry-run real, pilot, small, acao critica, receipt, bundle, DB, ledger, audit ou provider externo em `docs/proposals/imob-pilot-1-shadow-dry-run-evidence-plan.md:5`.
- IMOB-PILOT-1 exige que a captura futura produza snapshots, gate, proof, render output, reasonCodes, metricas, checksums, No-Go/Go e prova de isolamento em `docs/proposals/imob-pilot-1-shadow-dry-run-evidence-plan.md:136`.
- IMOB-PILOT-1 lista metricas obrigatorias com esperado `0` para `sideEffects`, provider call, duplicate side effects, audit gap, critical action without HITL, proof fabricated, frontend policy, launcher business rule, PII leakage e missing reasonCode em `docs/proposals/imob-pilot-1-shadow-dry-run-evidence-plan.md:153`.
- IMOB-PILOT-1 bloqueia chamada a `/runs/:id/bundle`, escrita em ledger/audit/DB e receipt/bundle/proof gerado por readiness/dry-run em `docs/proposals/imob-pilot-1-shadow-dry-run-evidence-plan.md:172`.
- IMOB-PILOT-2 criou fixture, template e proposta sem transformar a preparacao em dry-run real em `docs/proposals/imob-pilot-2-dry-run-fixture-pack-evidence-template.md:45`.
- A fixture IMOB-PILOT-2 declara dados sinteticos/sanitizados e ausencia de PII/sensiveis/secret/webhook em `apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json:5`.
- A fixture IMOB-PILOT-2 fixa `dryRunExecutedByThisChange=0`, `shadowStartedByThisChange=0`, `pilotStartedByThisChange=0`, `providerExternalCall=0`, `dbWrite=0`, `ledgerWrite=0`, `auditWrite=0`, `receiptGenerated=0`, `bundleGenerated=0` e `proofGenerated=0` em `apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json:14`.
- A fixture IMOB-PILOT-2 fornece input snapshot com `tenantId`, `workspaceId`, `scope`, `verticalId`, `intentId`, `reasonCode`, `riskLevel` e `hitlRequired` em `apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json:43`.
- A fixture IMOB-PILOT-2 fornece gate read-only esperado com `approvalState=blocked`, `hitlRequired=true`, `reasonCode=APPROVAL_REQUIRED` e acoes permitidas apenas `view_details` e `request_review` em `apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json:96`.
- A fixture IMOB-PILOT-2 fornece proof state read-only esperado com `proofKind=runtime_state`, `proofStatus=not_required` e `reasonCode=PROOF_UNAVAILABLE_READ_ONLY`, sem `receiptId`, `bundleId` ou `ledgerRef` em `apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json:119`.
- O template IMOB-PILOT-2 exige preconditions sem provider produtivo, secret produtivo, webhook produtivo e mutation path em `ops/evidence/templates/imob-pilot-2-shadow-dry-run-evidence-template.md:14`.
- O template IMOB-PILOT-2 exige observed metrics, checksums, decisao No-Go/Go, `sideEffects=0`, `providerExternalCall=0`, `proofFabricatedInFrontend=0`, no mutation e no receipt/bundle/proof generation em `ops/evidence/templates/imob-pilot-2-shadow-dry-run-evidence-template.md:112`.
- `chat.vertical_handoff.v1` exige `version`, `handoffId`, `tenantId`, `workspaceId`, `scope`, `userId`, `verticalId`, `intentId`, `handoffMessage`, `reasonCode`, `riskLevel` e `hitlRequired` em `contracts/chat/chat.vertical_handoff.v1.schema.json:6`.
- `hitl.gate_state.v1` exige `version`, `gateId`, `gateType`, `tenantId`, `workspaceId`, `scope`, `approvalState`, `hitlRequired`, `riskLevel`, `reasonCode`, `verticalId` e `message` em `contracts/chat/hitl.gate_state.v1.schema.json:6`.
- `proof_receipt_bundle_state.v1` exige `version`, `proofKind`, `proofStatus`, `runId`, `verticalId`, `tenantId`, `workspaceId`, `scope`, `source`, `reasonCode` e `accessibilityLabel` em `contracts/chat/proof_receipt_bundle_state.v1.schema.json:6`.
- `buildChatVerticalHandoffSnapshot` valida campos obrigatorios, bloqueia `critical` sem HITL e retorna `sideEffects: 0` em `apps/api/src/services/chatVerticalHandoffSnapshot.ts:221`.
- `buildReadOnlyHitlGateState` valida campos obrigatorios, bloqueia `critical` sem HITL e retorna `readOnly: true` com `sideEffects: 0` em `apps/api/src/services/chatGateProofAdapters.ts:329`.
- `buildReadOnlyProofReceiptBundleState` valida campos obrigatorios, normaliza `unavailable` para `not_required`, preserva refs opcionais e retorna `readOnly: true` com `sideEffects: 0` em `apps/api/src/services/chatGateProofAdapters.ts:430`.
- `ChatVerticalHandoffSurface` renderiza estado read-only, reasonCode, HITL e render hints sem executar aprovacao em `apps/web/src/components/chat/ChatVerticalHandoffSurface.tsx:38`.
- `package.json` ja registra os scripts canonicos `test:chat-vertical-handoff-snapshot`, `test:chat-vertical-handoff-surface`, `test:chat-gate-proof-adapters` e `check:arch-chat-contracts` em `package.json:101`.
- O CI `ChatEngineRegression` executa gates de render-only, runtime debt, presentation snapshot, contratos fisicos, snapshot test e chat engine regression em `.github/workflows/ci.yml:257`.
- O Evidence Index contem evidencias IMOB reais de Command Center, piloto controlado, rotas Command Center e APE shadow/pilot com hard metrics em `docs/EVIDENCE_INDEX.md:162`, `docs/EVIDENCE_INDEX.md:172` e `docs/EVIDENCE_INDEX.md:76`.

## Objetivo do futuro harness

Um futuro harness, em fase separada e autorizada, deve:

1. Consumir exclusivamente a fixture sintetica/sanitizada de IMOB-PILOT-2.
2. Produzir evidencia usando o template de IMOB-PILOT-2.
3. Validar contratos `chat.vertical_handoff.v1`, `hitl.gate_state.v1` e `proof_receipt_bundle_state.v1`.
4. Serializar metricas obrigatorias observadas.
5. Serializar reasonCodes observados.
6. Calcular manifest de checksums apenas da evidencia futura.
7. Emitir decisao `No-Go` ou `Go-for-next-review-only`.
8. Bloquear execucao quando qualquer No-Go ocorrer.
9. Manter `sideEffects=0`.
10. Nao atualizar Evidence Index automaticamente.

## Entradas planejadas

Entradas permitidas para o futuro harness:

- Fixture sintetica/sanitizada `apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json`.
- Contrato `contracts/chat/chat.vertical_handoff.v1.schema.json`.
- Contrato `contracts/chat/hitl.gate_state.v1.schema.json`.
- Contrato `contracts/chat/proof_receipt_bundle_state.v1.schema.json`.
- Template `ops/evidence/templates/imob-pilot-2-shadow-dry-run-evidence-template.md`.
- Builders/adapters read-only existentes: `buildChatVerticalHandoffSnapshot`, `buildReadOnlyHitlGateState` e `buildReadOnlyProofReceiptBundleState`.
- Componente read-only `ChatVerticalHandoffSurface` somente como contrato de render output esperado, sem alterar frontend.
- Nenhuma credencial produtiva.
- Nenhum provider externo.
- Nenhum webhook produtivo.
- Nenhum payload real.
- Nenhum dado pessoal real.

## Saidas planejadas

Saidas futuras permitidas, somente quando houver fase de execucao autorizada:

- Evidence draft local derivado do template IMOB-PILOT-2.
- Metrics observed.
- ReasonCodes observed.
- Checksum manifest.
- No-Go/Go decision.
- Registro explicito de `sideEffects=0`.
- Registro explicito de `providerExternalCall=0`.
- Registro explicito de `mutationExternalSideEffect=0`.
- Registro explicito de `proofFabricatedInFrontend=0`.
- Registro explicito de ausencia de API/provider/DB/ledger/audit.
- Registro explicito de ausencia de receipt/bundle/proof generation.

Saidas proibidas:

- Evidence Index automatico.
- Receipt gerado.
- Bundle gerado/exportado.
- Proof fabricado.
- Ledger/audit write.
- DB write.
- Provider call.
- API route nova.
- Package script novo.
- CI job novo.

## Gates planejados

O futuro harness deve falhar fechado se qualquer gate abaixo nao passar:

| Gate | Criterio | ReasonCode planejado |
| --- | --- | --- |
| Fixture parse | JSON valido, deterministicamente parseavel, sem campos inesperados para a fase. | `IMOB_HARNESS_FIXTURE_PARSE_FAILED` |
| PII scan | Sem PII real, secret, token, telefone, email, CPF/CNPJ, endereco real ou payload bruto. | `IMOB_HARNESS_PII_SCAN_FAILED` |
| Tenant/workspace/scope | `tenantId`, `workspaceId` e `scope` presentes, nao vazios e consistentes. | `IMOB_HARNESS_SCOPE_CONTEXT_INVALID` |
| RBAC fixture-only | RBAC simulado apenas como campo esperado da fixture, sem consulta externa. | `IMOB_HARNESS_RBAC_FIXTURE_INVALID` |
| Entitlement fixture-only | Entitlement simulado apenas como campo esperado da fixture, sem provider ou DB. | `IMOB_HARNESS_ENTITLEMENT_FIXTURE_INVALID` |
| Handoff schema | Handoff snapshot valida contra `chat.vertical_handoff.v1`. | `IMOB_HARNESS_HANDOFF_SCHEMA_INVALID` |
| HITL gate schema | HITL gate state valida contra `hitl.gate_state.v1`. | `IMOB_HARNESS_HITL_GATE_SCHEMA_INVALID` |
| Proof state schema | Proof state valida contra `proof_receipt_bundle_state.v1`. | `IMOB_HARNESS_PROOF_STATE_SCHEMA_INVALID` |
| Render read-only | Render output contem somente dados read-only esperados. | `IMOB_HARNESS_RENDER_OUTPUT_INVALID` |
| sideEffects | Valor agregado permanece `0`. | `IMOB_HARNESS_SIDE_EFFECT_BLOCKED` |
| Provider boundary | `providerExternalCall=0`. | `IMOB_HARNESS_PROVIDER_CALL_BLOCKED` |
| Proof boundary | `proofFabricatedInFrontend=0`. | `IMOB_HARNESS_PROOF_FABRICATION_BLOCKED` |
| Launcher boundary | `chatLauncherBusinessRule=0`. | `IMOB_HARNESS_CHAT_LAUNCHER_RULE_BLOCKED` |
| ReasonCode coverage | `missingReasonCode=0`. | `IMOB_HARNESS_REASON_CODE_REQUIRED` |
| Mutation/API/provider/DB/ledger/audit | Nenhuma chamada mutacional, API nova, provider, DB write, ledger write ou audit write. | `IMOB_HARNESS_MUTATION_BOUNDARY_BLOCKED` |
| Receipt/bundle/proof generation | Nenhum receipt, bundle ou proof gerado pelo harness. | `IMOB_HARNESS_EVIDENCE_GENERATION_BLOCKED` |
| Checksum manifest | Hashes consistentes entre artefatos futuros e manifest. | `IMOB_HARNESS_CHECKSUM_MISMATCH` |

## Metricas planejadas

O harness futuro deve capturar, no minimo:

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

## ReasonCodes planejados

ReasonCodes minimos para o futuro harness:

- `IMOB_HARNESS_PLAN_ONLY`.
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
- `IMOB_HARNESS_PROOF_FABRICATION_BLOCKED`.
- `IMOB_HARNESS_CHAT_LAUNCHER_RULE_BLOCKED`.
- `IMOB_HARNESS_REASON_CODE_REQUIRED`.
- `IMOB_HARNESS_MUTATION_BOUNDARY_BLOCKED`.
- `IMOB_HARNESS_EVIDENCE_GENERATION_BLOCKED`.
- `IMOB_HARNESS_CHECKSUM_MISMATCH`.
- `IMOB_HARNESS_NO_GO`.
- `IMOB_HARNESS_GO_FOR_NEXT_REVIEW_ONLY`.

## Criterios No-Go

Qualquer item abaixo deve produzir `No-Go`:

- Qualquer side effect.
- Qualquer provider call.
- Qualquer DB write, ledger write ou audit write.
- Receipt generation, bundle generation ou proof generation.
- Proof fabricado no frontend.
- PII/sensivel sem masking ou dado real na fixture/output.
- `riskLevel=critical` sem `hitlRequired=true`.
- Critical action executada.
- Critical action sem HITL.
- Policy/risk/entitlement decidida no frontend.
- Regra de negocio adicionada ao `ChatAgentLauncher`.
- Schema invalido.
- Tenant/workspace/scope ausente, vazio ou inconsistente.
- RBAC/entitlement ausente do modelo fixture-only.
- ReasonCode ausente em path aceito, bloqueado ou degradado.
- Hash/checksum inconsistente.
- CI vermelho.
- Evidencia nao indexavel quando execucao real futura ocorrer.
- Tentativa de atualizar Evidence Index automaticamente.
- Tentativa de registrar script ou CI para esta fase sem autorizacao separada.

## Sequencia futura recomendada

Esta sequencia e apenas design. Nao e executada por IMOB-PILOT-3.

1. Validar que uma fase futura autorizou explicitamente o harness.
2. Ler fixture IMOB-PILOT-2.
3. Rodar fixture parse e PII scan.
4. Validar tenant/workspace/scope.
5. Construir handoff snapshot read-only.
6. Validar handoff contra `chat.vertical_handoff.v1`.
7. Construir HITL gate state read-only.
8. Validar HITL gate contra `hitl.gate_state.v1`.
9. Construir proof state read-only sem receipt/bundle/ledger/proof gerado.
10. Validar proof state contra `proof_receipt_bundle_state.v1`.
11. Serializar render output read-only esperado.
12. Capturar metricas observadas.
13. Capturar reasonCodes observados.
14. Calcular checksum manifest.
15. Preencher template IMOB-PILOT-2 em evidence draft local.
16. Emitir decisao `No-Go` ou `Go-for-next-review-only`.
17. Bloquear qualquer promocao se houver No-Go.
18. Atualizar Evidence Index apenas manualmente e somente se houver evidencia real, fisica, verificavel e indexavel.

## Ponto de registro futuro

Um futuro harness poderia ser registrado em fase propria como script local ou check canônico somente depois de PR separado autorizar implementacao. Possiveis pontos, ainda nao autorizados:

- `package.json` como `test:imob-shadow-dry-run-harness`, se e somente se o harness for implementado como teste sem side effects.
- CI `ChatEngineRegression` ou job IMOB dedicado, se e somente se a fase futura exigir cobertura remota.
- `ops/evidence/latest/` para evidencia real gerada por execucao autorizada.
- `docs/EVIDENCE_INDEX.md` somente apos evidencia real existir e provar a execucao.

IMOB-PILOT-3 nao cria nenhum desses registros.

## Decisao de nao implementacao

Nesta fase:

- nao cria script executavel;
- nao registra package script;
- nao altera CI;
- nao executa harness;
- nao inicia shadow real;
- nao executa dry-run real;
- nao ativa pilot;
- nao ativa small rollout;
- nao cria API route;
- nao cria provider externo;
- nao altera frontend;
- nao altera `ChatAgentLauncher`;
- nao cria mutacao;
- nao escreve DB;
- nao escreve ledger/audit;
- nao gera receipt;
- nao gera bundle;
- nao fabrica proof;
- nao declara Receipt Canon fechado;
- nao declara IMOB operacionalmente fechado;
- nao declara rollout final;
- nao altera schema Prisma;
- nao altera seeds/migrations;
- nao usa secrets produtivos;
- nao cria webhook produtivo;
- nao inclui PII real.

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
