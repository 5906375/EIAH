# IMOB Chat Document Intake — Phase 4.6: RunStatus Confirm Fix (local-docker)

**Data:** 2026-06-18
**Branch:** `feat/imob-chat-document-intake`
**Status:** PARCIAL AVANÇADO — Fase 4.6 evidenciada. Status global permanece PARCIAL AVANÇADO.

---

## Bug corrigido

O endpoint `POST /api/imob/chat/intake/confirm/:draftId` usava `status: "queued" as any` ao criar um run via Prisma. O enum `RunStatus` no banco (`{pending, running, success, error, blocked}`) não inclui `"queued"`. A cast `as any` contornou o TypeScript mas falhou no runtime do Prisma com:

```
Invalid value for argument `status`. Expected RunStatus.
```

**Fix:** substituir `"queued" as any` por `"pending"` (status canônico inicial usado em toda a codebase: `runs.ts:676`, `agents.ts:552`, `shadow-executions.ts:422`).

**Localização da alteração:** `apps/api/src/routes/imob.ts:3779`

---

## Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `apps/api/src/routes/imob.ts` | Linha 3779: `status: "queued" as any` → `status: "pending"` |
| `apps/api/src/tests/imob-intake-confirm.test.ts` | Novo — teste de integração CONF-01..06 |
| `package.json` | Script `test:imob-intake:confirm` adicionado |
| `scripts/validate-imob-chat-intake-phase46.sh` | Novo — script de validação local-docker |

---

## Testes de integração (execução real — banco 127.0.0.1:5433)

```bash
pnpm test:imob-intake:confirm
```

```
# tests 6
# suites 1
# pass 6
# fail 0
# duration_ms ~1697
```

| Teste | O que prova |
|---|---|
| CONF-01 | `POST /confirm/:draftId` retorna `ok=true`, `runId`, `runStatus=pending` |
| CONF-02 | Run no DB tem `status="pending"` e `actionId="imob.contract.intake"` |
| CONF-03 | Nenhum run com `status="queued"` criado (regression guard) |
| CONF-04 | draftId inexistente → 409 `DRAFT_EXPIRED` |
| CONF-05 | Sem Authorization → 401/403 |
| CONF-06 | Worker processa run success → `ImobCase` criado com `stage=documents_collecting`, `status=ready_for_review` |

---

## Validação local-docker (execução real)

```bash
bash scripts/validate-imob-chat-intake-phase46.sh
```

### Ambiente

| Serviço | Status |
|---|---|
| `eiah-api` | healthy (port 8080) |
| `eiah-postgres` | healthy (port 5433) |

### Resultado

```
[OK] API health check passed
[OK] Upload — draftId=ae877fef-..., piiMasked=True
[OK] Confirm — runId=cmqj8rp2w00071bod485autic, runStatus=pending
[OK] DB run status=pending — no queued runs (regression guard passed)
[OK] Run marked success — ImobCase created
[OK] HTML export — status=200, X-Export-Hash=c27506a99641edcd3fe2c7fdbe5d042eb76b2da8d4f1052c83849d042b142dfd
[OK] DOCX export — status=200
[OK] PDF guidance — reasonCode=PDF_DELEGATED_TO_FRONTEND
```

---

## Invariantes verificados (Fase 4.6)

| Código | Invariante | Prova |
|---|---|---|
| I-46-1 | `POST /confirm/:draftId` cria run com `status=pending` (enum válido) | Resposta: `{"runStatus":"pending"}` — CONF-01, validação docker |
| I-46-2 | DB run tem `status="pending"` — nunca `"queued"` | CONF-02: `run.status === "pending"` confirmado no banco real |
| I-46-3 | `"queued"` é rejeitado pelo enum do banco | CONF-03: DB lança `invalid input value for enum "RunStatus"` ao tentar `WHERE status='queued'` |
| I-46-4 | Worker processa run success → `ImobCase` criado | CONF-06: `ImobCase.stage=documents_collecting`, `ImobCase.status=ready_for_review` |
| I-46-5 | ChatAgentLauncher não alterado | Nenhuma linha de `ChatAgentLauncher.tsx` foi tocada |
| I-46-6 | stage/status/journeyType IMOB inalterados | Fase 4.6 corrige RunStatus — não cria nenhum novo stage/status/journeyType |
| I-46-7 | Não há insert direto como substituto do confirm real | CONF-01..04 usam supertest contra Express real; nenhum insert manual |

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
| **Fase 4.6 confirm fix (integração, banco real)** | **6** | **6** |
| **Total** | **161** | **161** |

---

**Classificação global da feature:** PARCIAL AVANÇADO — não declarar DONE.
