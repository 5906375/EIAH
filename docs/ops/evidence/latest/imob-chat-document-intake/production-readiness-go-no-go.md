# IMOB Chat Document Intake — Production Readiness / Go-No-Go

**Data:** 2026-06-18
**Branch:** `feat/imob-chat-document-intake`
**Commits auditados:** `fd6cfc2` (Phase 5.5), `8fce86d` (Phase 5.6)
**Status:** PILOTO CONTROLADO — single-node, sem object storage, draft não-durável.

---

## 1. Decisão Go/No-Go

| Dimensão | Decisão | Condição |
|---|---|---|
| **Go para piloto controlado (single-node)** | ✅ GO | Smoke E2E local-docker passou 10/10 |
| **Go para multi-instância / escala horizontal** | ❌ NO-GO | Requer object storage antes de multi-instância |
| **Go global (DONE)** | ❌ NO-GO | Pendências P1/P2 documentadas abaixo |

**Classificação:** PILOTO CONTROLADO — não declarar DONE global.

---

## 2. Smoke staging / local-docker (execução real)

Script: `scripts/validate-imob-chat-intake-phase55.sh` (com bugfixes `event_type → type` e `strategy → reasonCode`).

```
API:     http://localhost:8080 (eiah-api Docker, NODE_ENV=staging)
DB:      localhost:5433 (eiah-postgres Docker)
Worker:  imobPostRunMutationWorker iniciado dentro do container eiah-api
BullMQ:  eiah-redis:6379 (Docker)
```

### Resultado

```
[OK] API health check passed
[OK] Test tenant/workspace/token created

[OK] Upload — draftId=ff079ca2-..., evidenceDraft.piiMasked=True
[OK] Confirm — runId=cmqjafd31000bsnod4sib7njp, runStatus=success, mutationQueued=True
[OK] DB run status=success
[OK] No runs with invalid status=queued (regression guard)
[OK] ImobCase created — id=cmqjafd3s000csnodl5ngod1r (worker auto-processou BullMQ job)
[OK] ImobCase stage=documents_collecting, status=ready_for_review
[OK] ImobCaseEvent case.document.intake exists
[OK] HTML export — status=200, X-Export-Hash=cd82eef864fd66ce...
[OK] DOCX export — status=200
[OK] PDF guidance — reasonCode=PDF_DELEGATED_TO_FRONTEND, strategy=client-side-jspdf-or-browser-print
[OK] Teardown complete

=== Phase 5.5 E2E Validation PASSED ===
```

**10/10 verificações passaram. BullMQ delivery automático confirmado em Docker.**

---

## 3. Checklist de readiness

### 3.1 Pronto para piloto controlado (single-node)

| Item | Status | Notas |
|---|---|---|
| Upload DOCX + extração de texto | ✅ Pronto | mammoth, sem deps externas |
| Mascaramento PII (piiMasked=true) | ✅ Pronto | imobContractPiiMasker, testado |
| Classificação de contrato | ✅ Pronto | imobContractClassifier |
| Draft in-memory (TTL 30min) | ✅ Pronto | imobContractDraftService |
| Confirm self-complete (status=success) | ✅ Pronto | fd6cfc2 |
| BullMQ delivery ao worker | ✅ Pronto | confirmado em Docker |
| Criação ImobCase (documents_collecting/ready_for_review) | ✅ Pronto | imobPostRunMutationWorker |
| Export HTML | ✅ Pronto | X-Export-Hash gerado |
| Export DOCX | ✅ Pronto | JSZip/OOXML |
| Export PDF (delegado ao frontend) | ✅ Pronto | guidance JSON |
| Scope guard cross-workspace | ✅ Pronto | LC-02 testado |
| Idempotência por documentHash | ✅ Pronto | E2E-IN-02 testado |
| Idempotência por runId | ✅ Pronto | E2E-IN-03 testado |
| Regression guard status=queued | ✅ Pronto | CONF-03 + smoke |

### 3.2 Não-pronto para produção em escala (bloqueantes)

| Item | Prioridade | Bloqueante para | Ação necessária |
|---|---|---|---|
| **Object storage (.docx)** | **P1** | Multi-instância | Integrar S3/GCS antes de escalar API |
| Draft durável (Redis TTL) | P2 | Restart tolerância | Migrar `Map` in-memory → Redis com TTL |
| Auto-delete de uploadedDocuments | P2 | Retenção legal | Definir política (ex.: 90 dias após confirm) |
| Monitoramento de drafts expirados | P3 | Observabilidade | Alert/SLO para drafts não confirmados |
| removeOnFail: true pós-sucesso | P3 | Dead-letter hygiene | Configurar cleanup de jobs processados |

---

## 4. Arquitetura de storage — decisão single-node vs multi-instância

### 4.1 Storage atual (MVP)

```
Upload DOCX
  ↓ persistBuffer(buffer)
  ↓ fs.writeFileSync(`uploads/${uuid}.docx`)   ← filesystem LOCAL do processo API
  ↓ createUploadedDocument(storageKey=uuid)     ← DB record aponta para filesystem local
```

**Problema para multi-instância:** Se a API escalar para N instâncias, cada instância tem seu próprio filesystem. Uma instância que fez o upload não compartilha o arquivo `.docx` com outras instâncias. O export leria de um filesystem diferente e falharia.

### 4.2 Recomendação para produção

```
Upload DOCX
  ↓ stream para S3/GCS (ex.: bucket imob-intake-uploads)
  ↓ storageKey = s3://bucket/uuid.docx
  ↓ createUploadedDocument(storageKey=s3://...)
  ↓ export → download do S3 via presigned URL ou stream
```

**Decisão imediata:** Para o piloto controlado, manter single-node. Antes de qualquer escalonamento horizontal, integrar object storage. Esta é a única mudança com impacto de dado (migração de storageKey no DB).

---

## 5. Draft em memória — impacto em restart e scaling

### 5.1 Comportamento atual

```typescript
// imobContractDraftService.ts
const draftStore = new Map<string, StoredDraft>();  // in-process, não persistido
const DRAFT_TTL_MS = 30 * 60 * 1000;              // 30 minutos
```

**Impactos:**
- **Restart do processo API:** Todos os drafts são perdidos. Usuários com upload pendente devem re-iniciar o fluxo.
- **Multi-instância:** Um upload feito na instância A não é visível na instância B. Se o load balancer rotear o confirm para B, o draft não é encontrado → 409 DRAFT_EXPIRED.
- **Deploy rolling:** Se o deploy ocorrer entre upload e confirm (dentro dos 30min), o draft é perdido.

### 5.2 Impacto aceitável para piloto

Para single-node com deploy consciente (janela de manutenção), o impacto é mínimo:
- TTL de 30min é suficiente para o fluxo completo (upload → review → confirm em < 5min em média)
- Comunicar ao usuário: "Em caso de timeout, re-upload o documento"

### 5.3 Caminho de migração futura

```typescript
// Migração planejada (não implementada):
// draftStore → Redis com TTL nativo
// const draft = await redis.get(`draft:${draftId}`);
// await redis.setex(`draft:${draftId}`, 1800, JSON.stringify(draft));
```

Requer decisão de volume antes de implementar (Redis já disponível na infra via `eiah-redis`).

---

## 6. Retenção e auto-delete de uploadedDocuments

### 6.1 Comportamento atual (MVP)

- DB records (`uploaded_documents`): persistem indefinidamente
- Arquivos físicos (`uploads/{uuid}.docx`): persistem no filesystem do processo API

**Justificativa:** Arquivos de contrato são evidência auditável. Deleção prematura violaria rastreabilidade no MVP.

### 6.2 Política recomendada para produção

| Cenário | Retenção recomendada | Decisão necessária |
|---|---|---|
| Upload sem confirm (expirado) | 7 dias | Job de cleanup por `createdAt` sem `run` vinculado |
| Upload confirmado (draft → case) | Conforme política do cliente | SLA contratual ou LGPD |
| Evidência de caso encerrado | Indefinido / archival | Decisão jurídica |

**Ação:** Implementar job periódico de cleanup para uploads sem confirm após 7 dias (fora de escopo MVP).

---

## 7. Rollback plan

### 7.1 Rollback do confirm endpoint

O confirm endpoint (antes da Fase 5.5) criava runs com `status="pending"` e não enfileirava jobs. Para reverter:

1. Reverter `apps/api/src/routes/imob.ts` para o commit pré-`fd6cfc2`
2. Reverter `apps/api/src/queues/imobRunCompletedQueue.ts` (jobId fix)
3. Fazer restart do API

**Impacto do rollback:** Runs criados após `fd6cfc2` com `status="success"` permanecem no DB. Estes runs têm `ImobCase` associado (já processados pelo worker). Não há dados corrompidos — apenas runs que antes ficavam `pending` agora estão `success`. Rollback é seguro.

### 7.2 Rollback de ImobCases já criados

**Não necessário.** ImobCases criados pelo worker são entidades independentes com lifecycle próprio. O rollback do código não afeta casos já criados.

### 7.3 Gatilho de rollback

Rollback justificado se:
- Worker criar `ImobCase` duplicado (verificar idempotência — guard por documentHash)
- Export retornar dados com PII não mascarado (anti-PII scan já ativo)
- Taxa de erro em `imobRunCompletedQueue` > 5% em 1h

---

## 8. Pendências P1/P2 — registro formal

| Item | Prioridade | Impacto se ignorado | Owner sugerido |
|---|---|---|---|
| **Object storage (.docx)** | **P1 — bloqueante para scale** | Perda de arquivos em multi-instância | Infra/Backend |
| Draft durável (Redis) | P2 — risco operacional | Perda de drafts em restart/deploy | Backend |
| Auto-delete uploads sem confirm | P2 — acúmulo de storage | Crescimento ilimitado de `uploads/` | Backend/DevOps |
| Política de retenção de contratos | P2 — conformidade | LGPD/contratual | Jurídico/Produto |
| Monitoramento drafts expirados | P3 — observabilidade | SLO sem baseline | Engenharia |

---

## 9. Evidências acumuladas da feature

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
| 5.5 RC (integração, banco real) | 3 | 3 |
| **Smoke local-docker (Phase 6)** | **10/10** | **10/10** |
| **Total testes de integração** | **170** | **170** |

check:evidence-index: ok (288 refs)

---

**Classificação final:** PILOTO CONTROLADO (single-node) — não declarar DONE global.
