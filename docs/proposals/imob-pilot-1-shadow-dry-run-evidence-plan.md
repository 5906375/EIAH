# IMOB-PILOT-1 — Shadow Dry-Run Evidence Plan

**Status:** parcial/evidenciado localmente; aguardando PR/CI remoto.

## 1. Objetivo

IMOB-PILOT-1 define o plano de evidência para um futuro shadow dry-run IMOB. Esta entrega não inicia shadow real, não executa dry-run, não ativa piloto, não ativa small rollout, não executa ação crítica, não gera receipt, não gera bundle, não escreve DB, ledger ou audit, não cria provider externo e não declara IMOB operacionalmente fechado.

O plano existe para tornar verificável, em uma fase futura separada, como coletar evidências de um dry-run read-only sem fabricar proof, sem side effects e sem mover policy para o frontend ou para o `ChatAgentLauncher`.

## 2. Pré-condição registrada

Pré-condição fornecida para esta fase:

- IMOB-PILOT-0 mergeado em `72f4be5cce08e394330d14cca2bb28a4c53001c9`.
- `CI Monorepo` run `29637231622`: `completed success`.
- `IMOB Worker Mutation E2E` run `29637231653`: `completed success`.
- Job `ImobWorkerMutationE2E`: `completed success`.

Pré-check local executado antes de alteração:

- `git switch main`: já em `main`.
- `git pull --ff-only origin main`: `Already up to date`.
- `git fetch --prune`: concluído.
- `git status --short`: limpo.
- `git log --oneline -5`: topo `72f4be5 Merge pull request #331 from 5906375/docs/imob-pilot-0-shadow-readiness-checklist`.

## 3. Fontes lidas

- `CODEX.md`.
- `IA_EIAH.md`.
- `AGENTS.md`.
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`.
- `docs/architecture/agent-chat-runtime.md`.
- `docs/EVIDENCE_INDEX.md`.
- `docs/proposals/imob-pilot-0-shadow-readiness-checklist.md`.
- `docs/proposals/arch-impl-1-read-only-handoff-snapshot-producer.md`.
- `docs/proposals/arch-impl-2-universal-chat-render-surface-read-only.md`.
- `docs/proposals/arch-impl-3-read-only-gate-proof-adapters.md`.
- `contracts/chat/chat.vertical_handoff.v1.schema.json`.
- `contracts/chat/hitl.gate_state.v1.schema.json`.
- `contracts/chat/proof_receipt_bundle_state.v1.schema.json`.
- `apps/api/src/services/chatVerticalHandoffSnapshot.ts`.
- `apps/api/src/services/chatGateProofAdapters.ts`.
- `apps/web/src/components/chat/ChatVerticalHandoffSurface.tsx`.
- `apps/api/src/routes/imob.ts`.
- `apps/api/src/routes/runs.ts`.
- `apps/api/src/routes/governance.ts`.
- `apps/api/src/services/imob/imobApprovalGate.ts`.
- `apps/api/src/services/imob/orchestrator/imobProofGate.ts`.
- `apps/api/src/services/imob/imobArtifactCapabilities.ts`.
- `apps/api/src/services/imob/intake/imobContractPiiMasker.ts`.
- `apps/api/src/middlewares/requireScope.ts`.
- `apps/api/src/tests/imob-approval-gate.test.ts`.
- `apps/api/src/tests/chat-gate-proof-adapters.test.ts`.
- `package.json`.
- `.github/workflows/ci.yml`.
- `ops/evidence/`.

## 4. Estado atual observado

- IMOB-PILOT-0 é checklist documental e declara que não inicia shadow/pilot/small, não executa ação crítica, não gera receipt/bundle/proof/ledger/audit e não altera frontend/runtime/API em `docs/proposals/imob-pilot-0-shadow-readiness-checklist.md:5`.
- `/app/chat`, `/app/imob/chat` e `/app/imob/dashboard` são superfícies existentes mapeadas por IMOB-PILOT-0 com referências a `apps/web/src/App.tsx:299`, `apps/web/src/App.tsx:345` e `apps/web/src/App.tsx:357` em `docs/proposals/imob-pilot-0-shadow-readiness-checklist.md:64`.
- O contrato `chat.vertical_handoff.v1` exige `tenantId`, `workspaceId`, `scope`, `userId`, `verticalId`, `intentId`, `handoffMessage`, `reasonCode`, `riskLevel` e `hitlRequired` em `contracts/chat/chat.vertical_handoff.v1.schema.json:6`.
- O contrato `hitl.gate_state.v1` exige `tenantId`, `workspaceId`, `scope`, `approvalState`, `hitlRequired`, `riskLevel`, `reasonCode`, `verticalId` e `message` em `contracts/chat/hitl.gate_state.v1.schema.json:6`.
- O contrato `proof_receipt_bundle_state.v1` exige `runId`, `verticalId`, `tenantId`, `workspaceId`, `scope`, `source`, `reasonCode` e `accessibilityLabel` em `contracts/chat/proof_receipt_bundle_state.v1.schema.json:6`.
- `buildChatVerticalHandoffSnapshot` valida campos obrigatórios, falha fechado para risco crítico sem HITL e retorna `sideEffects: 0` em `apps/api/src/services/chatVerticalHandoffSnapshot.ts:221`.
- `buildReadOnlyHitlGateState` exige campos de gate, bloqueia risco crítico sem `hitlRequired=true` e retorna `readOnly: true` com `sideEffects: 0` em `apps/api/src/services/chatGateProofAdapters.ts:329`.
- `buildReadOnlyProofReceiptBundleState` exige `runId`, tenant/workspace/scope, source, reasonCode e accessibility label, preserva refs opcionais e retorna `readOnly: true` com `sideEffects: 0` em `apps/api/src/services/chatGateProofAdapters.ts:430`.
- `ChatVerticalHandoffSurface` renderiza snapshot read-only, estado vazio neutro, reasonCode e aviso visual de HITL sem executar aprovação em `apps/web/src/components/chat/ChatVerticalHandoffSurface.tsx:38`.
- O CI contém `ChatEngineRegression`, `Run chat launcher render-only gate`, `Run ARCH chat physical contracts gate`, `Run chat vertical handoff snapshot test`, `Run chat engine regression suite`, `OrphanTestsRegression` e `Run orphan tests regression gate` em `.github/workflows/ci.yml:258`.
- `package.json` expõe os scripts `test:chat-vertical-handoff-snapshot`, `test:chat-vertical-handoff-surface`, `test:chat-gate-proof-adapters` e `check:arch-chat-contracts` em `package.json:101`.
- O approval gate IMOB bloqueia HIGH/CRITICAL sem aprovação válida, expirada, inválida ou fora de escopo em `apps/api/src/services/imob/imobApprovalGate.ts:45`.
- Os testes de approval gate cobrem HIGH/CRITICAL sem approval, approval expirado, mismatch de workspace/tenant e payload inválido em `apps/api/src/tests/imob-approval-gate.test.ts:6`.
- O proof gate IMOB bloqueia proof obrigatório ausente com `MISSING_REQUIRED_PROOF` em `apps/api/src/services/imob/orchestrator/imobProofGate.ts:33`.
- RBAC HTTP retorna 403 com `reasonCode` quando `checkScopePermission` nega escopo em `apps/api/src/middlewares/requireScope.ts:20`.
- `resolveImobEntitlements` lê políticas/instalações por tenant/workspace e deriva `REAL_ESTATE_CORE`, `IMOB_INSTALLED` e `IMOB_INSTALLATION_STATUS` em `apps/api/src/routes/imob.ts:1402`.
- `ensureImobWorkspacePermission` falha fechado com `IMOB_PERMISSION_DENIED` quando a permissão IMOB do workspace falta em `apps/api/src/routes/imob.ts:1484`.
- `resolveImobArtifactCapabilities` bloqueia chat/case/receipt/bundle quando contexto, estágio, permissão ou `reports.view` estão ausentes em `apps/api/src/services/imob/imobArtifactCapabilities.ts:65`.
- `funnel-health` consulta casos por `tenantId`, `workspaceId`, janela e produz summary, status, reasonCodes e top blocked runs em `apps/api/src/routes/imob.ts:2357`.
- `blocked-runs` consulta runs por tenant/workspace/status, agrega reasonCodes de eventos e expõe refs de proof somente quando `txId`/`criticalHash` existem em `apps/api/src/routes/imob.ts:2466`.
- `/runs/:id/bundle` executa `buildRunEvidenceBundle` e registra ledger `bundle.exported.v1` em `apps/api/src/routes/runs.ts:1473`; por isso não pode ser chamado por um dry-run read-only.
- `/ledger/:txId` é rota de leitura protegida por `ledger.view` e valida `txId` antes de consultar run em `apps/api/src/routes/governance.ts:432`.
- `maskContractPii` mascara e-mail, RG, CNH, CNPJ, CPF e telefone e declara que deve rodar antes de log, evidence payload ou draft storage em `apps/api/src/services/imob/intake/imobContractPiiMasker.ts:1`.
- Os testes de adapters confirmam `sideEffects=0`, falha fechada para tenant/workspace/scope ausentes, ausência de handlers de approve/reject/delegate/escalate e ausência de API/provider/DB/ledger/audit calls em `apps/api/src/tests/chat-gate-proof-adapters.test.ts:44`.
- O Evidence Index possui evidências IMOB reais de Command Center, approval gate, ação crítica sem side effect sem approval, receipt/bundle surface e Knowledge Base shadow, por exemplo em `docs/EVIDENCE_INDEX.md:163`, `docs/EVIDENCE_INDEX.md:783`, `docs/EVIDENCE_INDEX.md:784`, `docs/EVIDENCE_INDEX.md:785` e `docs/EVIDENCE_INDEX.md:849`.
- `ops/evidence/latest/` é o diretório predominante de evidências recentes e `ops/evidence/2026-W09/` registra evidências por semana em `ops/evidence/`.

## 5. Escopo do dry-run futuro

O dry-run futuro, quando autorizado por fase separada, deve cobrir:

- Chat universal como front door de leitura.
- Vertical IMOB como domínio do cenário.
- Command Center/cockpit como fonte de contexto operacional read-only.
- Runs/snapshots controlados e determinísticos.
- Handoff snapshot `chat.vertical_handoff.v1`.
- Gate state read-only `hitl.gate_state.v1`.
- Proof state read-only `proof_receipt_bundle_state.v1`.
- Render surface output do handoff read-only.

O dry-run futuro deve excluir:

- Canal externo produtivo.
- Provider externo.
- Webhook produtivo.
- Secret produtivo.
- Mutação.
- DB write.
- Ledger/audit write.
- Receipt generation.
- Bundle generation/export.
- Proof fabrication.
- Ação crítica.

## 6. Fontes de entrada permitidas

Entradas permitidas para a fase futura:

- Dados sintéticos com tenant/workspace explícitos, como `tenant-imob-shadow-dry-run` e `workspace-imob-shadow-dry-run`.
- Snapshots controlados e validados por schema.
- Dados mascarados/minimizados.
- Fixtures determinísticas e versionáveis.
- `runId`, `receiptId`, `bundleId` e `ledgerRef` somente quando já existirem em fonte autorizada e quando forem usados como referência read-only.
- ReasonCodes explícitos para todos os bloqueios e estados degradados.

Entradas proibidas:

- Dados pessoais reais sem masking.
- Payload bruto de provider ou webhook.
- Secrets, tokens ou credenciais.
- CPF, RG, CNH, telefone, e-mail sensível ou endereço completo sem masking/minimização.
- IDs internos expostos em output visível.
- Dados que exijam escrever em DB, ledger ou audit para serem materializados.

## 7. Evidências esperadas

Um dry-run futuro deve produzir, em fase própria, evidência física e indexável contendo:

- Input snapshot sanitizado.
- Handoff snapshot validado por `chat.vertical_handoff.v1`.
- HITL gate state read-only validado por `hitl.gate_state.v1`.
- Proof state read-only validado por `proof_receipt_bundle_state.v1`.
- Render surface output serializado ou snapshot textual do componente read-only.
- ReasonCodes por path aceito, bloqueado e degradado.
- Métricas do dry-run.
- Relatório No-Go/Go futuro.
- Hashes/checksums dos artefatos quando aplicável.
- Referências a `runId`, `receiptId`, `bundleId` ou `ledgerRef` somente quando preexistentes.
- Lista de checks executados.
- Prova de isolamento: sem provider call, sem DB write, sem ledger/audit write, sem receipt/bundle/proof generation.

## 8. Métricas obrigatórias

O relatório futuro deve registrar estas métricas com valor esperado:

| Métrica | Esperado |
| --- | --- |
| `sideEffects` | `0` |
| `providerExternalCall` | `0` |
| `duplicateSideEffects` | `0` |
| `auditGap` | `0` |
| `criticalActionWithoutHITL` | `0` |
| `proofFabricatedInFrontend` | `0` |
| `frontendPolicyDecision` | `0` |
| `chatLauncherBusinessRule` | `0` |
| `piiLeakage` | `0` |
| `missingReasonCode` | `0` |

Qualquer métrica fora do esperado transforma o resultado em No-Go.

## 9. Critérios No-Go

Qualquer item abaixo bloqueia a execução real de shadow e impede promoção:

- Qualquer side effect.
- Qualquer provider call.
- Policy decidida no frontend.
- `ChatAgentLauncher` com regra de negócio.
- Proof fabricada no frontend.
- Ausência de `tenantId`, `workspaceId` ou `scope`.
- Ausência de RBAC ou entitlement.
- PII sem masking/minimização.
- Risco `critical` sem HITL obrigatório.
- Ação HIGH/CRITICAL sem aprovação válida.
- CI vermelho.
- Evidência não indexável.
- Drift entre docs, contracts, runtime ou CI.
- ReasonCode ausente em path bloqueado/degradado.
- Chamada a `/runs/:id/bundle` para gerar/exportar bundle durante dry-run.
- Escrita em ledger/audit/DB.
- Receipt/bundle/proof gerado por readiness/dry-run.

## 10. Plano de captura

Quando uma fase futura autorizar o dry-run, a captura deve seguir esta ordem:

1. Preparar fixtures determinísticas e sanitizadas em PR próprio.
2. Validar ausência de PII residual antes de serializar qualquer artefato.
3. Montar input snapshot com tenant/workspace/scope explícitos.
4. Produzir handoff snapshot com `buildChatVerticalHandoffSnapshot`.
5. Produzir HITL gate state com `buildReadOnlyHitlGateState`.
6. Produzir proof state com `buildReadOnlyProofReceiptBundleState`, preservando somente refs preexistentes.
7. Renderizar output read-only sem alterar `ChatAgentLauncher`.
8. Serializar métricas e reasonCodes.
9. Calcular hashes/checksums dos artefatos quando aplicável.
10. Registrar relatório No-Go/Go futuro.
11. Atualizar `docs/EVIDENCE_INDEX.md` somente se a evidência física existir e provar execução real.

Local recomendado para evidência futura:

- `ops/evidence/latest/imob-pilot-1-shadow-dry-run-evidence-YYYY-MM-DD.md`.

Nomeação recomendada para artefatos futuros:

- `imob-pilot-1-input-snapshot-YYYY-MM-DD.json`.
- `imob-pilot-1-handoff-snapshot-YYYY-MM-DD.json`.
- `imob-pilot-1-hitl-gate-state-YYYY-MM-DD.json`.
- `imob-pilot-1-proof-state-YYYY-MM-DD.json`.
- `imob-pilot-1-render-output-YYYY-MM-DD.md`.
- `imob-pilot-1-metrics-YYYY-MM-DD.json`.
- `imob-pilot-1-no-go-go-report-YYYY-MM-DD.md`.

Regras de relacionamento:

- `runId` só pode aparecer se já existir em snapshot/control fixture autorizado.
- `receiptId` só pode aparecer se já existir; não gerar receipt para preencher campo.
- `bundleId` só pode aparecer se já existir; não chamar `/runs/:id/bundle` para criar/exportar.
- `ledgerRef` só pode aparecer se já existir; não escrever ledger/audit para produzir ref.
- Proof ausente deve ser representado como estado read-only bloqueado/indisponível com reasonCode, não fabricado.

## 11. Template lógico de evidência futura

Este plano não cria arquivo de evidência real. A fase futura deve usar, no mínimo, a seguinte estrutura:

```md
# IMOB-PILOT-1 — Shadow Dry-Run Evidence — YYYY-MM-DD

## Resumo
## Escopo executado
## Pré-condições
## Fixtures sanitizadas
## Input snapshot
## Handoff snapshot
## HITL gate state
## Proof state
## Render surface output
## ReasonCodes
## Métricas
## No-Go/Go
## Checks executados
## Prova de isolamento
## PII/sensitive data review
## Provider/DB/ledger/audit boundary
## Receipt/bundle/proof generation boundary
## Riscos residuais
## Status final
```

## 12. Rollout

Esta etapa não inicia shadow. Shadow real exige próxima fase separada, PR próprio, evidência própria, checks próprios e decisão explícita.

`pilot` e `small` continuam bloqueados até existir evidência real de shadow, owners, rollback/disable, métricas estáveis, aprovação humana quando aplicável e decisão de promoção governada.

## 13. Não-autorização

IMOB-PILOT-1 não autoriza execução, não autoriza shadow real, não autoriza dry-run real, não autoriza piloto, não autoriza small rollout, não autoriza provider externo, não autoriza webhook produtivo, não autoriza secret produtivo, não autoriza mutação, não autoriza DB write, não autoriza ledger/audit write, não autoriza receipt/bundle/proof generation, não declara Receipt Canon fechado e não declara IMOB operacionalmente fechado.

## 14. Checks obrigatórios desta proposta

Checks requeridos para validar esta entrega documental:

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

## 15. Status final

Status: parcial/evidenciado localmente; aguardando PR/CI remoto.
