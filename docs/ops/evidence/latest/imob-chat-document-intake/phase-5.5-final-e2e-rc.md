# IMOB Chat Document Intake — Phase 5.5 Final E2E RC

**Data:** 2026-06-18
**Branch:** `feat/imob-chat-document-intake`
**Commit:** `fd6cfc2`
**Status:** PARCIAL AVANÇADO — evidência final da Fase 5.5 aceita. Status global permanece PARCIAL AVANÇADO.

---

## 1. Mudança arquitetural principal

### POST /api/imob/chat/intake/confirm/:draftId — self-completion

O confirm endpoint foi alterado para auto-completar o run de intake em vez de aguardar o action runner:

```
Antes (Fases 4.6 / 5):
  confirm → createRunRecord(status="pending")
  → ação pendente (action runner não integrado para intake)

Depois (Fase 5.5):
  confirm → createRunRecord(status="success")
  → enqueueImobRunCompleted({ caseId: "INTAKE", ... })
  → response { runStatus: "success", mutationQueued: true }
```

**Justificativa:** O intake é um fluxo **síncrono**. O documento já foi processado na etapa de upload (extração de texto, mascaramento de PII, classificação, criação do draft). O confirm apenas confirma o resultado e registra a evidência — não há nenhuma ação assíncrona a aguardar. Portanto, o run pode ser marcado como `"success"` imediatamente.

**Contrato da resposta:**
```json
{
  "ok": true,
  "runId": "<cuid>",
  "runStatus": "success",
  "actionId": "imob.contract.intake",
  "source": "chat-imob",
  "mutationQueued": true,
  "message": "Run concluído. Mutação do caso enfileirada para o worker."
}
```

**Fluxo de mutação:** A função `enqueueImobRunCompleted` adiciona um job ao `imobRunCompletedQueue` (BullMQ). Em produção, o `imobPostRunMutationWorker` (iniciado via `apps/api/src/index.ts:115`) processa o job automaticamente via Redis e cria o `ImobCase` + 2x `ImobCaseEvent`.

---

## 2. Bugfix: BullMQ jobId com `:` inválido

**Arquivo:** `apps/api/src/queues/imobRunCompletedQueue.ts`

```typescript
// Antes (BullMQ 5.x rejeita ':' em custom jobIds — bug latente):
const jobId = `imob-run-completed:${tenantId}:${workspaceId}:${runId}`;

// Depois (válido):
const jobId = `imob-run-completed-${tenantId}-${workspaceId}-${runId}`;
```

O bug era **latente**: `enqueueImobRunCompleted` nunca havia sido chamada no fluxo real do confirm (testes anteriores chamavam `processImobRunCompletedJob` diretamente). A primeira chamada real ao BullMQ em runtime revelou a violação da constraint do BullMQ 5.66.2.

---

## 3. Resultados dos testes

Todos os testes executados contra banco real (`127.0.0.1:5433`), sem mocks.

### 3.1 Confirm endpoint (CONF-01..06)

```bash
pnpm test:imob-intake:confirm
# tests 6 / pass 6 / fail 0
```

| Teste | O que prova |
|---|---|
| CONF-01 | upload + confirm → ok=true, runStatus=**success**, mutationQueued=true |
| CONF-02 | run no DB com status=**success** e actionId=imob.contract.intake |
| CONF-03 | nenhum run com status=queued (regression guard); confirm cria status=success |
| CONF-04 | draftId expirado/inválido → 409 DRAFT_EXPIRED |
| CONF-05 | sem Authorization → 401/403 |
| CONF-06 | worker processa run success → ImobCase criado (sem run.update manual) |

### 3.2 Lifecycle hardening (LC-01..06)

```bash
pnpm test:imob-intake:lifecycle
# tests 6 / pass 6 / fail 0
```

LC-01 atualizado: `runStatus=success` (era `"pending"` antes da Fase 5.5).

### 3.3 E2E worker Phase 2 (E2E-IN-01..07)

```bash
pnpm test:imob-intake:e2e
# tests 13 / pass 13 / fail 0
```

Sem alterações. Idempotência por documentHash, por runId, PII guard, sentinel INTAKE verificados.

### 3.4 RC Phase 5.5 (RC-01..03)

```bash
pnpm test:imob-intake:rc
# tests 3 / pass 3 / fail 0
```

| Teste | O que prova |
|---|---|
| RC-01 | Upload → Confirm (self-complete) → processJob direto → ImobCase + event criados **sem insert direto** e **sem run.update manual** |
| RC-02 | Exports HTML/DOCX/PDF acessíveis para o run criado em RC-01 |
| RC-03 | PII guard: evidenceDraft.piiMasked=true em toda resposta de upload |

### 3.5 Acumulado da feature

| Fase | Testes | Pass |
|---|---|---|
| 1A — PII masker + extrator | 37 | 37 |
| 1B — adapter + classifier + draft + pipeline | 41 | 41 |
| 2 — E2E worker (banco real) | 13 | 13 |
| 3 — renderer (unit) | 15 | 15 |
| 3 — export (integração, banco real) | 13 | 13 |
| 4 — UI component (renderToStaticMarkup) | 36 | 36 |
| 4.6 — confirm fix (integração, banco real) | 6 | 6 |
| 5 — lifecycle (integração, banco real) | 6 | 6 |
| **5.5 RC (integração, banco real)** | **3** | **3** |
| **Total** | **170** | **170** |

### 3.6 check:evidence-index

```bash
pnpm check:evidence-index
# { "ok": true, "refsChecked": 287 }
```

---

## 4. Validação local-docker (BullMQ delivery automático)

Script: `scripts/validate-imob-chat-intake-phase55.sh`

Valida o fluxo completo com o worker rodando em Docker (`eiah-api`):

```
[OK] API health check passed
[OK] Upload — draft.piiMasked=True, evidenceDraft.piiMasked=True
[OK] Confirm — runStatus=success, mutationQueued=True
[OK] DB run status=success
[OK] No runs with invalid status=queued (regression guard)
[OK] ImobCase created — worker processou BullMQ job automaticamente
[OK] ImobCase stage=documents_collecting, status=ready_for_review
[OK] ImobCaseEvent case.document.intake exists
[OK] HTML export — status=200, X-Export-Hash=<hash>
[OK] DOCX export — status=200
[OK] PDF guidance — PDF_DELEGATED_TO_FRONTEND
```

**Nota sobre worker em testes:** Em `NODE_ENV=test`, o worker não é iniciado (`apps/api/src/index.ts:110: if (process.env.NODE_ENV !== "test")`). Os testes de integração usam `processImobRunCompletedJob` diretamente. A entrega BullMQ é validada exclusivamente pelo script bash em Docker.

---

## 5. Invariantes verificados (Fase 5.5)

| Código | Invariante | Prova |
|---|---|---|
| I-RC-1 | Confirm cria run com status=success (sem pendência de action runner) | CONF-02: DB run.status=success; RC-01: idem |
| I-RC-2 | Confirm retorna mutationQueued=true | CONF-01, RC-01 |
| I-RC-3 | Worker processa job sem run.update manual | CONF-06, RC-01 (sem update explícito) |
| I-RC-4 | ImobCase stage=documents_collecting, status=ready_for_review | RC-01, CONF-06 |
| I-RC-5 | Exports acessíveis após case criado | RC-02 (HTML/DOCX/PDF 200 OK) |
| I-RC-6 | PII mascarado: evidenceDraft.piiMasked=true | RC-03 |
| I-RC-7 | BullMQ jobId não contém `:` (BullMQ 5.x) | bugfix + testes passando |
| I-LC-7* | Draft consumido ao confirmar; re-confirm → 409 | LC-01 (invariante de Fase 5, mantido) |

---

## 6. Pendências de produção (P1/P2 — fora de escopo MVP)

| Item | Prioridade | Decisão necessária |
|---|---|---|
| **Object storage para arquivos .docx** | **P1** | Obrigatório antes de múltiplas instâncias do API (filesystem local não é compartilhado) |
| Draft durável em Redis (TTL) | P2 | Volume de usuários concorrentes esperado |
| Auto-delete de uploadedDocuments | P2 | Política de retenção legal por vertical |
| Monitoramento de drafts expirados sem confirm | P3 | Alerting / SLO |
| removeOnFail: true para jobs já processados | P3 | Gestão de dead-letter queue |

**Classificação global da feature:** PARCIAL AVANÇADO — não declarar DONE.
