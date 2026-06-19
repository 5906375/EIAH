# IMOB Chat Document Intake — Phase 5: Lifecycle Hardening (local-docker)

**Data:** 2026-06-18
**Branch:** `feat/imob-chat-document-intake`
**Status:** PARCIAL AVANÇADO — Fase 5 evidenciada. Status global permanece PARCIAL AVANÇADO.

---

## Escopo desta evidência

Documenta a Fase 5: lifecycle hardening do intake de contrato IMOB. A evidência cobre:
- Draft consume/scope (HTTP level)
- UploadedDocument persistence (DB)
- Worker RunStatus guards (pending/running)
- Política MVP de lifecycle documentada
- Local-docker smoke (confirm real + export pipeline)

---

## Arquivos alterados

| Arquivo | Papel |
|---|---|
| `apps/api/src/tests/imob-intake-lifecycle.test.ts` | 6 testes LC-01..06 contra banco real |
| `package.json` | Script `test:imob-intake:lifecycle` adicionado |
| `docs/ops/imob-chat-intake-lifecycle-policy.md` | Política MVP de lifecycle documentada |

---

## Testes de integração (execução real — banco 127.0.0.1:5433)

```bash
pnpm test:imob-intake:lifecycle
```

```
# tests 6
# suites 3
# pass 6
# fail 0
# duration_ms ~2682
```

| Grupo | Teste | O que prova |
|---|---|---|
| Draft lifecycle | LC-01 | Confirm consome draft; re-confirm retorna 409 DRAFT_EXPIRED |
| Draft lifecycle | LC-02 | Confirm com token de workspace diferente → 403 DRAFT_SCOPE_MISMATCH |
| UploadedDocument | LC-03 | Upload cria `uploadedDocument` com `tenantId`, `workspaceId`, `agentSlug=imob-intake`, MIME correto |
| UploadedDocument | LC-04 | `draft.evidenceDrafts[0].storageRef` = `uploadedDocument.id` no DB |
| Worker guards | LC-05 | `run.status=pending` → worker skip (`imob-intake.run_not_success_skip`) → nenhum `ImobCase` criado |
| Worker guards | LC-06 | `run.status=running` → worker skip → nenhum `ImobCase` criado |

---

## Validação local-docker (execução real)

```bash
bash scripts/validate-imob-chat-intake-phase46.sh
```

```
[OK] API health check passed
[OK] Upload — piiMasked=True
[OK] Confirm — runStatus=pending
[OK] DB run status=pending — no queued runs (regression guard)
[OK] HTML export — status=200, X-Export-Hash=6fcdd8ac6d96213962bbbdba6199c71135888b512334a434c495bf1ca77acbca
[OK] DOCX export — status=200
[OK] PDF guidance — PDF_DELEGATED_TO_FRONTEND
```

---

## Invariantes verificados (Fase 5)

| Código | Invariante | Prova |
|---|---|---|
| I-LC-1 | Draft consumido em confirm — re-confirm → 409 | LC-01: HTTP 409 + reasonCode DRAFT_EXPIRED |
| I-LC-2 | Draft scoped ao workspace que fez upload — cross-ws → 403 | LC-02: HTTP 403 + reasonCode DRAFT_SCOPE_MISMATCH |
| I-LC-3 | Upload persiste `uploadedDocument` no DB | LC-03: DB count incrementa, agentSlug=imob-intake verificado |
| I-LC-4 | storageRef no draft = uploadedDocument.id no DB | LC-04: lookup por storageRef retorna o registro correto |
| I-LC-5 | Worker skip para status=pending (action runner não concluiu) | LC-05: zero ImobCase criado, log `run_not_success_skip` emitido |
| I-LC-6 | Worker skip para status=running (action runner em andamento) | LC-06: zero ImobCase criado, log `run_not_success_skip` emitido |
| I-LC-7 | Confirm retorna runStatus=pending (não queued) | Local-docker smoke + CONF-01 (Fase 4.6) |

---

## Política MVP documentada

Ver `docs/ops/imob-chat-intake-lifecycle-policy.md` para:
- Draft TTL=30min, in-memory, não-durável por design
- UploadedDocument: persiste indefinidamente no MVP (sem auto-delete)
- RunStatus: pending (confirm) → success/error (action runner) → worker processa se success
- BullMQ jobId determinístico por runId (deduplicação)
- Idempotência dupla do worker: documentHash + runId

---

## Histórico acumulado (todas as fases)

| Fase | Testes | Pass |
|---|---|---|
| 1A (PII masker + extrator) | 37 | 37 |
| 1B (adapter + classifier + draft + pipeline) | 41 | 41 |
| Fase 2 E2E (worker, banco real) | 13 | 13 |
| Fase 3 renderer (unit) | 15 | 15 |
| Fase 3 export (integração, banco real) | 13 | 13 |
| Fase 4 UI component (renderToStaticMarkup) | 36 | 36 |
| Fase 4.6 confirm fix (integração, banco real) | 6 | 6 |
| **Fase 5 lifecycle (integração, banco real)** | **6** | **6** |
| **Total** | **167** | **167** |

---

## Pendências de produção (fora de escopo MVP)

| Item | Prioridade |
|---|---|
| Draft durável (Redis TTL) | P2 |
| Auto-delete de uploadedDocuments (política de retenção) | P2 |
| Object storage para arquivos .docx | P1 (antes de multi-instância) |
| Monitoring de drafts expirados sem confirm | P3 |

**Classificação global da feature:** PARCIAL AVANÇADO — não declarar DONE.
