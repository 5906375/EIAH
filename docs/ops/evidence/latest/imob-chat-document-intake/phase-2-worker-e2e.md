# IMOB Chat Document Intake — Phase 2: Worker Intake Handler + E2E

**Data:** 2026-06-17
**Branch:** `feat/imob-chat-document-intake`
**Commit:** `600a943`
**Status:** PARCIAL AVANÇADO — Fases 1A, 1B e 2 evidenciadas. Fase 3+ (UI, export, worker lifecycle completo) não implementada.

---

## Escopo desta evidência

Documenta a cadeia técnica completa da Fase 2: desde o `confirm` do draft até a criação de `ImobCase` e `ImobCaseEvent` pelo worker, com idempotência por `documentHash` e `runId`, e garantia de que nenhum PII não mascarado persiste no banco de dados.

---

## Arquivos implementados (Fases 1A + 1B + 2)

| Fase | Arquivo | Papel |
|---|---|---|
| 1A | `apps/api/src/services/imob/intake/imobContractPiiMasker.ts` | Mascaramento de PII (CPF, RG, CNH, CNPJ, email, telefone) — ordem importa |
| 1A | `apps/api/src/services/imob/intake/imobLeaseExtractor.ts` | Extrator determinístico de cláusulas do contrato; valores em centavos inteiros |
| 1A | `apps/api/src/tests/fixtures/imob/lease-contract-gina-101.fixture.ts` | Fixture sanitizada (sem PII real) para testes |
| 1A | `apps/api/src/tests/imob-contract-pii-masker.test.ts` | 12 testes T-PII-1..12 |
| 1A | `apps/api/src/tests/imob-lease-extractor.test.ts` | 25 testes T-EXT-1..25 |
| 1B | `apps/api/src/services/imob/intake/imobDocxAdapter.ts` | Wrapper mammoth (.docx → texto; nunca lança exceção) |
| 1B | `apps/api/src/services/imob/intake/imobContractClassifier.ts` | Classificador puro: `documentType`, `contractType`, `canonicalJourneyType="documentation"` |
| 1B | `apps/api/src/services/imob/intake/imobContractDraftService.ts` | Store in-memory, TTL 30min, cleanup com `.unref()` |
| 1B | `apps/api/src/routes/imob.ts` | `POST /chat/intake/upload` + `POST /chat/intake/confirm/:draftId` |
| 1B | `apps/api/src/services/imob/crm/imobCrmActionDispatcher.ts` | `"imob.contract.intake"` adicionado ao `IMOB_DISPATCHER_ACTION_IDS` |
| 1B | `apps/api/src/tests/imob-docx-adapter.test.ts` | 6 testes T-DOCX-1..6 |
| 1B | `apps/api/src/tests/imob-contract-classifier.test.ts` | 8 testes T-CLS-1..8 |
| 1B | `apps/api/src/tests/imob-contract-draft-service.test.ts` | 15 testes T-DRF-1..15 |
| 1B | `apps/api/src/tests/imob-intake-pipeline.test.ts` | 12 testes T-PIPE-1..12 (integração texto→mask→extract→classify→draft) |
| **2** | **`apps/api/src/workers/imobPostRunMutationWorker.ts`** | `IMOB_RUN_OUTCOME_MAP["imob.contract.intake"]` + `processIntakeRun()` |
| **2** | **`apps/api/src/tests/imob-intake-e2e.test.ts`** | 13 testes E2E-IN-01..07 contra banco real |

---

## Fluxo implementado (Fase 2)

```
Upload .docx
  └─ POST /chat/intake/upload
      ├─ MIME guard (somente .docx, max 10MB)
      ├─ mammoth.extractRawText()
      ├─ maskContractPii()           ← PII mascarado ANTES de qualquer persistência
      ├─ extractLeaseContractFromText()
      ├─ classifyImobContract()
      └─ createDraft() → { draftId, draftExpiresAt, ... }

Confirm (usuário)
  └─ POST /chat/intake/confirm/:draftId
      ├─ scope guard (tenantId + workspaceId)
      ├─ TTL guard (draft expirado → 409 DRAFT_EXPIRED)
      ├─ registry guard (actionId não registrado → 200 blocked)
      ├─ createRunRecord({ agent: "EIAH", status: "queued",
      │     request: { documentHash, documentKind, pendingItems, riskFlags, ... } })
      └─ deleteDraft() → 201 { runId }

Worker (run.status → "success")
  └─ processImobRunCompletedJob({ caseId: "INTAKE", actionId: "imob.contract.intake", ... })
      ├─ Guard: actionId em IMOB_DISPATCHER_ACTION_IDS ✓
      ├─ Guard: outcome em IMOB_RUN_OUTCOME_MAP ✓
      ├─ Branch: actionId === "imob.contract.intake" → processIntakeRun()
      │   ├─ getRun() → valida status=success, não simulado
      │   ├─ documentHash lido de run.request
      │   ├─ Idempotência #1: ImobCaseEvent{type:"case.document.intake", evidenceRef=documentHash}
      │   │   existir → skip EXISTING_CASE_FOUND
      │   ├─ Idempotência #2: ImobCaseEvent{type:"case.action.completed", runId}
      │   │   existir → skip (entrega duplicada BullMQ)
      │   ├─ prisma.imobCase.create({ flow: "documents.collect",
      │   │     stage: "documents_collecting", status: "ready_for_review",
      │   │     metadata: { intakeDocumentHash, piiMasked: true, riskFlags } })
      │   ├─ ImobCaseEvent type="case.action.completed" (evidenceRef=documentHash, piiMasked=true)
      │   └─ ImobCaseEvent type="case.document.intake" (âncora de idempotência)
      └─ incrementCounter(MUTATIONS_APPLIED)
```

---

## Outcome map (Fase 2)

```typescript
"imob.contract.intake": {
  stage: "documents_collecting",   // enum existente — não criado agora
  status: "ready_for_review",      // enum existente — não criado agora
  nextStep: "Analisar documentação recebida e verificar itens pendentes com as partes",
  requiresTxId: false,             // sem recibo de ledger para intake
  isTerminal: false,
}
```

---

## Idempotência

| Eixo | Mecanismo | reasonCode |
|---|---|---|
| Por `documentHash` | `ImobCaseEvent.findFirst({ type:"case.document.intake", evidenceRef:documentHash })` | `EXISTING_CASE_FOUND` |
| Por `runId` (BullMQ) | `ImobCaseEvent.findFirst({ type:"case.action.completed", runId })` | `already_processed` |

O sentinel `"INTAKE"` passado como `caseId` no payload do job nunca é persistido como `id` de `ImobCase` — validado em E2E-IN-07.

---

## PII — Garantias

| Ponto | Garantia |
|---|---|
| `maskContractPii()` roda antes de qualquer DB write | Regex ordenados: rotulados (RG:, CNH:) antes de genéricos (CPF) |
| `ImobCase.metadata` | `piiMasked: true`; sem CPF, CNPJ, email, telefone real |
| `ImobCaseEvent.payload` | `piiMasked: true`; payload contém apenas `documentHash`, `documentKind`, `riskFlags` |
| Fixture de teste | `lease-contract-gina-101.fixture.ts`: sem PII real; CPF/RG sintéticos inválidos |

---

## Resultados de teste (2026-06-17, banco e Redis locais)

### Unidade — Fase 1A

```bash
pnpm test:imob-intake:unit
```

```
# tests 37
# pass 37
# fail 0
```

Cobre T-PII-1..12 (masker) + T-EXT-1..25 (extrator).

### Unidade — Fase 1B

```bash
pnpm test:imob-intake:1b
```

```
# tests 41
# pass 41
# fail 0
```

Cobre T-DOCX-1..6 + T-CLS-1..8 + T-DRF-1..15 + T-PIPE-1..12.

### Suite completo (1A + 1B)

```bash
pnpm test:imob-intake:all
```

```
# tests 78
# pass 78
# fail 0
```

### E2E — Fase 2 (banco real, Redis real)

```bash
pnpm test:imob-intake:e2e
```

```
# tests 13
# suites 7
# pass 13
# fail 0
# duration_ms ~1700
```

| Suíte | Cenários | O que prova |
|---|---|---|
| E2E-IN-01 (4 casos) | Happy path | ImobCase criado com stage/status/flow corretos; events case.action.completed + case.document.intake; pendingItems preservados |
| E2E-IN-02 (2 casos) | Idempotência por documentHash | Mesmo hash → 1 case; hash diferente → case separado |
| E2E-IN-03 (1 caso) | Idempotência por runId | Entrega duplicada BullMQ → 1 case |
| E2E-IN-04 (1 caso) | run.status=error | Nenhum case criado |
| E2E-IN-05 (1 caso) | run simulado | Nenhum case criado |
| E2E-IN-06 (2 casos) | PII guard | metadata e payload sem CPF/email; piiMasked=true |
| E2E-IN-07 (2 casos) | Sentinel guard | `caseId="INTAKE"` nunca persiste no DB |

### check:evidence-index

```bash
pnpm check:evidence-index
```

```json
{ "ok": true, "refsChecked": 280 }
```

---

## Invariantes verificados (Fase 2)

| Código | Invariante | Prova |
|---|---|---|
| I-IN-1 | `ImobCase` criado somente via worker (nunca no route handler) | Confirm endpoint não faz `prisma.imobCase.create`; E2E-IN-01 prova criação via worker |
| I-IN-2 | Idempotência por `tenantId + workspaceId + documentHash` | E2E-IN-02: segundo processamento → `EXISTING_CASE_FOUND`, 0 cases duplicados |
| I-IN-3 | PII não persiste em nenhuma entidade | E2E-IN-06: regex CPF/email/CNPJ ausentes em metadata e payload |
| I-IN-4 | `runId` duplicado → no-op | E2E-IN-03: BullMQ duplicate delivery → 1 case |
| I-IN-5 | Run simulado → no-op | E2E-IN-05: `simulated=true` → `imob-intake.skipped_simulated_run` |
| I-IN-6 | Run não success → no-op | E2E-IN-04: `status=error` → `imob-intake.run_not_success_skip` |
| I-IN-7 | `ChatAgentLauncher` intocado | Nenhum arquivo do launcher alterado em Fases 1A/1B/2 |
| I-IN-8 | `stage`/`status` apenas valores canônicos | `"documents_collecting"` e `"ready_for_review"` são enum existentes |

---

## Pendências (fases não implementadas)

| Fase | Escopo | Status |
|---|---|---|
| Fase 3 | UI Chat IMOB — upload widget, preview do draft, botão confirmar | Não implementada |
| Fase 3 | Export HTML/PDF/DOCX do contrato | Não implementada |
| Fase 3 | Lifecycle completo do run (run.status → worker auto-trigger via BullMQ) | Não implementada |
| Fase 4 | Evidence Index update com evidência de staging real | Pendente staging |

**Classificação global da feature:** PARCIAL AVANÇADO — não declarar DONE.
