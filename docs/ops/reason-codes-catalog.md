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

### Semântica de execução MCP (MCP-1J)

Fonte canônica ativa: `apps/api/src/services/executionEvidence.ts`
(`EXECUTION_EVIDENCE_REASON_CODES`).

- `EXECUTION_FAILED` — fallback já existente para run em erro sem código mais
  específico; impede que um estado bloqueado valide como execução real.
- `MCP_TOOL_CONTRACT_MISSING` — execução bloqueada porque o contrato da tool
  não foi encontrado.
- `SIMULATED_OUTPUT_IN_CRITICAL_CHAIN` — dado histórico legível contém
  `simulated:true` e não pode validar como execução real.
- `AUDIT_WRITE_FAILED` — persistência de audit em caminho MCP crítico falhou;
  o run deve falhar fechado.

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
- `RESPONSIBLE_ACTOR_CONTRACT_INVALID` — Contrato canônico de responsible actor inválido antes de persistir atribuição (requiresEvidence)
  - Retornado por `assignResponsibleActor()` quando o payload mínimo multi-vertical falha na validação
  - `tenantId/workspaceId` devem vir do `scope` backend, não do body externo

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

## Chat to Vertical v2

Fonte contratual versionada: `contracts/chat/vertical.reason_codes.v1.json`.

Este catálogo cobre somente o preflight `chat.vertical_handoff.v2`; ele não substitui nem amplia implicitamente os códigos operacionais legados. Códigos iniciais:

- `VERTICAL_NOT_REGISTERED`
- `VERTICAL_DISABLED`
- `VERTICAL_ENTITLEMENT_REQUIRED`
- `VERTICAL_SCOPE_DENIED`
- `VERTICAL_CAPABILITY_NOT_AVAILABLE`
- `VERTICAL_REGISTRY_VERSION_MISMATCH`
- `VERTICAL_POLICY_DENIED`
- `VERTICAL_HITL_REQUIRED`
- `VERTICAL_GOVERNANCE_NOT_EVALUATED`
- `VERTICAL_PRESENTATION_INVALID`
- `VERTICAL_HANDOFF_ALLOWED`
- `VERTICAL_PREVIEW_ONLY`
