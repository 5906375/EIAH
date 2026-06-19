# IMOB Chat Intake — Lifecycle Policy (MVP)

**Branch:** `feat/imob-chat-document-intake`
**Status:** MVP operacional — revisão futura antes de produção em escala.

---

## 1. Draft (in-memory)

| Propriedade | Valor |
|---|---|
| TTL | 30 minutos (`DRAFT_TTL_MS = 30 * 60 * 1000`) |
| Cleanup interval | 5 minutos (`CLEANUP_INTERVAL_MS = 5 * 60 * 1000`) |
| Store | `Map<draftId, StoredDraft>` — in-memory por processo |
| Persistência | Nenhuma — drafts não sobrevivem a restart do processo API |
| Consume | `deleteDraft(draftId)` chamado na confirmação bem-sucedida |

### Invariantes

- Draft é efêmero por design — não contém PII real (apenas hash do documento).
- Após `confirm` bem-sucedido, `deleteDraft` é chamado; re-confirm retorna `409 DRAFT_EXPIRED`.
- Scope check: `draft.tenantId !== req.tenantId || draft.workspaceId !== req.workspaceId` → `403 DRAFT_SCOPE_MISMATCH`.
- Restart de API entre upload e confirm → draft perdido → usuário deve re-upload.

### Comportamento sob restart

Em caso de restart do processo API (deploy, crash, reload), todos os drafts em memória são perdidos. Usuários com upload pendente de confirmação devem re-iniciar o fluxo. Esta é a política MVP — drafts são explicitamente não-duráveis.

### Melhoria futura (fora de escopo MVP)

Se a durabilidade de drafts for necessária (ex.: uploads grandes, confirmações atrasadas), o store pode ser migrado para Redis com TTL nativo. Requer decisão explícita e versionamento do contrato.

---

## 2. UploadedDocument (DB + filesystem)

| Propriedade | Valor |
|---|---|
| DB record | `uploaded_documents` — persiste indefinidamente (MVP: sem auto-delete) |
| Arquivo físico | `uploads/{uuid}.docx` — persiste no filesystem do processo API |
| storageKey | UUID + extensão original (e.g., `a1b2c3d4.docx`) |
| storageRef | `uploadedDocument.id` — referenciado no `draft.evidenceDrafts[0].storageRef` e em `run.request.documentHash` |
| Falha de storage | Não-fatal: se storage falhar, draft é criado sem `storageRef` |

### Lifecycle de upload

```
POST /upload
  ↓ persistBuffer(buffer) → uploads/{uuid}.docx (filesystem)
  ↓ createUploadedDocument(...) → DB record (storageKey, agentSlug=imob-intake)
  ↓ createDraft(..., evidenceDrafts: [{ storageRef: record.id, documentHash, piiMasked: true }])
  ↓ response → draftId, evidenceDrafts[0].storageRef
```

### Política MVP — sem auto-delete

- DB records e arquivos físicos **não são deletados automaticamente** no MVP.
- Razão: arquivos de contrato são evidência auditável; deleção prematura violaria rastreabilidade.
- Lifecycle esperado para produção: policy de retenção (ex.: 90 dias após confirm, ou nunca para evidência assinada).

### Melhoria futura (fora de escopo MVP)

- Job de cleanup para `uploaded_documents` sem `storageRef` em `run.request` após 30 dias.
- Integração com object storage (S3/GCS) para escala.
- Flag `retentionPolicy` por tenant.

---

## 3. Run (DB)

| Propriedade | Valor |
|---|---|
| Status inicial | `"pending"` — criado pelo endpoint `POST /confirm` |
| Transição | `pending` → `success` ou `error` — feita pelo action runner (fora do escopo deste módulo) |
| Worker processa | Somente quando `run.status === "success"` |

### RunStatus transitions no intake

```
confirm endpoint:
  createRunRecord(status="pending")

action runner (externo):
  run.status = "running" (início do processamento)
  run.status = "success" ou "error" (conclusão)

worker (imobPostRunMutationWorker):
  run.status !== "success" → skip (imob-intake.run_not_success_skip)
  run.status === "success" → createImobCase → createImobCaseEvent x2
```

### Idempotência do worker

1. **Por documentHash** (`evidenceRef`): se já existe `case.document.intake` com o mesmo hash no tenant/workspace → skip (`EXISTING_CASE_FOUND`). Previne duplicação de cases para o mesmo documento.
2. **Por runId**: se já existe `case.action.completed` para este runId → skip (`already_processed`). Garante idempotência para entregas duplicadas do BullMQ.

---

## 4. BullMQ Job (imobRunCompletedQueue)

| Propriedade | Valor |
|---|---|
| jobId | `imob-run-completed:{tenantId}:{workspaceId}:{runId}` |
| attempts | 3 |
| backoff | exponential, delay=2000ms |
| removeOnComplete | true |
| removeOnFail | false |

### Deduplicação

O `jobId` fixo por `runId` garante que apenas um job de mutação por run seja enfileirado, mesmo se `enqueueImobRunCompleted` for chamado múltiplas vezes para o mesmo run (ex.: retry de webhook do action runner).

### Retry safety

O worker é idempotente: mesmo sob retry (3 tentativas por default), a segunda e terceira execução do job retornam no check de idempotência por runId, sem criar entidades duplicadas.

---

## 5. Resumo de lifecycle end-to-end

```
Upload (.docx)
  ↓ Filesystem: uploads/{uuid}.docx
  ↓ DB: uploaded_documents (storageKey, agentSlug=imob-intake)
  ↓ In-memory: draft (TTL 30min, piiMasked=true, storageRef=uploadedDocument.id)

Confirm (draftId)
  ↓ getDraft → scope check → actionId check → createRunRecord(status=pending)
  ↓ deleteDraft (draft consumed — re-confirm → 409)
  ↓ DB: runs (status=pending, request.documentHash, request.pendingItems, ...)

Action runner (externo)
  ↓ Executa a ação imob.contract.intake
  ↓ DB: runs (status=success ou error)

Worker (imobPostRunMutationWorker)
  ↓ run.status !== "success" → skip
  ↓ documentHash já processado → skip
  ↓ runId já processado → skip
  ↓ DB: imob_cases (stage=documents_collecting, status=ready_for_review)
  ↓ DB: imob_case_events (case.action.completed + case.document.intake)

Export
  ↓ GET /runs/:runId/intake/export?format=html|docx|pdf
  ↓ Lê somente de run/case/event persistidos — nunca de draft
```

---

## 6. Pendências de produção (fora de escopo MVP)

| Item | Prioridade | Decisão necessária |
|---|---|---|
| Draft durável em Redis | P2 | Volume de usuários concurrent esperado |
| Auto-delete de uploadedDocuments | P2 | Política de retenção legal por vertical |
| Object storage para arquivos (.docx) | P1 | Antes de múltiplas instâncias do API |
| Monitoring de drafts expirados sem confirm | P3 | Alerting / SLO |
| removeOnFail: true para jobs processados com sucesso | P3 | Gestão de dead-letter |
