# IMOB-PILOT-2 — Dry-Run Fixture Pack / Evidence Template

Status: proposta/parcial evidenciada localmente; aguardando PR/CI remoto.
## Resumo

IMOB-PILOT-2 cria um pacote documental e deterministico para uma futura validacao shadow dry-run IMOB. Esta entrega nao executa shadow, nao executa dry-run, nao inicia pilot, nao inicia small rollout, nao executa acao critica, nao gera receipt, nao gera bundle, nao grava DB, ledger ou audit, nao cria provider externo e nao declara IMOB operacionalmente fechado.

O pacote criado e composto por:

- fixture sanitizada: `apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json`;
- template de evidencia futura: `ops/evidence/templates/imob-pilot-2-shadow-dry-run-evidence-template.md`;
- esta proposta de controle: `docs/proposals/imob-pilot-2-dry-run-fixture-pack-evidence-template.md`.

## Pre-condicao

Pre-condicao IMOB-PILOT-1 confirmada antes das edicoes:

- IMOB-PILOT-1 mergeado em `main` no commit `c1bafa8418985331f5bf561def5c0dd1dcbcdf32`;
- `CI Monorepo` concluido com sucesso no run `29637697325`;
- `IMOB Worker Mutation E2E` concluido com sucesso no run `29637697333`;
- worktree limpa antes da criacao dos artefatos.

## Baseline lida

- `CODEX.md`;
- `IA_EIAH.md`;
- `AGENTS.md`;
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`;
- `docs/architecture/agent-chat-runtime.md`;
- `docs/EVIDENCE_INDEX.md`;
- `docs/proposals/imob-pilot-0-shadow-readiness-checklist.md`;
- `docs/proposals/imob-pilot-1-shadow-dry-run-evidence-plan.md`;
- `docs/proposals/arch-impl-1-read-only-handoff-snapshot-producer.md`;
- `docs/proposals/arch-impl-2-universal-chat-render-surface-read-only.md`;
- `docs/proposals/arch-impl-3-read-only-gate-proof-adapters.md`;
- `contracts/chat/chat.vertical_handoff.v1.schema.json`;
- `contracts/chat/hitl.gate_state.v1.schema.json`;
- `contracts/chat/proof_receipt_bundle_state.v1.schema.json`;
- `apps/api/src/services/chatVerticalHandoffSnapshot.ts`;
- `apps/api/src/services/chatGateProofAdapters.ts`;
- `apps/web/src/components/chat/ChatVerticalHandoffSurface.tsx`;
- `package.json`;
- `.github/workflows/ci.yml`.

## Problema resolvido

IMOB-PILOT-1 definiu como a evidencia futura deve ser coletada, mas ainda faltava um insumo canonico e sanitizado para orientar a execucao futura sem depender de dados reais. IMOB-PILOT-2 fecha esse gap criando fixture e template sem transformar a preparacao em dry-run real.

## Fixture

A fixture `imob-pilot-2-shadow-dry-run.fixture.json` modela um caso sintetico de shadow dry-run read-only com:

- `tenantId`, `workspaceId`, `userId`, `scope`, `verticalId` e `intentId` sinteticos;
- `handoffSnapshot` compativel com `chat.vertical_handoff.v1`;
- `hitlGateState` compativel com `hitl.gate_state.v1`;
- `proofReceiptBundleState` compativel com `proof_receipt_bundle_state.v1`;
- `renderExpectation` read-only para `ChatVerticalHandoffSurface`;
- `expectedMetrics` com side effects, provider, DB, ledger, audit, receipt, bundle e proof generation em `0`;
- `expectedReasonCodes` para orientar validacao futura;
- `futureChecksumPlaceholders` explicitamente marcados como placeholders, nao evidencias.

Nao ha nome real, telefone, email, documento fiscal, endereco real, segredo, webhook, token produtivo, receipt real, bundle real, ledger real ou proof real na fixture.

## Template de evidencia futura

O template `imob-pilot-2-shadow-dry-run-evidence-template.md` define o formato minimo para uma execucao futura, incluindo:

- identificacao da execucao;
- pre-condicoes;
- fixture usada;
- input snapshot;
- handoff snapshot;
- gate state read-only;
- proof state read-only;
- render output;
- reasonCodes;
- metricas observadas;
- hashes/checksums calculados somente no futuro;
- decisao Go/No-Go;
- confirmacoes de `sideEffects=0`, `providerExternalCall=0`, `proofFabricatedInFrontend=0`, ausencia de mutacao e ausencia de receipt/bundle/proof generation.

O template nao e evidencia executada e nao deve ser indexado em `docs/EVIDENCE_INDEX.md` ate existir execucao real verificavel.

## Dados sinteticos e sanitizados

Todos os identificadores sao controlados e sinteticos. O campo de contexto imobiliario usa labels genericos como `synthetic-property-ref-001`, sem localizacao real, pessoa real, telefone, email, CPF, CNPJ, contrato real, anexo real ou segredo.

## Metricas esperadas

As metricas esperadas para a futura execucao sao:

| Metrica | Valor esperado |
| --- | --- |
| `handoffSnapshotBuilt` | `1` |
| `handoffSnapshotValidationFailures` | `0` |
| `hitlGateStateBuilt` | `1` |
| `proofReceiptBundleStateBuilt` | `1` |
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
| `criticalActionExecuted` | `0` |
| `piiLeakageDetected` | `0` |
| `frontendPolicyDecision` | `0` |
| `dryRunExecutedByThisChange` | `0` |
| `shadowStartedByThisChange` | `0` |
| `pilotStartedByThisChange` | `0` |
| `smallRolloutStartedByThisChange` | `0` |

## ReasonCodes esperados

- `IMOB_PILOT_2_FIXTURE_PACK_ONLY`;
- `CHAT_VERTICAL_HANDOFF_TO_COCKPIT`;
- `APPROVAL_REQUIRED`;
- `PROOF_UNAVAILABLE_READ_ONLY`;
- `NO_PROVIDER_EXTERNAL_CALL`;
- `NO_MUTATION_EXTERNAL_SIDE_EFFECT`;
- `NO_DB_LEDGER_AUDIT_WRITE`;
- `NO_RECEIPT_BUNDLE_PROOF_GENERATION`;
- `NO_PII_LEAKAGE`;
- `NO_SHADOW_DRY_RUN_EXECUTION`;
- `NO_PILOT_SMALL_ROLLOUT_EXECUTION`.

## Hashes/checksums

Esta rodada nao calcula hashes de evidencia real. A fixture e o template carregam placeholders para:

- checksum da fixture;
- checksum do input snapshot;
- checksum do handoff snapshot;
- checksum do gate state;
- checksum do proof state;
- checksum do render output serializado;
- checksum do pacote de evidencia futuro.

Esses valores devem ser calculados somente na execucao futura e registrados em evidencia real, caso o dry-run seja autorizado em fase posterior.

## Nao-autorizacao

IMOB-PILOT-2 nao autoriza:

- shadow real;
- dry-run real;
- pilot;
- small rollout;
- provider externo;
- secret produtivo;
- webhook produtivo;
- mutacao;
- DB write;
- ledger write;
- audit write;
- receipt generation;
- bundle generation;
- proof generation;
- acao critica;
- alteracao de frontend;
- alteracao de `ChatAgentLauncher`;
- alteracao de runtime, engine ou API.

## Status final

Status: proposta/parcial evidenciada localmente; aguardando PR/CI remoto.
