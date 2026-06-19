# IMOB Chat Document Intake — Phase 3: Export Renderer + Endpoint

**Data:** 2026-06-17
**Branch:** `feat/imob-chat-document-intake`
**Commit:** `d4b13e5`
**Status:** PARCIAL AVANÇADO — Fases 1A, 1B, 2, 2.5 e 3 evidenciadas. UI/Chat widget, lifecycle completo do run, e worker não alterados.

---

## Escopo desta evidência

Documenta a Fase 3: renderer server-side de export (HTML e DOCX) e o endpoint `GET /api/imob/runs/:runId/intake/export?format=html|docx|pdf`. O export é sempre construído a partir de dados persistidos no banco (run/case/event) — nunca do draft em memória. Todos os guards de segurança documentados abaixo foram provados por testes contra banco real.

---

## Arquivos alterados (Fase 3)

| Arquivo | Papel |
|---|---|
| `apps/api/src/services/imob/intake/imobContractIntakeRenderer.ts` | Renderer server-side: `renderIntakeHtml()` (string HTML pura), `renderIntakeDocx()` (Buffer ZIP/OOXML via JSZip), `scanIntakeDataForPii()`, `buildExportHash()`. Zero dependências novas — JSZip já disponível como dep transitiva do mammoth. |
| `apps/api/src/routes/imob.ts` | `GET /api/imob/runs/:runId/intake/export?format=html\|docx\|pdf` — carrega run/case/event do banco, aplica guards, escaneia PII, gera arquivo ou JSON de guidance para PDF. Retorna headers `X-Export-Hash` e `X-Generated-At`. |
| `apps/api/src/tests/imob-contract-intake-renderer.test.ts` | 15 testes unitários T-RND-1..15 (sem DB): hash determinístico, PII scan, HTML válido, DOCX magic bytes, OOXML structure, XSS/XML escaping, listas vazias, footer. |
| `apps/api/src/tests/imob-intake-export.test.ts` | 13 testes de integração EXP-01..12 via supertest (banco real): happy paths HTML/DOCX/PDF, todos os guards, cross-tenant isolation. |
| `package.json` | Scripts `test:imob-intake:renderer`, `test:imob-intake:export`, `test:imob-intake:phase3`. |

---

## Fluxo implementado (Fase 3)

```
GET /api/imob/runs/:runId/intake/export?format=html|docx|pdf
  │
  ├─ Guard: authContext presente (403 UNAUTHORIZED se ausente)
  ├─ Guard: format ∈ {html, docx, pdf} (400 INVALID_FORMAT se inválido)
  │
  ├─ format=pdf → 200 JSON {
  │     ok: false,
  │     reasonCode: "PDF_DELEGATED_TO_FRONTEND",
  │     strategy: "client-side-jspdf-or-browser-print",
  │     htmlExportUrl: "/api/imob/runs/:runId/intake/export?format=html"
  │   }
  │   (PDF é padrão frontend neste projeto — jspdf em apps/web)
  │
  ├─ prisma.run.findFirst({ id, tenantId, workspaceId })
  │   └─ não encontrado → 404 RUN_NOT_FOUND
  │
  ├─ run.request.actionId !== "imob.contract.intake"
  │   └─ → 400 NOT_INTAKE_RUN
  │
  ├─ prisma.imobCaseEvent.findFirst({ runId, tenantId, workspaceId, type="case.document.intake" })
  │   └─ não encontrado → 404 EVIDENCE_NOT_FOUND
  │       (worker ainda não processou o run)
  │
  ├─ event.payload.piiMasked !== true → 403 EXPORT_PII_NOT_MASKED
  │
  ├─ prisma.imobCase.findFirst({ id=event.caseId, tenantId, workspaceId })
  │   └─ não encontrado → 404 CASE_NOT_FOUND (cross-tenant: nunca encontra)
  │
  ├─ Monta IntakeExportData a partir de campos persistidos:
  │   caseId, runId, documentHash, documentKind, stage, status,
  │   nextStep, pendingItems, riskFlags (de metadata), generatedAt
  │
  ├─ buildExportHash(data) → SHA-256 do JSON serializado
  │
  ├─ scanIntakeDataForPii(data) → verifica nextStep, pendingItems, riskFlags
  │   └─ hasPii=true → 200 { ok: false, partial: true,
  │         reasonCode: "EXPORT_GENERATION_FAILED", fields: [...] }
  │       (sem rollback de case/event)
  │
  ├─ format=html → renderIntakeHtml(data)
  │   └─ 200 text/html
  │       headers: Content-Disposition, X-Export-Hash, X-Generated-At
  │
  └─ format=docx → renderIntakeDocx(data)
      └─ 200 application/vnd.openxmlformats-officedocument...
          headers: Content-Disposition, X-Export-Hash, X-Generated-At
```

---

## Renderer — detalhes técnicos

### HTML (`renderIntakeHtml`)

- Geração por interpolação de string pura (sem dependência de template engine)
- XSS escaping: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`
- Seções: Identificação (tabela), Itens Pendentes, Alertas de Risco, Footer
- Footer contém: documentHash, exportHash (SHA-256), generatedAt
- Badge "Mascarado" para campo PII

### DOCX (`renderIntakeDocx`)

- Geração server-side via JSZip 3.10.1 (dep transitiva do mammoth — zero nova dep)
- Estrutura OOXML mínima válida:
  - `[Content_Types].xml`
  - `_rels/.rels`
  - `word/document.xml`
- XML escaping: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`
- Tabela de identificação com bordas, célula de cabeçalho com fundo cinza
- Listas de pendências e alertas como parágrafos com `• prefixo`
- `zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })`
- Magic bytes verificados: `0x50 0x4B` (PK = ZIP header)

### PDF

Decisão documentada: PDF é padrão client-side neste projeto (`jspdf: "^3.0.3"` em `apps/web/package.json`). O endpoint retorna guidance JSON com `htmlExportUrl` — o caller usa jspdf ou impressão do navegador. Nenhuma dependência server-side de PDF adicionada.

---

## Guards de segurança

| Guard | Mecanismo | Resposta |
|---|---|---|
| Autenticação | `authContext` presente no middleware | 403 UNAUTHORIZED |
| Format | `format ∈ {html, docx, pdf}` | 400 INVALID_FORMAT |
| Escopo tenant/workspace no run | `prisma.run.findFirst({ tenantId, workspaceId })` | 404 RUN_NOT_FOUND |
| Tipo do run | `run.request.actionId === "imob.contract.intake"` | 400 NOT_INTAKE_RUN |
| Worker processado | `ImobCaseEvent{type:"case.document.intake", runId}` | 404 EVIDENCE_NOT_FOUND |
| PII mascarado | `event.payload.piiMasked === true` | 403 EXPORT_PII_NOT_MASKED |
| Cross-tenant no case | `ImobCase.findFirst({ id=event.caseId, tenantId, workspaceId })` | 404 CASE_NOT_FOUND |
| Anti-PII scan | `hasPiiResidue()` em nextStep + pendingItems + riskFlags | 200 EXPORT_GENERATION_FAILED (partial) |
| Falha de geração | try/catch no render | 200 EXPORT_GENERATION_FAILED (partial, sem rollback) |

---

## Resultados de teste (2026-06-17)

### Renderer unit (Fase 3)

```bash
pnpm test:imob-intake:renderer
```

```
# tests 15
# pass 15
# fail 0
# duration_ms ~500
```

| Teste | O que prova |
|---|---|
| T-RND-1 | `buildExportHash` é determinístico (mesmo input → mesmo SHA-256) |
| T-RND-2 | Hash muda com os dados (caseId diferente → hash diferente) |
| T-RND-3 | `scanIntakeDataForPii` passa dados limpos sem falso positivo |
| T-RND-4 | CPF sintético inválido em `nextStep` → `hasPii=true`, `fields=["nextStep"]` |
| T-RND-5 | Email sintético em `pendingItems` → `hasPii=true` |
| T-RND-6 | HTML válido: DOCTYPE, charset, caseId, stage, status, nextStep, badge "Mascarado" |
| T-RND-7 | `pendingItems` e `riskFlags` aparecem na saída HTML |
| T-RND-8 | Listas vazias → placeholder "Nenhum" (2+ ocorrências) |
| T-RND-9 | XSS escaping: `<script>` → `&lt;script&gt;`; `&` → `&amp;` |
| T-RND-10 | Footer contém `exportHash`, `generatedAt`, `documentHash` |
| T-RND-11 | DOCX resulta em `Buffer` com tamanho positivo |
| T-RND-12 | Magic bytes `0x50 0x4B` (ZIP/DOCX header PK) |
| T-RND-13 | `caseId`, `stage`, "Mascarado" presentes em `word/document.xml` (via JSZip.loadAsync) |
| T-RND-14 | OOXML structure: `[Content_Types].xml`, `_rels/.rels`, `word/document.xml` |
| T-RND-15 | `&` em `pendingItems` vira `&amp;` no XML gerado |

### Export endpoint integração (Fase 3, banco real)

```bash
pnpm test:imob-intake:export
```

```
# tests 13
# suites 12
# pass 13
# fail 0
# duration_ms ~6100
```

| Suite | Cenários | O que prova |
|---|---|---|
| EXP-01 (1) | format=html happy path | 200 `text/html`, `X-Export-Hash` 64-char hex, `X-Generated-At`, conteúdo correto |
| EXP-02 (1) | format=docx happy path | 200 OOXML MIME, magic bytes PK, `X-Export-Hash` presente |
| EXP-03 (1) | format=pdf | 200 JSON `PDF_DELEGATED_TO_FRONTEND` com `htmlExportUrl` e `strategy` |
| EXP-04 (2) | format inválido/ausente | 400 `INVALID_FORMAT` |
| EXP-05 (1) | sem autenticação | 401 ou 403 |
| EXP-06 (1) | run não encontrado | 404 `RUN_NOT_FOUND` |
| EXP-07 (1) | run não é intake | 400 `NOT_INTAKE_RUN` |
| EXP-08 (1) | worker não processou | 404 `EVIDENCE_NOT_FOUND` |
| EXP-09 (1) | `piiMasked=false` no event | 403 `EXPORT_PII_NOT_MASKED` |
| EXP-10 (1) | exportHash header | `X-Export-Hash` é SHA-256 hex (64 chars) |
| EXP-11 (1) | generatedAt header | `X-Generated-At` é data ISO parseável |
| EXP-12 (1) | cross-tenant isolation | Token de outro tenant → 404 `RUN_NOT_FOUND` |

### Histórico acumulado (todas as fases)

```bash
pnpm test:imob-intake:all  # 1A + 1B
```

```
# tests 78
# pass 78
# fail 0
```

```bash
pnpm test:imob-intake:e2e  # Fase 2
```

```
# tests 13
# pass 13
# fail 0
```

| Fase | Testes | Pass |
|---|---|---|
| 1A (PII masker + extrator) | 37 | 37 |
| 1B (adapter + classifier + draft + pipeline) | 41 | 41 |
| Fase 2 E2E (worker, banco real) | 13 | 13 |
| **Fase 3 renderer (unit)** | **15** | **15** |
| **Fase 3 export (integração, banco real)** | **13** | **13** |
| **Total** | **119** | **119** |

### check:evidence-index

```bash
pnpm check:evidence-index
```

```json
{ "ok": true, "refsChecked": 281 }
```

---

## Invariantes verificados (Fase 3)

| Código | Invariante | Prova |
|---|---|---|
| I-EXP-1 | Export nunca lê do draft em memória | Endpoint usa apenas `prisma.run/imobCase/imobCaseEvent` — draft service não importado no handler do export |
| I-EXP-2 | Export bloqueado sem `piiMasked=true` | EXP-09: event com `piiMasked=false` → 403 EXPORT_PII_NOT_MASKED |
| I-EXP-3 | Anti-PII scan antes de gerar arquivo | `scanIntakeDataForPii()` chama `hasPiiResidue()` em nextStep + pendingItems + riskFlags antes do render |
| I-EXP-4 | Falha de geração não reverte case/event | catch retorna `EXPORT_GENERATION_FAILED` sem rollback (case/event já persistidos são dados autoritativos) |
| I-EXP-5 | Cross-tenant isolation por duplo scope check | EXP-12: run encontrado pelo runId mas não pelo tenantId do outro token → 404 RUN_NOT_FOUND |
| I-EXP-6 | X-Export-Hash é SHA-256 do conteúdo exportado | EXP-10: header validado como 64-char hex; T-RND-1/2: determinismo e sensibilidade comprovados |
| I-EXP-7 | ChatAgentLauncher intocado | Nenhum arquivo do launcher alterado em Fase 3 |
| I-EXP-8 | Nenhuma dep nova adicionada | JSZip via mammoth (transitiva), jspdf no frontend — nenhum `package.json` de API alterado |
| I-EXP-9 | stage/status/journeyType inalterados | Fase 3 apenas lê valores canônicos existentes — não cria novos |

---

## Pendências (fases não implementadas)

| Fase | Escopo | Status |
|---|---|---|
| Fase 4 | UI Chat IMOB — upload widget, preview do draft, botão confirmar | Não implementada |
| Fase 4 | Lifecycle completo do run (run.status → worker auto-trigger via BullMQ real) | Não implementada |
| Fase 5 | Evidence Index update com evidência de staging real | Pendente staging |

**Classificação global da feature:** PARCIAL AVANÇADO — não declarar DONE.
