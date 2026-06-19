# IMOB Chat Document Intake — Phase 5.5: Final E2E / Release Candidate

**Data:** 2026-06-18
**Branch:** `feat/imob-chat-document-intake`
**Status:** PARCIAL AVANÇADO — Fase 5.5 evidenciada. Status global permanece PARCIAL AVANÇADO.

---

## Escopo desta evidência

Documenta a Fase 5.5: finalização do fluxo E2E sem insert direto. A evidência cobre:
- Mecanismo canônico de self-completion do confirm endpoint (sem action runner)
- BullMQ jobId bugfix (BullMQ 5.x não aceita `:` em custom jobIds)
- Testes RC-01..03 (integração, banco real, sem insert direto)
- Validação local-docker (script bash, worker em Docker processa automaticamente)

---

## Arquivos alterados

| Arquivo | Papel |
|---|---|
| `apps/api/src/routes/imob.ts` | Confirm endpoint: status=success + enqueueImobRunCompleted |
| `apps/api/src/queues/imobRunCompletedQueue.ts` | Bugfix: jobId sem `:` (BullMQ 5.x) |
| `apps/api/src/tests/imob-intake-confirm.test.ts` | CONF-01/02/03: pending→success; CONF-06: remove run.update |
| `apps/api/src/tests/imob-intake-lifecycle.test.ts` | LC-01: runStatus pending→success |
| `apps/api/src/tests/imob-intake-rc.test.ts` | Novo: 3 testes RC-01..03 (E2E sem insert direto) |
| `package.json` | Script `test:imob-intake:rc` adicionado |
| `scripts/validate-imob-chat-intake-phase55.sh` | Novo: smoke script bash com poll para ImobCase |

---

## Mudança arquitetural: confirm endpoint auto-completa o run

O endpoint `POST /api/imob/chat/intake/confirm/:draftId` foi alterado para:

1. Criar o run com `status: "success"` diretamente (intake é síncrono — processamento feito no upload)
2. Chamar `enqueueImobRunCompleted({ caseId: "INTAKE", ... })` — job enfileirado ao worker
3. Retornar `{ runStatus: "success", mutationQueued: true }`

**Antes (Fase 4.6):** confirm criava run com `status: "pending"`. Nenhum mecanismo automático existia para transicionar para `success` sem o action runner.

**Depois (Fase 5.5):** confirm cria run com `status: "success"` e enfileira o job de mutação. O worker processa o job automaticamente em produção (via BullMQ + Redis). Em testes de integração, `processImobRunCompletedJob` é chamado diretamente.

---

## Bugfix: BullMQ jobId

`imobRunCompletedQueue.ts` usava `:` como separador no `jobId`:
```
imob-run-completed:{tenantId}:{workspaceId}:{runId}  ← INVÁLIDO no BullMQ 5.x
```

Corrigido para:
```
imob-run-completed-{tenantId}-{workspaceId}-{runId}  ← válido
```

Este bug nunca foi ativado antes porque `enqueueImobRunCompleted` nunca era chamado no fluxo real do confirm (apenas em testes que chamavam `processImobRunCompletedJob` diretamente).

---

## Testes de integração (execução real — banco 127.0.0.1:5433)

```bash
pnpm test:imob-intake:rc
```

```
# tests 3
# suites 1
# pass 3
# fail 0
# duration_ms ~1748
```

| Teste | O que prova |
|---|---|
| RC-01 | Upload → Confirm (runStatus=success, mutationQueued=true) → processJob direto → ImobCase criado com stage=documents_collecting |
| RC-02 | Exports HTML/DOCX/PDF acessíveis após criação do case (usando runId de RC-01) |
| RC-03 | PII guard: evidenceDraft sempre retorna piiMasked=true |

---

## Testes atualizados (Fases anteriores)

| Suite | Antes | Depois | Alteração |
|---|---|---|---|
| CONF-01 | `runStatus=pending` | `runStatus=success` | self-complete |
| CONF-02 | `run.status=pending` no DB | `run.status=success` no DB | self-complete |
| CONF-03 | count `status=pending` | count `status=success` | self-complete |
| CONF-06 | precisa de `run.update` manual | sem `run.update` necessário | self-complete |
| LC-01 | `runStatus=pending` | `runStatus=success` | self-complete |

Todos os testes anteriores re-executados e passando:
```
pnpm test:imob-intake:confirm   → 6/6
pnpm test:imob-intake:lifecycle → 6/6
pnpm test:imob-intake:e2e       → 13/13
pnpm test:imob-intake:rc        → 3/3
```

**Total acumulado: 28/28 (suites RC + confirm + lifecycle + E2E fase 2)**

---

## Invariantes verificados (Fase 5.5)

| Código | Invariante | Prova |
|---|---|---|
| I-RC-1 | Confirm endpoint cria run com status=success (self-complete síncrono) | RC-01: DB run.status=success imediatamente após confirm |
| I-RC-2 | Confirm retorna mutationQueued=true | RC-01: response.mutationQueued=true |
| I-RC-3 | Worker processa run sem precisar de run.update manual | RC-01: processJob funciona sem transição manual |
| I-RC-4 | ImobCase criado com stage=documents_collecting, status=ready_for_review | RC-01: assertions no DB |
| I-RC-5 | Exports HTML/DOCX/PDF acessíveis após case criado | RC-02: 3 exports 200 OK |
| I-RC-6 | PII mascarado no draft (piiMasked=true) | RC-03: evidenceDraft.piiMasked=true |
| I-RC-7 | BullMQ jobId não contém `:` (BullMQ 5.x constraint) | bugfix + testes passando |

---

## Limitação de produção: worker em teste

O `imobPostRunMutationWorker` não é iniciado em `NODE_ENV=test` (`apps/api/src/index.ts:110`). Portanto, os testes de integração chamam `processImobRunCompletedJob` diretamente. A entrega BullMQ automática (via Redis) é validada pelo script bash em ambiente Docker, onde o worker está rodando.

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
| Fase 5 lifecycle (integração, banco real) | 6 | 6 |
| **Fase 5.5 RC (integração, banco real)** | **3** | **3** |
| **Total** | **170** | **170** |

---

## Pendências de produção (inalteradas)

| Item | Prioridade |
|---|---|
| Draft durável (Redis TTL) | P2 |
| Auto-delete de uploadedDocuments (política de retenção) | P2 |
| Object storage para arquivos .docx | P1 (antes de multi-instância) |
| Monitoring de drafts expirados sem confirm | P3 |

**Classificação global da feature:** PARCIAL AVANÇADO — não declarar DONE.
