# ARCH-IMPL-3 — Read-only Gate/Proof Adapters

Status: parcial/evidenciado localmente; aguardando PR/CI remoto.

## Escopo

ARCH-IMPL-3 cria adapters read-only para os contratos físicos `hitl.gate_state.v1` e `proof_receipt_bundle_state.v1`.

Esta entrega não aprova, rejeita, delega ou escala HITL; não gera proof, receipt ou bundle; não escreve DB, ledger ou audit; não altera frontend, `ChatAgentLauncher`, runtime, engine ou workflows; e não inicia shadow, pilot ou small.

## Pré-condição ARCH-IMPL-2

Pré-condição registrada para esta execução:

- ARCH-IMPL-2 mergeado em `ac2ea34776337d79ded0e386760e474bb8802cd9`.
- CI Monorepo run `29636166635`: `completed success`.
- IMOB Worker Mutation E2E run `29636166644`: `completed success`.
- Job `ChatEngineRegression`: `completed success`.
- Step `Run chat launcher render-only gate`: `completed success`.
- Step `Run ARCH chat physical contracts gate`: `completed success`.
- Step `Run chat vertical handoff snapshot test`: `completed success`.
- Step `Run chat engine regression suite`: `completed success`.
- Job `OrphanTestsRegression`: `completed success`.
- Step `Run orphan tests regression gate`: `completed success`.

## Estado atual observado

- `hitl.gate_state.v1` exige `tenantId`, `workspaceId`, `scope`, `approvalState`, `hitlRequired`, `riskLevel`, `reasonCode`, `verticalId` e `message` em `contracts/chat/hitl.gate_state.v1.schema.json:5`.
- `proof_receipt_bundle_state.v1` exige `runId`, `tenantId`, `workspaceId`, `scope`, `source`, `reasonCode` e `accessibilityLabel` em `contracts/chat/proof_receipt_bundle_state.v1.schema.json:5`.
- O approval gate IMOB atual bloqueia HIGH/CRITICAL sem aprovação válida e retorna reason codes como `APPROVAL_REQUIRED`, `APPROVAL_INVALID`, `APPROVAL_EXPIRED` e `APPROVAL_SCOPE_MISMATCH` em `apps/api/src/services/imob/imobApprovalGate.ts:45`.
- Os testes atuais confirmam bloqueios de approval para HIGH/CRITICAL em `apps/api/src/tests/imob-approval-gate.test.ts:6`.
- O proof gate IMOB atual bloqueia conclusão quando proof obrigatório está ausente com `MISSING_REQUIRED_PROOF` em `apps/api/src/services/imob/orchestrator/imobProofGate.ts:33`.
- A rota de bundle atual gera/exporta bundle e registra ledger em `apps/api/src/routes/runs.ts:1473`; ARCH-IMPL-3 não usa essa rota.
- A rota pública de ledger consulta `/ledger/:txId` com `ledger.view` em `apps/api/src/routes/governance.ts:432`; ARCH-IMPL-3 não chama essa rota.
- `ChatVerticalHandoffSurface` é frontend read-only isolado em `apps/web/src/components/chat/ChatVerticalHandoffSurface.tsx:38`; ARCH-IMPL-3 não altera frontend.

## Adapters criados

Serviço criado:

- `apps/api/src/services/chatGateProofAdapters.ts`

Exports principais:

- `buildReadOnlyHitlGateState(input)`
- `validateHitlGateStateAgainstSchema(state)`
- `buildReadOnlyProofReceiptBundleState(input)`
- `validateProofReceiptBundleStateAgainstSchema(state)`

## HITL gate adapter

O adapter de gate:

- recebe estado já resolvido como input;
- exige `tenantId`, `workspaceId` e `scope`;
- exige campos mínimos do schema físico;
- valida contra `hitl.gate_state.v1`;
- retorna `readOnly: true` e `sideEffects: 0`;
- falha fechado quando campos críticos faltam;
- falha fechado quando `riskLevel: "critical"` vem com `hitlRequired !== true`;
- sanitiza `allowedUserActions` para ações visuais permitidas pelo schema;
- não expõe handlers de approve/reject/delegate/escalate.

## Proof adapter

O adapter de proof:

- recebe estado já resolvido como input;
- exige `tenantId`, `workspaceId`, `scope` e `runId`;
- valida contra `proof_receipt_bundle_state.v1`;
- retorna `readOnly: true` e `sideEffects: 0`;
- aceita entrada `proofStatus: "unavailable"` apenas como alias operacional e normaliza para o enum físico `not_required`;
- preserva `runId`, `receiptId`, `bundleId` e `ledgerRef` quando já presentes;
- não gera receipt, bundle, ledgerRef ou proof.

## Testes

Teste criado:

- `apps/api/src/tests/chat-gate-proof-adapters.test.ts`

Cobertura:

- gate pending válido;
- gate critical válido com HITL;
- gate critical sem HITL falha fechado;
- gate sem tenant/workspace/scope falha fechado;
- gate sem handlers mutacionais;
- gate valida contra `hitl.gate_state.v1`;
- proof unavailable read-only;
- proof available com refs já existentes;
- proof sem tenant/workspace/scope falha fechado;
- proof não gera receipt/bundle/ledger;
- proof valida contra `proof_receipt_bundle_state.v1`;
- `sideEffects=0` nos happy paths;
- ausência de chamada API/provider/DB/ledger/audit.

O script `test:chat-gate-proof-adapters` foi registrado em `package.json` para tornar o teste canônico e evitar orphan test sem alterar allowlist.

## Não-autorização

ARCH-IMPL-3 não declara IMOB operacionalmente fechado, não inicia rollout, não inicia shadow/pilot/small e não declara Receipt Canon fechado.
