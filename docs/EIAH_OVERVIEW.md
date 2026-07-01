# EIAH — Documentação Geral (Estado Atual do Repositório)

> Roadmap canônico vigente: `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`.
>
> Data normativa de referência: `2026-07-01`.
>
> Este overview é secundário. Se houver divergência, prevalecem o roadmap canônico, o runtime/contratos vigentes e as evidências reais indexadas; documentação anterior sem revalidação explícita deve ser tratada como histórico ou drift documental P0.

## 1. Resumo executivo

O EIAH é um sistema B2B multi-tenant de agentes corporativos para execução crítica e governança cognitiva, estruturado em um Gateway/API que expõe runs e eventos, um Core de orquestração e workers assíncronos.  \
EVIDÊNCIA: `apps/api/src/index.ts:4-125` — bootstrap da API, rotas e start de worker/outbox.  \
EVIDÊNCIA: `packages/core/src/orchestrator/agentOrchestrator.ts:64-210` — orquestração com plano/ações/eventos.  \
EVIDÊNCIA: `apps/api/src/middlewares/enforceTenant.ts:143-210` + `packages/db/prisma/schema.prisma:146-199` — multi-tenant (tenantId/workspaceId no contexto e no schema).

O sistema já possui observabilidade por eventos (RunEvent + SSE com replay/cursor) e mecanismos de auditoria (GuardrailLedger/AuditLedger) com SCL off-chain assinado para ações críticas.  \
EVIDÊNCIA: `apps/api/src/routes/runs.ts:151-259` — endpoints de eventos e SSE com replay/cursor.  \
EVIDÊNCIA: `apps/api/src/services/runEvents.ts:15-120` + `apps/api/src/services/runEventOutbox.ts:89-145` — persistência de eventos + outbox em Redis Stream.  \
EVIDÊNCIA: `packages/core/src/services/guardrailLedgerStore.ts:6-90` + `packages/core/src/services/sclLedger.ts:72-240` — ledger/audit e assinatura SCL.

A cognição é descrita no roadmap como ReAct (perceive → plan → act) e, no código, existe um orquestrador com criação de plano, execução de passos e hooks de observe/reflect; a execução de tools é governada por MCP + Tool Contracts.  \
REFERÊNCIA NORMATIVA: `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md:1-64` — base agentic governada e auditável com estados parciais preservados para hardening, interoperabilidade, economy e Track P.  \
EVIDÊNCIA: `packages/core/src/orchestrator/agentOrchestrator.ts:143-210` — criação de plano, registro de eventos e persistência de passos.  \
EVIDÊNCIA: `apps/workers/action-runner/src/index.ts:617-759` + `packages/mcp-runner/src/types/ToolContract.ts:3-14` — enforcement MCP com ToolContract.

Há lacunas explícitas para execução on-chain: o executor `web3` no MCP Runner não está implementado e rotas DeFi estão com TODOs, indicando apenas placeholders.  \
EVIDÊNCIA: `packages/mcp-runner/src/executor/MCPExecutor.ts:44-96` — `execWeb3` lança erro de não implementado.  \
EVIDÊNCIA: `apps/api/src/routes/defi.ts:37-79` — TODOs de simulação e envio de transação.

## 2. Estado atual (Implementado vs Parcial vs Planejado vs Não encontrado)

### Status do Roadmap (consolidado por evidência)

| Item | Evidências | Status (no repo) | Divergência com Roadmap |
| --- | --- | --- | --- |
| Fase 4 — Gate pré‑execução (SCL obrigatório) | `apps/workers/action-runner/src/index.ts:841-919` | Implementado | Componente evidenciado; F4 permanece parcial avançada e sujeita a hardening recorrente. |
| Fase 4 — Resiliência do Signer | `packages/core/src/security/signerManager.ts:225-269` | Implementado | Componente evidenciado; não fecha isoladamente a F4. |
| Fase 4 — Reconciliação Guardrail ↔ SCL | `apps/workers/maintenance-worker/src/index.ts:286-383` + `packages/core/src/services/reconcileLedgerService.ts:15-233` | Implementado | Componente evidenciado; recorrência operacional continua obrigatória. |
| Fase 5.0 — Marketplace (catálogo + delegações) | `packages/db/prisma/schema.prisma:564-604` + `apps/api/src/routes/marketplace.ts:7-212` + `apps/web/src/pages/self-service/index.tsx:51-227` | Implementado (core) | Compatível (Roadmap v8: ✅ concluída core / fechamento de UX avançada pendente) |
| Fase 5.0 — “UX de delegação avançada” | **NÃO ENCONTRADO** (`rg -n "delegation advanced|delegacao avancada|delegação avançada|advanced delegation"`) | Não evidenciado | Compatível (Roadmap v8: fechamento de UX/auditoria avançada ainda pendente) |
| Fase 5.1 — PoU (modelo + serviço + pipeline + eventos) | `packages/db/prisma/schema.prisma:520-547` + `packages/core/src/services/pouService.ts:31-208` + `apps/workers/action-runner/src/index.ts:841-1314` + `packages/contracts/src/runEvent.schema.json:16-46` | Implementado | Compatível (Roadmap v8: ✅ concluída operacional) |
| Fase 5.1 — Trust Gate (score + gate) | `apps/api/src/services/trustScore.ts:21-129` + `apps/workers/action-runner/src/index.ts:189-233` | Implementado | Compatível (Roadmap v8: ✅ concluída operacional) |

### Implementado
- Gateway/API com rotas principais, health e métricas — EVIDÊNCIA: `apps/api/src/index.ts:54-87` — rotas /api, /metrics.
- SSE com replay/cursor de RunEvent — EVIDÊNCIA: `apps/api/src/routes/runs.ts:190-259` + `apps/api/src/services/runEvents.ts:81-120`.
- Orquestração com plano/ações/eventos e registro de steps — EVIDÊNCIA: `packages/core/src/orchestrator/agentOrchestrator.ts:175-210` + `packages/db/prisma/schema.prisma:203-215` (PlanStepRecord).
- MCP Runner + Tool Contracts + validação de schema — EVIDÊNCIA: `apps/workers/action-runner/src/index.ts:617-653` + `packages/mcp-runner/src/validator/SchemaValidator.ts:1-10` + `packages/db/prisma/schema.prisma:394-413`.
- GuardrailLedger/AuditLedger e SCL off-chain assinado — EVIDÊNCIA: `packages/core/src/services/guardrailLedgerStore.ts:6-90` + `packages/core/src/services/sclLedger.ts:72-240`.
- Filas BullMQ com retries, DLQ e redrive — EVIDÊNCIA: `packages/core/src/queue/runQueue.ts:145-397` + `apps/api/src/routes/ops.ts:155-260`.
- Memória com stores (short/long/vector) e endpoints /memory — EVIDÊNCIA: `packages/core/src/memory/index.ts:36-80` + `apps/api/src/routes/memory.ts:30-102`.
- RBAC com policy store persistente e decisões fail-closed — EVIDÊNCIA: `packages/core/src/policy/TenantPolicyStore.ts` + `ops/evidence/latest/tenant-policy-store-enforcement-2026-06-28.json` + `ops/evidence/latest/rbac-scope-fail-closed-2026-06-28.json`.
- GuardrailLedger/AuditLedger persistente no caminho RBAC — EVIDÊNCIA: `packages/core/src/audit/guardrailLedger.ts` + `ops/evidence/latest/guardrail-ledger-rbac-events-2026-06-28.json`.

### Parcial
- Judge gate pode operar em `shadow` ou `enforce` via env; comportamento depende de configuração — EVIDÊNCIA: `apps/workers/action-runner/src/index.ts:274-507`.
- Policies + human approvals possuem schema, rota e gate IMOB fail-closed, mas F5.2 permanece parcial avançada até fechamento operacional completo — EVIDÊNCIA: `packages/db/prisma/schema.prisma:199-201` + `apps/api/src/routes/runs.ts:896` + `ops/evidence/latest/imob-approval-gate-2026-06-28.json`.
- Ledger/Receipt Canon possui endpoint público e trilha verificável off-chain; auditoria pública DLT/on-chain e SLO ratificado permanecem parciais — EVIDÊNCIA: `apps/api/src/routes/governance.ts:432` + `ops/evidence/latest/imob-approval-receipt-surface-2026-06-28.json` + `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md:49-57`.

### Planejado/Docs
- Execução pública DLT/on-chain e tokenização de reputação continuam propostas; não confundir o endpoint off-chain `/ledger/:txId` com integração blockchain — REFERÊNCIA: `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md:49-57` + `packages/mcp-runner/src/executor/MCPExecutor.ts:44-96`.

### Ainda não evidenciado
- Módulo único chamado `PolicyEngine.ts`; a governança atual está distribuída entre policy store, RBAC, gates e serviços.
- Executor Web3 funcional e tokenização de reputação (`TrustScoreToken`).
### PoU (evidenciado no repo)
- Implementação de `proofOfUsage` (PoU) — EVIDÊNCIA: `packages/db/prisma/schema.prisma:520-547` + `packages/core/src/services/pouService.ts:31-208` + `apps/workers/action-runner/src/index.ts:841-1314` + `packages/contracts/src/runEvent.schema.json:16-46`.

### Mapa de imports (USADOS vs NÃO USADOS)
- Grafo de imports gerado a partir dos entrypoints (`apps/api/src/index.ts`, `apps/web/src/main.tsx`, `apps/cli/src/index.ts`, `apps/workers/*/src/index.ts`).  \
EVIDÊNCIA: `apps/api/src/index.ts:1-125` + `apps/web/src/main.tsx:1-10` + `apps/cli/src/index.ts:1-58` + `apps/workers/action-runner/src/index.ts:1-121` + `apps/workers/maintenance-worker/src/index.ts:1-30` + `apps/workers/run-worker/src/index.ts:1-45`.
- Listas completas de arquivos usados e prováveis órfãos estão em `docs/EVIDENCE_INDEX.md` (geradas via script).  \
EVIDÊNCIA: `docs/EVIDENCE_INDEX.md` — seção “Import graph (usados vs órfãos)”.

### Infraestrutura estável vs lógica cognitiva
- Infraestrutura estável (orquestração de serviços/infra): Docker compose, Redis/BullMQ, Postgres/Prisma.  \
EVIDÊNCIA: `docker-compose.dev.yml:15-201` + `packages/core/src/queue/runQueue.ts:21-116` + `packages/db/prisma/schema.prisma:146-201`.
- Lógica cognitiva (orquestração + governança): AgentOrchestrator, Intent Validator, Judge Gate, Memory.  \
EVIDÊNCIA: `packages/core/src/orchestrator/agentOrchestrator.ts:143-210` + `apps/api/src/services/intentValidator.ts:69-135` + `apps/api/src/services/judgeGate.ts:62-123` + `packages/core/src/memory/index.ts:36-80`.

### Arquivos importantes lidos
- `apps/api/src/index.ts`, `apps/api/src/routes/runs.ts`, `apps/api/src/services/runEvents.ts`, `apps/api/src/services/intentValidator.ts`, `apps/api/src/services/judgeGate.ts`, `apps/api/src/workers/runWorker.ts`, `apps/workers/action-runner/src/index.ts`, `packages/core/src/orchestrator/agentOrchestrator.ts`, `packages/core/src/services/sclLedger.ts`, `packages/db/prisma/schema.prisma`.  \
EVIDÊNCIA: `docs/EVIDENCE_INDEX.md` — seção “Índice de Evidências”.

### Arquivos existentes mas sem uso (sem referência)
- Lista completa incluída em `docs/EVIDENCE_INDEX.md` (prováveis órfãos pelo grafo de imports).  \
EVIDÊNCIA: `docs/EVIDENCE_INDEX.md` — seção “Lista completa de não usados (prováveis órfãos)”.

## 3. Arquitetura por camadas

### 3.1 Gateway/API
- Rotas principais (runs/events/memory/actions/marketplace/ops/métricas) — EVIDÊNCIA: `apps/api/src/index.ts:69-87`.
- Auth + tenant context e override controlado — EVIDÊNCIA: `apps/api/src/middlewares/enforceTenant.ts:143-218`.
- SSE de eventos com cursor/replay — EVIDÊNCIA: `apps/api/src/routes/runs.ts:190-259`.

### 3.2 Core/orquestração
- Orquestração com plano/ação/observação/reflexão (ReAct-like) — EVIDÊNCIA: `packages/core/src/orchestrator/agentOrchestrator.ts:143-210` (plan/record/observe/reflect).  \
HIPÓTESE (baixa confiança): o fluxo implementa ReAct clássico; o código mostra plano/ação e hooks de observação/reflexão, mas a nomenclatura “ReAct” está no roadmap, não no código.
- Registro e execução de actions versionadas — EVIDÊNCIA: `packages/core/src/actions/actionRegistry.ts:66-111` + `packages/core/src/actions/registry/VersionedActionRegistry.ts:10-69`.
- Agents/actions: definidos em `packages/core/src/actions/agents/*.ts`, registrados via `registerAgentProfileActions` e `registerAllActions`, resolvidos por tenant.  \
EVIDÊNCIA: `packages/core/src/actions/agents/index.ts:1-78` + `packages/core/src/actions/index.ts:35-55` + `apps/api/src/actions/tenantActionRegistry.ts:1-8`.

### 3.3 Workers (run-worker, action-runner, maintenance)
- run-worker embutido na API (BullMQ) — EVIDÊNCIA: `apps/api/src/index.ts:97-103` + `apps/api/src/workers/runWorker.ts:88-103`.
- run-worker standalone — EVIDÊNCIA: `apps/workers/run-worker/src/index.ts:1-212`.
- action-runner (MCP + gates) — EVIDÊNCIA: `apps/workers/action-runner/src/index.ts:617-759`.
- maintenance-worker (ledger reconcile/memory jobs) — EVIDÊNCIA: `apps/workers/maintenance-worker/src/index.ts:1-200`.

### 3.4 Dados (Postgres/Prisma, Redis, filas, outbox)
- Postgres/Prisma: Run, RunEvent, GuardrailLedger, SclLedger, ToolContract, Memory* — EVIDÊNCIA: `packages/db/prisma/schema.prisma:146-499`.
- Redis/BullMQ: run/action/maintenance queues, DLQ — EVIDÊNCIA: `packages/core/src/queue/runQueue.ts:21-397` + `packages/core/src/queue/actionQueue.ts:21-255`.
- Outbox para eventos (Redis Stream) — EVIDÊNCIA: `apps/api/src/services/runEvents.ts:47-76` + `apps/api/src/services/runEventOutbox.ts:89-145`.

### 3.5 UI (RunViewer/SSE/polling)
- RunViewer com SSE, cursor e fallback para polling — EVIDÊNCIA: `apps/web/src/components/runs/RunViewer.tsx:250-337`.

## 4. Fluxos principais (diagramas textuais)

### 4.1 Create Run → Orquestração → Actions → Eventos/SSE → Ledger
```
POST /api/runs
  -> publishRun (runQueue / BullMQ)
  -> run-worker processa payload
  -> AgentOrchestrator cria plano + executa ações
  -> action-runner (MCP) quando há tool contract
  -> RunEvent gravado + SSE publish/outbox
  -> GuardrailLedger/Audit + SCL (ações críticas)
  -> resposta no RunViewer
```
- Inputs/outputs: POST /runs (input) → RunEvent/SSE (output) — EVIDÊNCIA: `apps/api/src/routes/runs.ts:451-510` + `apps/api/src/routes/runs.ts:151-259`.
- Orquestração e execução — EVIDÊNCIA: `apps/api/src/workers/runWorker.ts:608-730` + `packages/core/src/orchestrator/agentOrchestrator.ts:175-210`.
- MCP + ToolContract — EVIDÊNCIA: `apps/workers/action-runner/src/index.ts:617-759` + `packages/mcp-runner/src/validator/SchemaValidator.ts:1-10`.
- Ledger/Audit — EVIDÊNCIA: `apps/api/src/services/runEventEmitter.ts:42-85` + `packages/core/src/services/sclLedger.ts:72-240`.

### 4.2 SSE replay/cursor
```
GET /runs/:id/stream?cursor=...
  -> carrega eventos após cursor
  -> mantém SSE aberto
  -> UI reconecta e faz fallback via polling
```
- EVIDÊNCIAS: `apps/api/src/routes/runs.ts:190-259` + `apps/api/src/services/runEvents.ts:81-120` + `apps/web/src/components/runs/RunViewer.tsx:250-337`.

### 4.3 Falhas: retries/DLQ/redrive
```
BullMQ
  -> attempts + backoff
  -> DLQ
  -> redrive via /api/ops/queues/redrive
```
- EVIDÊNCIAS: `packages/core/src/queue/runQueue.ts:145-397` + `apps/api/src/routes/ops.ts:240-259`.

## 5. Governança Cognitiva e Execução Crítica

- Intent Validator (score/verdict + ledger) — EVIDÊNCIA: `apps/api/src/services/intentValidator.ts:69-135`.
- RBAC + Trust Score + policies — EVIDÊNCIA: `apps/api/src/middlewares/requireScope.ts:12-55` + `apps/api/src/services/trustScore.ts:21-128` + `packages/core/src/security/rbac.ts:26-55`.
- GuardrailLedger / GuardrailAuditLedger — EVIDÊNCIA: `packages/core/src/services/guardrailLedgerStore.ts:6-90` + `packages/db/prisma/schema.prisma:437-499`.
- Impede ações fora de schema via ToolContract + validação AJV — EVIDÊNCIA: `packages/mcp-runner/src/validator/SchemaValidator.ts:1-10` + `apps/workers/action-runner/src/index.ts:617-653`.
- SCL off-chain (hash/assinatura) — EVIDÊNCIA: `packages/core/src/services/sclLedger.ts:72-240` + `packages/core/src/security/signerManager.ts:123-178`.
- Integração on-chain não existe funcionalmente no repo; o `txId` e o endpoint off-chain `/ledger/:txId` existem e não devem ser apresentados como blockchain pública (executor web3 não implementado; rotas DeFi com TODO).  \
EVIDÊNCIA: `packages/mcp-runner/src/executor/MCPExecutor.ts:94-96` + `apps/api/src/routes/defi.ts:37-79`.

## 6. IAs/modelos e responsabilidades

- LLM principal (geração/orquestração): `executeLlmStep` registra providers e chama `runCompletion`.  \
EVIDÊNCIA: `apps/api/src/orchestrator/llmExecutor.ts:1-66` + `packages/core/src/llm/completionEngine.ts:17-79`.
- Providers suportados para texto: OpenAI, Anthropic, Gemini, DeepSeek.  \
EVIDÊNCIA: `apps/api/src/orchestrator/llmExecutor.ts:26-37` + `packages/providers/src/index.ts:28-38`.
- Judge (heurístico + LLM): heurístico em `judge.ts` e LLM em `judgeGate.ts` com política `judge-v1`.  \
EVIDÊNCIA: `apps/api/src/services/judge.ts:1-70` + `apps/api/src/services/judgeGate.ts:62-123`.
- Embeddings/memória/RAG: memória vetorial em pgvector + endpoint de busca por embedding; snapshot é carregado no run-worker.  \
EVIDÊNCIA: `packages/db/prisma/schema.prisma:340-356` + `apps/api/src/routes/memory.ts:60-99` + `apps/api/src/workers/runWorker.ts:608-670`.
- Roteamento/intent: Intent Validator e Trust Gate antes do MCP.  \
EVIDÊNCIA: `apps/workers/action-runner/src/index.ts:183-271` + `apps/workers/action-runner/src/index.ts:123-162`.
- Providers suportados para embeddings: OpenAI, Gemini, DeepSeek.  \
EVIDÊNCIA: `packages/providers/src/index.ts:65-131`.
- Fallback de UI: SSE → polling — EVIDÊNCIA: `apps/web/src/components/runs/RunViewer.tsx:303-337`.

## 7. Benefícios B2B (ligados a componentes reais)

- Multi-tenant e isolamento — EVIDÊNCIA: `apps/api/src/middlewares/enforceTenant.ts:143-210` + `packages/db/prisma/schema.prisma:146-199`.
- Compliance/auditoria (GuardrailLedger + SCL) — EVIDÊNCIA: `packages/core/src/services/guardrailLedgerStore.ts:6-90` + `packages/core/src/services/sclLedger.ts:72-240`.
- Observabilidade (RunEvent + SSE + RunViewer) — EVIDÊNCIA: `apps/api/src/services/runEvents.ts:15-76` + `apps/api/src/routes/runs.ts:190-259` + `apps/web/src/components/runs/RunViewer.tsx:250-337`.
- Controle de risco (Intent Validator + Trust Score gate + Judge gate) — EVIDÊNCIA: `apps/api/src/services/intentValidator.ts:69-135` + `apps/workers/action-runner/src/index.ts:123-507`.
- Controle de custos (estimativa e cobrança por run) — EVIDÊNCIA: `apps/api/src/services/billing.ts:48-121`.

## 8. Riscos técnicos e mitigação

- Dois run-workers (API vs standalone) → risco de divergência operacional e duplicidade de execução.  \
EVIDÊNCIA: `apps/api/src/index.ts:97-103` + `apps/workers/run-worker/src/index.ts:1-212`.  \
Mitigação: consolidar um único worker oficial e remover o legacy.
- SLO ainda não ratificado → bloqueia promessa de SLA e narrativa enterprise-ready.  \
EVIDÊNCIA: `ops/evidence/latest/economy-slo-targets.json` + `ops/evidence/latest/economy-slo-baseline-2026-06-16.json`.  \
Mitigação: coletar ciclos reais distintos em staging e tornar o gate bloqueante após ratificação.
- Execução Web3 não implementada → risco de falha em tools `executor=web3`.  \
EVIDÊNCIA: `packages/mcp-runner/src/executor/MCPExecutor.ts:94-96`.  \
Mitigação: implementar executor `web3` ou bloquear contratos com `executor=web3` até ficar pronto.
- Provider boundary não cobre chamadas HTTP vendor-specific diretas → risco de bypass da política central.  \
EVIDÊNCIA: `apps/api/src/tests/provider-boundary-enforcement.test.ts` + `apps/api/src/services/imob/imobSemanticIntentResolver.ts:214` + `apps/api/src/services/imob/imobAttachmentValidation.ts:426`.  \
Mitigação: migrar chamadas para a capability central e ampliar o gate para URLs de vendors.

## 9. Próximos passos (prioridade)

- **P0**: Unificar run-worker e remover variante legacy.  \
EVIDÊNCIA: `apps/api/src/index.ts:97-103` + `apps/workers/run-worker/src/index.ts:1-212`.
- **P1**: tornar a critical chain executável e exigir recorrência em semanas distintas antes de declarar fechamento operacional.  \
REFERÊNCIA: `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md:77-88` + `scripts/checkP1CriticalChain.ts` + `scripts/checkP1ReconciliationRecurring.ts`.
- **P2**: executar E2E HIGH em staging real, ratificar SLO e manter auditoria pública/on-chain como parcial até implementação específica.  \
REFERÊNCIA: `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md:90-118` + `packages/mcp-runner/src/executor/MCPExecutor.ts:94-96`.

---

## ÍNDICE DE EVIDÊNCIAS

- `apps/api/src/index.ts`
- `apps/api/src/routes/runs.ts`
- `apps/api/src/services/runEvents.ts`
- `apps/api/src/services/runEventOutbox.ts`
- `apps/api/src/services/runEventEmitter.ts`
- `apps/api/src/services/intentValidator.ts`
- `apps/api/src/services/judge.ts`
- `apps/api/src/services/judgeGate.ts`
- `apps/api/src/services/billing.ts`
- `apps/api/src/middlewares/enforceTenant.ts`
- `apps/api/src/middlewares/requireScope.ts`
- `apps/api/src/workers/runWorker.ts`
- `apps/api/src/routes/defi.ts`
- `apps/api/src/routes/ops.ts`
- `apps/api/src/routes/memory.ts`
- `apps/api/src/orchestrator/llmExecutor.ts`
- `apps/workers/action-runner/src/index.ts`
- `apps/workers/action-runner/src/services/mcpAdapter.ts`
- `apps/workers/action-runner/src/services/mcpEnforcement.ts`
- `apps/workers/run-worker/src/index.ts`
- `apps/workers/maintenance-worker/src/index.ts`
- `apps/web/src/components/runs/RunViewer.tsx`
- `packages/core/src/orchestrator/agentOrchestrator.ts`
- `packages/core/src/actions/actionRegistry.ts`
- `packages/core/src/actions/registry/VersionedActionRegistry.ts`
- `packages/core/src/security/rbac.ts`
- `packages/core/src/policy/TenantPolicyStore.ts`
- `packages/core/src/services/guardrailLedgerStore.ts`
- `packages/core/src/services/sclLedger.ts`
- `packages/core/src/security/signerManager.ts`
- `packages/core/src/audit/guardrailLedger.ts`
- `packages/core/src/queue/runQueue.ts`
- `packages/core/src/queue/actionQueue.ts`
- `packages/core/src/memory/index.ts`
- `packages/db/prisma/schema.prisma`
- `packages/mcp-runner/src/types/ToolContract.ts`
- `packages/mcp-runner/src/validator/SchemaValidator.ts`
- `packages/mcp-runner/src/executor/MCPExecutor.ts`
- `packages/providers/src/index.ts`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/EVIDENCE_INDEX.md`
