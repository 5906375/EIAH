# IMOB Chat Document Intake — Phase 4: Chat UI Render-Only (local-docker)

**Data:** 2026-06-17
**Branch:** `feat/imob-chat-document-intake`
**Commit:** `9b5c2e9`
**Status:** PARCIAL AVANÇADO — Fases 1A, 1B, 2, 2.5, 3, 3.5 e 4 evidenciadas. Staging completo pendente.

---

## Escopo desta evidência

Documenta a Fase 4: widgets Chat UI render-only para o intake de contrato IMOB. A evidência cobre:
- Validação real contra o ambiente local-docker (API em `localhost:8080`, DB em `localhost:5433`)
- Testes de componente (36/36 via `renderToStaticMarkup`)
- Testes de contrato de API client (6/6)
- Guards de PII verificados em runtime
- ChatAgentLauncher não alterado

---

## Arquivos alterados (Fase 4)

| Arquivo | Papel |
|---|---|
| `apps/web/src/lib/api.ts` | `ImobContractIntakeDraftWidget`, `ImobContractIntakeResultWidget` (union `ImobPresentationWidget`); `apiImobIntakeUpload`, `apiImobIntakeConfirm`, `apiImobIntakeExportDownload`, `apiImobIntakePdfGuidance` |
| `apps/web/src/features/imob/ImobContractIntakeDraftCard.tsx` | View pura + wrapper interativo; state machine pending→confirming→confirmed/error; piiMasked=true garantido pelo backend |
| `apps/web/src/features/imob/ImobContractIntakeResultCard.tsx` | View pura + wrapper; Exportar HTML/DOCX (binary download), Orientação PDF (guidance JSON — não arquivo), Ver no Command Center |
| `apps/web/src/features/imob/ImobChatWidgets.tsx` | Branches `contract_intake_draft` e `contract_intake_result` adicionadas; render puro sem lógica de negócio |
| `apps/web/src/features/imob/imobContractIntakeDraftCard.test.tsx` | 14 testes DC-1..14 (`renderToStaticMarkup`) |
| `apps/web/src/features/imob/imobContractIntakeResultCard.test.tsx` | 16 testes RC-1..16 (`renderToStaticMarkup`) |
| `apps/web/src/features/imob/imobContractIntakeApiClient.test.ts` | 6 testes AC-1..6 (contrato de URL e resposta) |
| `package.json` | Script `test:imob-intake:ui` |

---

## Validação local-docker (execução real)

### Ambiente

| Serviço | Imagem | Status |
|---|---|---|
| `eiah-api` | `node:20-bookworm` | running (port 8080) |
| `eiah-web` | `node:20-bookworm` | healthy (port 5173) |
| `eiah-postgres` | postgres | healthy (port 5433) |

### Fluxo validado

```
1. API health check
   GET /api/health → {"status":"healthy","dependencies":{"database":"connected","agentRuntime":"ready"}}

2. Upload de contrato DOCX
   POST /api/imob/chat/intake/upload (multipart, DOCX válido)
   → {"ok":true,"draft":{
        "draftId":"e83c5da1-...",
        "requiresConfirmation":true,
        "pendingItems":["...","...","..."],   ← 3 itens (sem PII)
        "evidenceDrafts":[{"piiMasked":true,"documentHash":"ed3c..."}]
      }}
   Guards verificados:
     piiMasked=true: PASS
     CPF no payload: False (PASS)
     CNPJ no payload: False (PASS)

3. Confirm endpoint
   POST /api/imob/chat/intake/confirm/:draftId
   NOTA: endpoint tem bug pré-existente — status="queued" não está no enum RunStatus
   do banco ({pending,running,success,error,blocked,awaiting_approval}).
   Este bug é independente da Fase 4 (não introduzido por nenhuma alteração desta fase).
   Workaround: run inserido diretamente (status=success), idêntico ao padrão dos
   testes de integração Phase 3.

4. Export HTML
   GET /api/imob/runs/:runId/intake/export?format=html
   → HTTP 200 text/html
     X-Export-Hash: 4a5bfb4109f2c8b6... (64-char SHA-256)
     X-Generated-At: <ISO 8601>
   PASS

5. Export DOCX
   GET /api/imob/runs/:runId/intake/export?format=docx
   → HTTP 200 application/vnd.openxmlformats-officedocument...
   PASS

6. PDF guidance (não é arquivo)
   GET /api/imob/runs/:runId/intake/export?format=pdf
   → HTTP 200 JSON {
       "reasonCode": "PDF_DELEGATED_TO_FRONTEND",
       "strategy": "client-side-jspdf-or-browser-print",
       "htmlExportUrl": "/api/imob/runs/.../intake/export?format=html"
     }
   PDF é guidance JSON — não é arquivo server-side binário. PASS
```

---

## Testes automatizados (execução real — node:test + renderToStaticMarkup)

### UI component tests

```bash
pnpm test:imob-intake:ui
```

```
# tests 36
# suites 5
# pass 36
# fail 0
# duration_ms ~811
```

| Suite | Testes | O que prova |
|---|---|---|
| `ImobContractIntakeDraftCard — view` | DC-1..14 | Pending items, risk flags, contract type labels, fases, confirm button, no CPF/CNPJ/email |
| `ImobContractIntakeResultCard — view` | RC-1..16 | Stage/status labels, nextStep, export buttons, PDF button "Orientação" (não "Download"), guidance msg, no PII |
| `apiImobIntakeConfirm` | AC-1..2 | POST para URL correta, encodeURIComponent no draftId |
| `apiImobIntakePdfGuidance` | AC-3 | GET para URL correta com format=pdf |
| `apiImobIntakeExportDownload` | AC-4..6 | URL correta HTML/DOCX, throws em non-ok response |

### Histórico acumulado (todas as fases)

| Fase | Testes | Pass |
|---|---|---|
| 1A (PII masker + extrator) | 37 | 37 |
| 1B (adapter + classifier + draft + pipeline) | 41 | 41 |
| Fase 2 E2E (worker, banco real) | 13 | 13 |
| Fase 3 renderer (unit) | 15 | 15 |
| Fase 3 export (integração, banco real) | 13 | 13 |
| **Fase 4 UI component (renderToStaticMarkup)** | **36** | **36** |
| **Total** | **155** | **155** |

### check:evidence-index

```bash
pnpm check:evidence-index
```

```json
{ "ok": true, "refsChecked": 283 }
```

---

## Invariantes verificados (Fase 4)

| Código | Invariante | Prova |
|---|---|---|
| I-UI-1 | ChatAgentLauncher não foi alterado | Nenhuma linha de `ChatAgentLauncher.tsx` foi tocada em toda a Fase 4 |
| I-UI-2 | Widgets são render-only (zero lógica de negócio no launcher) | `ImobChatWidgets.tsx` apenas faz branch por `widget.kind` e delega ao card |
| I-UI-3 | PII não aparece nos cards | DC-11..13 (draft): sem CPF, CNPJ, email; RC-14..15 (result): sem CPF, email; hasCPF=False provado em runtime |
| I-UI-4 | PDF é guidance JSON — não arquivo server-side | Botão "Orientação PDF" chama `apiImobIntakePdfGuidance`; retorna `PDF_DELEGATED_TO_FRONTEND`; provado em runtime |
| I-UI-5 | piiMasked=true enforced no upload | Upload real retornou `evidenceDrafts[0].piiMasked=True` |
| I-UI-6 | stage/status/journeyType inalterados | Fase 4 apenas lê valores canônicos — não cria nenhum novo |
| I-UI-7 | Export protegido por auth | Todos os exports requerem `Authorization: Bearer <token>` |
| I-UI-8 | "Ver no Command Center" é link — não muta estado | `commandCenterHref="/app/imob/cases"` via prop, renderizado como `<a href>` |

---

## Nota sobre confirm endpoint (bug pré-existente)

O endpoint `POST /api/imob/chat/intake/confirm/:draftId` tenta criar um run com `status: "queued" as any`. O enum `RunStatus` no banco não inclui `"queued"` (`{pending, running, success, error, blocked, awaiting_approval}`). Esta é uma inconsistência pré-existente no schema, não introduzida pela Fase 4. A validação usou o mesmo padrão dos testes de integração da Fase 3 (insert direto no banco com `status=success`).

---

## Pendências (fases não implementadas)

| Fase | Escopo | Status |
|---|---|---|
| Link "Abrir Dossiê" | Chat card result → `/app/imob/cases/:caseId` dinâmico | Não implementado |
| Confirm endpoint enum | Corrigir `status: "queued"` para status válido no enum | Bug pré-existente, fora do escopo Phase 4 |
| Staging real com browser | Playwright/Cypress no fluxo completo visual | Pendente |

**Classificação global da feature:** PARCIAL AVANÇADO — não declarar DONE.
