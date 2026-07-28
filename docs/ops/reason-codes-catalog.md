# Reason Code Canon v1

## Fonte canônica

A fonte única versionada é
`packages/core/src/reasons/reasonCatalog.ts`. Ela define `ReasonCode`,
`ReasonCodeDefinition`, os metadados de governança e as funções
`isReasonCode()`, `assertReasonCode()`, `isActiveReasonCode()`,
`assertActiveReasonCode()` e `normalizeReason()`. Conhecimento e
enforçabilidade são separados: `assertReasonCode()` aceita entradas
catalogadas como `proposed`, enquanto `assertActiveReasonCode()` não aceita.

O checker global inicial é `scripts/checkReasonCodeCanon.ts`, executado por
`pnpm check:reason-code-canon`. Ele rejeita códigos desconhecidos nos
arquivos-alvo nomeados, códigos `active` sem owner/approver/evidenceRef,
bootstrap fora do baseline cercado e drift entre este documento, a fonte
canônica e os validadores de domínio.

## Origem e correção do drift

Esta fonte foi **(re)criada no RC-0**; ela não foi restaurada da linhagem de
`main`. O discovery R4 read-only confirmou:

- `reasonCatalog.ts` existiu no commit lateral `1428a1bc`, contido em
  `chore/publish-batches`, mas esse commit nunca foi ancestral de `main`;
- este documento passou a apontar para o arquivo no commit `516c34b6`, quando
  nem esse commit nem seu pai continham a fonte;
- portanto, o ponteiro nasceu órfão na linhagem principal.

O RC-0 corrige o ponteiro e cria enforcement conservador. Ele não ratifica os
códigos bloqueados de MCP, RBAC ou notification.

## Status e bootstrap

- `active`: código já enforçado pelo baseline pré-RC-0 de um validador de
  domínio real. Exige owner, approver e evidenceRef.
- `proposed`: código conhecido, mas não enforçável nem ratificado.
- `deprecated`: código mantido para compatibilidade, sem uso novo.

O bootstrap `active` é uma exceção cercada e imutável para os conjuntos IMOB
(`z.enum(IMOB_REASON_CODE_VALUES)`) e Chat→Vertical
(`z.enum(VERTICAL_HANDOFF_REASON_CODES)` + checker de sincronização). Citação
documental, uso runtime ou presença em teste não bastam para bootstrap.

## Ratificação

Um código novo entra como `proposed`. A transição `proposed → active` exige PR
dedicado com:

1. owner identificado;
2. approver humano identificado;
3. `evidenceRef` autenticada da aprovação;
4. ratificação registrada de Carlos Alberto Merlo;
5. atualização da fonte canônica, deste catálogo documental e dos validadores
   nomeados aplicáveis.

Automação não pode ratificar o próprio código. Preencher os campos no mesmo PR
que propõe o código não substitui aprovação humana autenticada.

## Catálogo sincronizado

O bloco abaixo é machine-checkable. Alterações manuais que não correspondam à
fonte canônica falham em `check:reason-code-canon`.

<!-- reason-code-canon:start -->
| Code | Status |
| --- | --- |
| `COMMERCIAL_PRIORITY` | active |
| `FOLLOW_UP_DISCIPLINE` | active |
| `DOCUMENT_BLOCKER` | active |
| `FINANCIAL_BLOCKER` | active |
| `AUDIT_BLOCKER` | active |
| `BLOCKERS_PRESENT` | active |
| `PENDING_ITEMS_PRESENT` | active |
| `NEXT_STEP_AVAILABLE` | active |
| `CASE_STATUS_BLOCKED` | active |
| `CASE_RESPONSIBLE_REQUIRED` | active |
| `CASE_OWNER_ASSIGNMENT_FORBIDDEN` | active |
| `MEMBER_NOT_ELIGIBLE_AS_RESPONSIBLE` | active |
| `RESPONSIBLE_ACTOR_CONTRACT_INVALID` | active |
| `INVALID_ACTION_TYPE` | active |
| `CASE_TRANSITION_EVENT_REQUIRED` | active |
| `PENDING_ACTION_MISSING` | active |
| `PENDING_ACTION_MISMATCH` | active |
| `PENDING_ACTION_EXPIRED` | active |
| `PENDING_ACTION_CANCELLED_BY_USER` | active |
| `CONFIRMATION_TARGET_AMBIGUOUS` | active |
| `DIRECTED_ACTION_CONTEXT_LOST` | active |
| `DIRECTED_ACTION_ENTITY_MISMATCH` | active |
| `DIRECTED_ACTION_JOURNEY_MISMATCH` | active |
| `VERTICAL_NOT_REGISTERED` | active |
| `VERTICAL_DISABLED` | active |
| `VERTICAL_ENTITLEMENT_REQUIRED` | active |
| `VERTICAL_SCOPE_DENIED` | active |
| `VERTICAL_CAPABILITY_NOT_AVAILABLE` | active |
| `VERTICAL_REGISTRY_VERSION_MISMATCH` | active |
| `VERTICAL_POLICY_DENIED` | active |
| `VERTICAL_HITL_REQUIRED` | active |
| `VERTICAL_GOVERNANCE_NOT_EVALUATED` | active |
| `VERTICAL_PRESENTATION_INVALID` | active |
| `VERTICAL_HANDOFF_ALLOWED` | active |
| `VERTICAL_PREVIEW_ONLY` | active |
| `invalid_txid_format` | proposed |
| `txid_not_found` | proposed |
| `pou_txid_mismatch` | proposed |
| `missing_trust_snapshot_for_pou` | proposed |
| `missing_run_for_txid` | proposed |
| `missing_bundle_hash_for_run` | proposed |
| `run_txid_mismatch` | proposed |
| `run_critical_hash_mismatch` | proposed |
| `missing_scl_for_txid` | proposed |
| `missing_scl_signature` | proposed |
| `scl_critical_hash_mismatch` | proposed |
| `delegation_pending_approval` | proposed |
| `EXECUTION_FAILED` | proposed |
| `MCP_TOOL_CONTRACT_MISSING` | proposed |
| `SIMULATED_OUTPUT_IN_CRITICAL_CHAIN` | proposed |
| `AUDIT_WRITE_FAILED` | proposed |
| `DB_MODEL_NOT_ALLOWLISTED` | proposed |
| `DB_SCOPE_VIOLATION` | proposed |
| `DB_SCOPE_MISSING` | proposed |
| `POLICY_NOT_FOUND` | proposed |
| `RBAC_OWNER_DEFERRAL` | proposed |
| `RBAC_BUILD_ARTIFACT_DRIFT` | proposed |
| `NOTIFICATION_NON_DELIVERY_ESCALATION` | proposed |
| `NOTIFICATION_BLOCKED_FREEZE` | proposed |
| `NOTIFICATION_BLOCKED_SECRET_PROVENANCE` | proposed |
| `NOTIFICATION_BLOCKED_REASON_CODE_MISSING` | proposed |
| `NOTIFICATION_BLOCKED_RUN_MISSING` | proposed |
<!-- reason-code-canon:end -->

## Alcance inicial do checker

Os arquivos-alvo são explicitamente declarados em
`REASON_CODE_CANON_TARGETS`:

- `packages/core/src/reasons/reasonCatalog.ts`;
- `docs/ops/reason-codes-catalog.md`;
- `apps/api/src/services/imob/control/imobReasonCodeCatalog.ts`;
- `apps/api/src/routes/imobCrmSchemas.ts`;
- `apps/api/src/types/chatVerticalHandoffV2Contract.ts`;
- `contracts/chat/vertical.reason_codes.v1.json`;
- `scripts/tests/checkReasonCodeCanon.test.ts`.

O RC-0 não varre todo o runtime. Receipt Canon, ledger, execution evidence,
MCP DB, RBAC, notification e demais testes/fontes permanecem fora do scanner
global inicial. Ampliar esse alcance é dívida futura consciente, para evitar
um baseline ruidoso e impossível de revisar neste PR.

## Enforcement no portão de main

O checker nasce informativo: ele não está entre os required checks atuais.
Após o merge do RC-0, torná-lo required no ruleset
`main-protection-hard-gates` é decisão autenticada de Carlos Alberto Merlo.
Este PR não altera ruleset, branch protection ou workflow.
