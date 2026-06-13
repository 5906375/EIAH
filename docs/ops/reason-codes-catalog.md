# Reason Codes Catalog (Fonte Oficial)

## Fonte da verdade
- Catálogo oficial: `packages/core/src/reasons/reasonCatalog.ts`
- Tipagem oficial: `ReasonCode`
- Normalização oficial: `normalizeReason()`

## Regra de uso
- `reasonCodes` de receipts/erros/eventos devem usar apenas valores do catálogo oficial.
- Strings ad-hoc em `reasonCodes` são proibidas.
- Valores dinâmicos devem passar por normalização (`normalizeReasonCode`/`normalizeReason`) antes de sair na API.

## Cobertura de ledger/receipt (F5.1/F5.3)
- `invalid_txid_format`
- `txid_not_found`
- `pou_txid_mismatch`
- `missing_trust_snapshot_for_pou`
- `missing_run_for_txid`
- `missing_bundle_hash_for_run`
- `run_txid_mismatch`
- `run_critical_hash_mismatch`
- `missing_scl_for_txid`
- `missing_scl_signature`
- `scl_critical_hash_mismatch`
- `delegation_pending_approval`

## Cobertura IMOB — control surface (Command Center)

Fonte: `apps/api/src/services/imob/control/imobReasonCodeCatalog.ts`
Tipo: `ImobReasonCode`
Catálogo: `IMOB_REASON_CODE_CATALOG`

### Risco operacional (Command Center dropdown)

- `COMMERCIAL_PRIORITY` — Prioridade comercial
- `FOLLOW_UP_DISCIPLINE` — Disciplina de follow-up
- `DOCUMENT_BLOCKER` — Bloqueio documental
- `FINANCIAL_BLOCKER` — Bloqueio financeiro (requiresApproval)
- `AUDIT_BLOCKER` — Bloqueio de auditoria/evidência (requiresApproval, requiresEvidence)
- `BLOCKERS_PRESENT` — Bloqueios presentes
- `PENDING_ITEMS_PRESENT` — Pendências presentes
- `NEXT_STEP_AVAILABLE` — Próximo passo disponível
- `CASE_STATUS_BLOCKED` — Caso bloqueado

### Governança / fail-closed (DATA-03 · Etapa 8 Trilha A)

- `CASE_RESPONSIBLE_REQUIRED` — Responsável pelo caso não atribuído antes de transição terminal
  - `nextAction: ASSIGN_RESPONSIBLE_MANUALLY`
  - Retornado por `updateCase()` quando `status → closing/done/completed` e `ownerResponsible` null
  - **Nota:** o code `OWNER_REQUIRED` em `imobNextActionResolver.ts` é semânticamente diferente — refere-se ao proprietário do imóvel não cadastrado na jornada de captação, não ao responsável do caso.
- `CASE_OWNER_ASSIGNMENT_FORBIDDEN` — Atribuição de responsável bloqueada pela policy (requiresApproval, requiresEvidence)
- `MEMBER_NOT_ELIGIBLE_AS_RESPONSIBLE` — Membro sem elegibilidade para responsável pelo caso (requiresApproval)

### Integridade de run (DATA-01 Frente B)

- `INVALID_ACTION_TYPE` — Run criado com `request.action` fora do mapa canônico
  - Retornado no momento da criação do run quando `request.action` desconhecido e não normalizável

### Integridade de transição (DATA-02 Opção B)

- `CASE_TRANSITION_EVENT_REQUIRED` — Transição de status requer `ImobCaseEvent` explícito com timestamp real; evento ausente (requiresEvidence)
  - Retornado quando `status → closing/done` sem evento de closing registrado

## Compatibilidade
- Novos reason codes: mudança aditiva.
- Remoção/renomeação: breaking change.
- Adição de `category: "governance"` ao tipo `ImobReasonCodeSpec`: mudança aditiva no enum de categoria.
