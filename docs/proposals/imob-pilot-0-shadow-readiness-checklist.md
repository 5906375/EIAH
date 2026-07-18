# IMOB-PILOT-0 — Shadow Readiness Checklist

**Status:** proposta/parcial evidenciada localmente; aguardando PR/CI remoto.

## 1. Escopo

IMOB-PILOT-0 define uma checklist documental para uma futura avaliação de shadow readiness do IMOB no Chat universal. Esta proposta não inicia `shadow`, `pilot` ou `small`; não executa ação crítica; não gera receipt, bundle, prova, ledger ou audit; não cria mutação; não altera frontend, `ChatAgentLauncher`, runtime, engine, API, workflows, schema Prisma, seeds ou migrations.

O escopo futuro de shadow, quando autorizado em PR próprio, deve ser read-only e restrito a:

- IMOB como vertical observada.
- `/app/chat` como front door universal já roteado para `AgentsPage`.
- `/app/imob/chat` e `/app/imob/dashboard` como superfícies existentes de contexto IMOB, sem nova ativação operacional por este documento.
- Command Center/cockpit IMOB apenas como referência de leitura, filas, blocked runs, funnel e pendências já existentes.
- Contratos físicos `chat.vertical_handoff.v1`, `hitl.gate_state.v1` e `proof_receipt_bundle_state.v1` como baseline de interoperabilidade.
- Artefatos de handoff/gate/proof somente quando já produzidos por builders/adapters read-only e validados por contrato.

## 2. Pré-condição registrada

Pré-condição fornecida para esta fase:

- ARCH-IMPL-3 mergeado em `b65aff8de4609eea9988ccaea319af9d0d4f776e`.
- `CI Monorepo` run `29636696323`: `completed success`.
- `IMOB Worker Mutation E2E` run `29636696340`: `completed success`.
- Job `ChatEngineRegression`: `completed success`.
- Steps `Run chat launcher render-only gate`, `Run ARCH chat physical contracts gate`, `Run chat vertical handoff snapshot test` e `Run chat engine regression suite`: `completed success`.
- Job `OrphanTestsRegression`: `completed success`.
- Step `Run orphan tests regression gate`: `completed success`.

## 3. Fontes lidas

- `CODEX.md`.
- `IA_EIAH.md`.
- `AGENTS.md`.
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`.
- `docs/architecture/agent-chat-runtime.md`.
- `docs/EVIDENCE_INDEX.md`.
- `docs/proposals/arch-chat-8-contract-to-implementation-gap-matrix.md`.
- `docs/proposals/arch-impl-0-minimal-physical-contracts-ci-validation.md`.
- `docs/proposals/arch-impl-1-read-only-handoff-snapshot-producer.md`.
- `docs/proposals/arch-impl-2-universal-chat-render-surface-read-only.md`.
- `docs/proposals/arch-impl-3-read-only-gate-proof-adapters.md`.
- `contracts/chat/chat.vertical_handoff.v1.schema.json`.
- `contracts/chat/hitl.gate_state.v1.schema.json`.
- `contracts/chat/proof_receipt_bundle_state.v1.schema.json`.
- `apps/api/src/services/chatVerticalHandoffSnapshot.ts`.
- `apps/api/src/services/chatGateProofAdapters.ts`.
- `apps/web/src/components/chat/ChatVerticalHandoffSurface.tsx`.
- `apps/web/src/App.tsx`.
- `apps/web/src/components/agents/ChatAgentLauncher.tsx`.
- `apps/api/src/services/imob/imobApprovalGate.ts`.
- `apps/api/src/services/imob/orchestrator/imobProofGate.ts`.
- `apps/api/src/services/imob/imobArtifactCapabilities.ts`.
- `apps/api/src/services/imob/marketScan/marketScanPolicyJudge.ts`.
- `apps/api/src/services/imob/intake/imobContractPiiMasker.ts`.
- `apps/api/src/middlewares/enforceTenant.ts`.
- `apps/api/src/middlewares/requireScope.ts`.
- `apps/api/src/routes/runs.ts`.
- `apps/api/src/routes/governance.ts`.
- `apps/api/src/tests/vertical-entitlement-gate.contract.test.ts`.
- `package.json`.
- `.github/workflows/ci.yml`.
- `scripts/checkArchChatContracts.ts`.

## 4. Estado atual observado

- `/app/chat` existe e renderiza `AgentsPage` sob `RequireAuth` em `apps/web/src/App.tsx:299`.
- `/app/imob/dashboard` e `/app/imob/chat` existem sob `RequireImobInstall` em `apps/web/src/App.tsx:345` e `apps/web/src/App.tsx:357`.
- `ChatAgentLauncher` mantém `presentationSnapshot` na mensagem em `apps/web/src/components/agents/ChatAgentLauncher.tsx:64`, renderiza markdown já resolvido em `apps/web/src/components/agents/ChatAgentLauncher.tsx:1867` e quick replies vindas do snapshot em `apps/web/src/components/agents/ChatAgentLauncher.tsx:1913`.
- `ChatVerticalHandoffSurface` é read-only, renderiza ausência de snapshot como estado neutro e exibe aviso de HITL crítico sem executar aprovação em `apps/web/src/components/chat/ChatVerticalHandoffSurface.tsx:38`.
- `chat.vertical_handoff.v1` exige `tenantId`, `workspaceId`, `scope`, `verticalId`, `intentId`, `reasonCode`, `riskLevel` e `hitlRequired` em `contracts/chat/chat.vertical_handoff.v1.schema.json:6`.
- `hitl.gate_state.v1` exige `tenantId`, `workspaceId`, `scope`, `approvalState`, `hitlRequired`, `riskLevel`, `reasonCode`, `verticalId` e `message` em `contracts/chat/hitl.gate_state.v1.schema.json:6`.
- `proof_receipt_bundle_state.v1` exige `runId`, `tenantId`, `workspaceId`, `scope`, `source`, `reasonCode` e `accessibilityLabel` em `contracts/chat/proof_receipt_bundle_state.v1.schema.json:6`.
- `buildChatVerticalHandoffSnapshot` falha fechado em campos obrigatórios, exige HITL para risco crítico e retorna `sideEffects: 0` em `apps/api/src/services/chatVerticalHandoffSnapshot.ts:221`.
- `buildReadOnlyHitlGateState` falha fechado em campos obrigatórios, exige HITL para risco crítico e retorna `readOnly: true` com `sideEffects: 0` em `apps/api/src/services/chatGateProofAdapters.ts:329`.
- `buildReadOnlyProofReceiptBundleState` falha fechado em campos obrigatórios, normaliza alias operacional `unavailable` para `not_required` e retorna `readOnly: true` com `sideEffects: 0` em `apps/api/src/services/chatGateProofAdapters.ts:430`.
- `resolveImobApprovalGate` bloqueia HIGH/CRITICAL sem aprovação válida, expirada, inválida ou fora de escopo em `apps/api/src/services/imob/imobApprovalGate.ts:45`.
- `evaluateProofGate` bloqueia proof obrigatório ausente com `MISSING_REQUIRED_PROOF` em `apps/api/src/services/imob/orchestrator/imobProofGate.ts:33`.
- `requireScope` retorna 403 com `reasonCode` quando RBAC nega escopo em `apps/api/src/middlewares/requireScope.ts:20`.
- `enforceTenant` injeta `tenantId`, `workspaceId` e Prisma scoped na requisição autenticada em `apps/api/src/middlewares/enforceTenant.ts:58`.
- `resolveImobArtifactCapabilities` bloqueia chat/case/bundle quando faltam contexto, permissão de workspace, estágio ou `reports.view` em `apps/api/src/services/imob/imobArtifactCapabilities.ts:65`.
- O gate de entitlement vertical mantém leitura em estados inativos/suspensos, mas bloqueia ação sensível sem instalação ativa em `apps/api/src/tests/vertical-entitlement-gate.contract.test.ts:16`.
- `judgeMarketScanPolicy` bloqueia saída sem evidence bundle, com PII, com ID interno visível, fonte fora da run ou oportunidade sem aprovação humana em `apps/api/src/services/imob/marketScan/marketScanPolicyJudge.ts:28`.
- `maskContractPii` mascara e-mail, RG, CNH, CNPJ, CPF e telefone antes de log, evidence payload ou draft storage em `apps/api/src/services/imob/intake/imobContractPiiMasker.ts:1`.
- A rota `/runs/:id/bundle` constrói bundle e registra ledger em `apps/api/src/routes/runs.ts:1473`; por isso fica fora de qualquer shadow read-only sem autorização explícita.
- A rota `/ledger/:txId` é leitura autenticada por `ledger.view` em `apps/api/src/routes/governance.ts:432`.
- O CI tem steps explícitos para render-only, contratos físicos, snapshot, engine regression e orphan tests em `.github/workflows/ci.yml:258`.

## 5. Checklist de readiness

IMOB-PILOT-0 só pode sair de proposta para avaliação futura quando todos os itens abaixo estiverem evidenciados em PR próprio:

| Área | Critério obrigatório | Status nesta proposta |
| --- | --- | --- |
| Contrato físico | `chat.vertical_handoff.v1`, `hitl.gate_state.v1` e `proof_receipt_bundle_state.v1` versionados e validados no CI. | Parcial/evidenciado localmente por leitura e checks. |
| Source of truth | Agente/engine/backend produzem estado; frontend só renderiza resultado resolvido. | Parcial/evidenciado localmente. |
| Handoff | Snapshot possui `tenantId`, `workspaceId`, `scope`, `verticalId`, `intentId`, `reasonCode`, `riskLevel`, `hitlRequired` e `sideEffects=0`. | Parcial/evidenciado localmente. |
| Gate/HITL | Estado de gate é read-only, validado por schema e sem handlers de approve/reject/delegate/escalate. | Parcial/evidenciado localmente. |
| Proof/receipt/bundle | Adapter preserva refs existentes, mas não gera proof, receipt, bundle ou ledger. | Parcial/evidenciado localmente. |
| RBAC | Qualquer falta de escopo falha fechado com `reasonCode`. | Parcial/evidenciado localmente. |
| Tenant/workspace | Todo input de shadow exige tenant/workspace explícitos e não permite fallback global. | Parcial/evidenciado localmente. |
| Entitlement | Ações sensíveis exigem instalação/entitlement ativo; leitura pode ser read-only quando permitido. | Parcial/evidenciado localmente. |
| Policy engine | Policy/HITL/proof continuam no backend/runtime; UI não decide risco, permissão ou aprovação. | Parcial/evidenciado localmente. |
| PII | Qualquer output serializado de shadow deve ser mascarado/minimizado e sem payload bruto. | Parcial/evidenciado localmente. |
| Observabilidade | Métricas mínimas definidas antes de execução: audit gap, side effects, proof fabricado, critical action, provider call e frontend policy decision. | Proposta. |
| Rollback | Rollback/disable deve existir antes de qualquer ativação shadow real. | Proposta. |
| Evidência | Evidência deve ser física, versionada e indexável apenas após execução real. | Proposta. |

## 6. Gates obrigatórios

Os gates abaixo são obrigatórios para qualquer shadow futuro:

- `tenantId` obrigatório, não vazio e conferido contra auth context.
- `workspaceId` obrigatório, não vazio e conferido contra auth context.
- `scope` obrigatório e validado por RBAC.
- `imob.chat.use` obrigatório para superfícies IMOB que dependam do workspace.
- `reports.view` obrigatório para qualquer leitura de bundle existente.
- `ledger.view` obrigatório para qualquer consulta de ledger existente.
- Entitlement/instalação IMOB resolvido antes de qualquer ação sensível.
- Policy engine/backend decide risco e bloqueio; frontend não decide.
- Trust Score, quando aplicável a ação futura, deve ser tratado como gate backend e nunca inferido no launcher.
- HITL obrigatório para risco HIGH/CRITICAL conforme política IMOB; risco `critical` sem `hitlRequired=true` é No-Go.
- Proof obrigatório não satisfeito bloqueia com `MISSING_REQUIRED_PROOF`.
- PII masking/minimização antes de log, output, evidence, bundle ou outbound.
- ReasonCode obrigatório para todos os bloqueios.
- Fail-closed para payload incompleto, escopo ausente, entitlement ausente, gate inválido, proof ausente ou estado inconsistente.
- `sideEffects=0` obrigatório durante shadow readiness; qualquer side effect bloqueia shadow.

## 7. Artefatos mínimos

Artefatos admitidos para uma avaliação futura de shadow:

- Handoff snapshot `chat.vertical_handoff.v1` validado, produzido por `buildChatVerticalHandoffSnapshot`.
- Estado HITL `hitl.gate_state.v1` validado, produzido por `buildReadOnlyHitlGateState`.
- Estado proof/receipt/bundle `proof_receipt_bundle_state.v1` validado, produzido por `buildReadOnlyProofReceiptBundleState`.
- Refs existentes de `runId`, `receiptId`, `bundleId` ou `ledgerRef`, quando já existirem.
- Resultados de testes locais e CI dos scripts canônicos.
- Checklist de No-Go assinado por owners em PR futuro.

Artefatos proibidos nesta fase:

- Proof fabricado no frontend.
- Receipt gerado por readiness.
- Bundle exportado por readiness.
- Ledger/audit escrito por readiness.
- Provider externo ou webhook produtivo.
- Secrets produtivos.
- Ação crítica ou mutação.

## 8. Métricas mínimas de readiness

Um shadow futuro só pode ser considerado se as métricas abaixo estiverem instrumentadas ou extraídas sem PII:

| Métrica | Objetivo | Go/No-Go |
| --- | --- | --- |
| `auditGap` | Lacunas entre run/ref/evidência esperada e observada. | Deve ser `0`. |
| `duplicateSideEffects` | Side effects duplicados ou reprocessados. | Deve ser `0`. |
| `proofFabricatedInFrontend` | Proof/receipt/bundle criado ou inferido na UI. | Deve ser `0`. |
| `criticalActionWithoutHITL` | Ação HIGH/CRITICAL sem aprovação humana válida. | Deve ser `0`. |
| `providerExternalCall` | Chamada a provider externo durante readiness/shadow read-only. | Deve ser `0`. |
| `frontendPolicyDecision` | Decisão de policy/risk/HITL/entitlement no frontend. | Deve ser `0`. |
| `chatLauncherBusinessRule` | Regra nova de negócio/cognição no `ChatAgentLauncher`. | Deve ser `0`. |
| `piiLeakage` | PII/sensível em output, log ou artefato serializado. | Deve ser `0`. |
| `missingReasonCode` | Bloqueio sem reasonCode. | Deve ser `0`. |
| `failClosedCoverage` | Eventos inválidos bloqueados corretamente. | Deve ser `100%`. |

## 9. No-Go criteria

Qualquer item abaixo bloqueia shadow real:

- Workflows pós-merge ausentes, falhos ou não verificáveis.
- `ChatAgentLauncher` alterado para decidir policy, vertical, HITL, entitlement, proof, risk ou CTA de negócio.
- Frontend fabricando proof, receipt, bundle, gate state ou autorização.
- `sideEffects` diferente de `0` em handoff, gate ou proof read-only.
- Provider externo chamado.
- Secret produtivo usado.
- Webhook produtivo habilitado.
- DB write, ledger write, audit write, receipt generation ou bundle export executado como parte da readiness.
- Ação crítica HIGH/CRITICAL sem HITL válido.
- Tenant/workspace/scope ausente, ambíguo ou divergente.
- Entitlement/RBAC ausente, ambíguo ou divergente.
- PII, secret, token, payload bruto, CPF, RG, CNH, telefone, e-mail sensível, endereço completo ou identificador interno exposto em output serializado.
- Bloqueio sem `reasonCode`.
- Testes canônicos ou checks documentais falhando.
- Evidence Index atualizado com evidência inexistente, planejada ou não indexável.

## 10. Rollout futuro como plano apenas

A sequência futura continua sendo:

1. `shadow`: observação read-only, sem ação crítica, sem provider externo, sem mutação, sem ledger/audit write gerado pela readiness e sem alteração de UX por heurística local.
2. `pilot`: somente após evidência real de shadow, owners, rollback/disable, métricas e aprovação em PR próprio.
3. `small`: somente após pilot evidenciado, métricas estáveis e aprovação governada em PR próprio.

Nenhum desses estágios é ativado por IMOB-PILOT-0.

## 11. Matriz P0-P4

| Prioridade | Classe | Critério de bloqueio | Status nesta proposta |
| --- | --- | --- | --- |
| P0 | Safety/governance | Frontend decide policy, HITL, entitlement, proof, risk ou ação. | Bloqueado por regra; sem alteração de frontend. |
| P0 | Side effects | Readiness/shadow produz mutação, provider call, ledger/audit write, receipt ou bundle. | Bloqueado por regra; sem execução. |
| P0 | Escopo | Tenant/workspace/scope ausente ou divergente. | Gate obrigatório. |
| P0 | Critical action | HIGH/CRITICAL sem HITL válido. | No-Go absoluto. |
| P1 | Contract drift | Contrato físico ou builder/adapters fora do schema. | Coberto por `check:arch-chat-contracts` e testes focados. |
| P1 | RBAC/entitlement | Permissão ou instalação ausente em ação sensível. | Gate obrigatório. |
| P2 | Proof/receipt/bundle | Ref ausente, inconsistente ou fabricada. | Read-only preserva refs; não gera artefato. |
| P2 | Auditability | Métrica `auditGap` diferente de `0`. | No-Go para promoção futura. |
| P3 | Observability | Métricas mínimas ausentes ou com PII. | Proposta; obrigatório antes de execução. |
| P4 | Rollout | Shadow/pilot/small sem PR e aprovação própria. | No-Go absoluto. |

## 12. ReasonCodes de readiness

ReasonCodes mínimos para bloqueios futuros:

- `IMOB_SHADOW_NOT_AUTHORIZED`.
- `IMOB_SHADOW_PRECONDITION_MISSING`.
- `IMOB_SHADOW_TENANT_REQUIRED`.
- `IMOB_SHADOW_WORKSPACE_REQUIRED`.
- `IMOB_SHADOW_SCOPE_REQUIRED`.
- `IMOB_SHADOW_RBAC_DENIED`.
- `IMOB_SHADOW_ENTITLEMENT_DENIED`.
- `IMOB_SHADOW_FRONTEND_POLICY_DECISION_BLOCKED`.
- `IMOB_SHADOW_CHAT_LAUNCHER_RULE_BLOCKED`.
- `IMOB_SHADOW_HITL_REQUIRED`.
- `IMOB_SHADOW_PROOF_REQUIRED`.
- `IMOB_SHADOW_PROOF_FABRICATION_BLOCKED`.
- `IMOB_SHADOW_SIDE_EFFECT_BLOCKED`.
- `IMOB_SHADOW_PROVIDER_CALL_BLOCKED`.
- `IMOB_SHADOW_PII_BLOCKED`.
- `IMOB_SHADOW_REASON_CODE_REQUIRED`.

## 13. Checks locais requeridos

Os checks obrigatórios para esta proposta são:

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

## 14. Non-authorization

IMOB-PILOT-0 não declara IMOB operacionalmente fechado, não declara Receipt Canon fechado, não inicia ARCH-IMPL-2 adicional, não inicia shadow/pilot/small, não seleciona provider, não integra provider, não habilita WhatsApp produtivo, não usa secret produtivo, não cria webhook produtivo e não executa ação crítica.

## 15. Status final

Status: parcial/evidenciado localmente; aguardando PR/CI remoto.
