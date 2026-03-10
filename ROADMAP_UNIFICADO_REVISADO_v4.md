# 🧭 ROADMAP UNIFICADO v4 (2026)
# (Gateway + Core + Governança Cognitiva + Execução Crítica + Marketplace)

Legenda:
- ✅ Implementado / Concluído
- ⚙️ Parcial / Em progresso
- 🏗️ Planejado / Não iniciado

---
## 🩻 FASE 0 — Infraestrutura Comum (Pré-Execução) ✅

Objetivo:
Garantir consistência entre serviços, bancos e filas antes de iniciar execuções agentic.

Implementado:
- ✅ Schema unificado (@repo/db): Run, RunEvent, GuardrailLedger, GuardrailAuditLedger, SclLedger
- ✅ Conexões Redis/BullMQ (runQueue, actionQueue, maintenanceQueue)
- ✅ Multi-tenant/workspace configurado
- ✅ Custódia obrigatória via Vault (SIGNER_REQUIRED=true + SIGNER_PROVIDER=vault)
- ✅ Reconciliação hash↔TxID (serviço + job recorrente + auditoria)
- ✅ Anti-duplicação do scheduler (lock Redis) + limpeza de repeatables obsoletos

Para concluir:
- Exportar métricas do scheduler e lock skip (Prom/OTel)
- Dashboard de integridade SCL/Guardrail

Critério de encerramento:
Integridade automatizada com observabilidade externa (SLOs de reconciliação).

---
## ⚙️ FASE 1 — Fundação Operacional ✅

Objetivo:
Criar o encanamento agentic (autenticação, filas e workers assíncronos).

Implementado:
- ✅ Gateway (auth Bearer + rate limit + rotas /runs,/actions,/maintenance)
- ✅ Core (workers run/action/maintenance)
- ✅ RBAC multi-tenant/workspace
- ✅ VersionedActionRegistry (catálogo versionado)
- ✅ Observabilidade básica (RunEvent + métricas BullMQ)

Critério de encerramento:
Base estável sem pendências.

---
## 🧠 FASE 2 — Cognição Inicial (ReAct + Intenção) ✅

Sprint 2 – ReAct + SSE
- ✅ Loop perceive → plan → act funcional
- ✅ Persistência de eventos RunEvent, PlanStepRecord
- ✅ Publicação Redis / SSE (/runs/:id/stream com replay)

Sprint 2.5 – MCP Action Runner + Tool Contracting
- ✅ Action Runner (MCP Server + adapter Core)
- ✅ Validação JSON Schema + execução sandboxed
- ✅ Logging estruturado (GuardrailAuditLedger)
- ✅ Trust Score como gate (Action Runner)

Critério de encerramento:
Trust Score afeta autorização e execução.

---
## 🧩 FASE 3 — Governança Cognitiva e Observabilidade ✅

Sprint 3 – Memória Semântica + Intenção
- ✅ VectorMemory (pgvector)
- ✅ Endpoints /memory e /memory/search
- ✅ Intent Validator em modo enforce (bloqueio)

Sprint 4 – Observabilidade + Trust Score + Anti-Alucinação
- ✅ Run Viewer com masking de PII (markdown + JSON/state)
- ✅ Trust Score Engine em uso (gates no run + action-runner)
- ⚙️ Anti-alucinação heurística (judge gate configurável)

Para concluir:
- Tornar judge gate policy bloqueante em fluxos críticos (quando aplicável)
- Dashboard dinâmico de Trust Score

Critério de encerramento:
Execuções cognitivamente governadas e rastreáveis.

---
## 🔒 FASE 4 — Execução Crítica Imutável (SCL Off-Chain) ⚙️

Sprint 5 – Smart Contract Ledger (MVP Off-Chain)
- ✅ Ledger append-only (hash de intenção e parâmetros)
- ✅ Assinatura Vault/KMS obrigatória
- ✅ ActionRegistry com `criticality`
- ✅ Roteamento SCL para ações high/critical (action-runner + registry)
- ⚙️ Apenas off-chain (sem TxID on-chain público)

Para concluir:
- Classificação crítica completa nas ações restantes
- Reconciliação Guardrail ↔ SCL com alertas automáticos
- Preparar camada Web3 para futura publicação on-chain

Critério de encerramento:
Ledger off-chain reconciliável + base pronta para migração on-chain.

---
## 🌐 FASE 5 — Governança Avançada e Marketplace ⚙️

🧩 Sprint 6 – Marketplace + Delegação Segura
Implementado:
- ✅ API /marketplace, /marketplace/:id, /subscribe
- ✅ Tabelas MarketplaceItem e DelegationPolicy
- ✅ enforceTenant.ts com checkDelegationPolicy()
- ✅ Log delegation.used no GuardrailLedger
- ✅ UI marketplace/self-service básica

Para concluir:
- Fluxo completo de assinatura/delegação no front (UX + validação)
- Auditoria avançada de delegação (policyHash + signatureHash visíveis no UI)

Critério de encerramento:
Marketplace ativo + delegações auditáveis multi-tenant.

---
## 🔐 FASE 5.1 — Proof of Usage (PoU) + Trust Gate ⚙️

Implementado:
- ✅ PoU receipts no pipeline de governança/ledger
- ✅ Snapshot de trust acoplado à verificação
- ✅ Auditoria via endpoint público `/api/ledger/:txId`
- ✅ Guardas fail-closed para inconsistências de receipt canon

Para concluir:
- Fechar cobertura de Receipt Canon v1 completo em todos os fluxos críticos
- Hardening operacional de reconciliação contínua

Critério de encerramento:
PoU + Trust Gate obrigatórios, com cadeia canônica consistente em produção.

---
## 🧠 FASE 5.2 — Policies Autoaplicáveis + Human Approval ⚙️

Implementado:
- ✅ PolicyEngine com enforcement no fluxo de execução
- ✅ Endpoint de aprovação humana (`/runs/:id/approve`)
- ✅ Trilhas de auditoria e reason codes de governança
- ✅ UI de governança operacional

Para concluir:
- Fechar consistência completa de modelo/contrato de approvals no schema
- Consolidar cobertura de regressão para fluxos aprovados/rejeitados

Critério de encerramento:
Policies autoaplicáveis + aprovação humana com consistência de contrato ponta a ponta.

---
## 🔗 FASE 5.3 — DLT + Auditoria Pública ⚙️

Implementado:
- ✅ Endpoint público por `txId` com vínculo canônico `txId -> runId -> bundleHash`
- ✅ Reconciliação ledger com invariantes auditáveis
- ✅ Evidências HIGH policy-driven

Para concluir:
- Cobertura E2E completa para ações HIGH críticas
- Política final e estável de risk tiering

Critério de encerramento:
Auditoria pública verificável com cobertura HIGH fechada.

---
## 🤝 FASE 5.4 — Interoperabilidade ⚙️

Implementado:
- ✅ Rotas de protocolo: `discovery`, `negotiate`, `execute`
- ✅ Contrato versionado do Agent Protocol v1 + baseline de compatibilidade
- ✅ Evidência E2E da cadeia interop

Para concluir:
- Matriz CI de compatibilidade completa por versão/cenário

Critério de encerramento:
Interop versionada e validada por matriz de compatibilidade contínua.

---
## 📈 FASE 5.5 — Outcome / Experimentos ⚙️

Implementado:
- ✅ Fluxo auditável de experimentos (start/decision/rollback/status)
- ✅ Gate de promoção por KPI + FP/FN + segurança
- ✅ Telemetria FP/FN versionada

Para concluir:
- Sistema completo de recomendação AXO para promoção contínua

Critério de encerramento:
Ciclo de experimentação governado com decisão automatizada confiável.

---
## 💱 FASE 5.6 — Economy ⚙️

Implementado:
- ✅ Payment release condicionado a PoU/SCL
- ✅ Disputas auditáveis com lifecycle e impacto em reputação
- ✅ Settlement provider operacional (stripe) + adapters (`crypto`/`bank`) em stub

Para concluir:
- Settlement multi-provider plenamente operacional (reduzir stubs)
- Reputação verificável avançada em produção

Critério de encerramento:
Economia agent-to-agent operacional com settlement confiável e prova verificável.

---
## 🧱 TRACK P — Produto Operacional ⚙️

Implementado:
- ✅ Onboarding com modos `provision` e `register_only`
- ✅ Gestão de perfil, sessão e troca de workspace
- ✅ Upload de documentos e fluxos guiados (incluindo onboarding UI)
- ✅ Vertical IMOB com command center, funil e evidências de piloto
- ✅ DocOps com checks de consistência e depreciação/sunset

Para concluir:
- Hardening contínuo de billing webhook
- Escala de verticais com gates de não-regressão recorrentes

Critério de encerramento:
Produto operável em escala multi-vertical sem regressão do core.

---
## 📘 MAPEAMENTO RESUMIDO (COM STATUS)

Fase | Foco Central | Entregável Principal | Status | Próximas Ações
--- | --- | --- | --- | ---
0 | Infraestrutura comum | Base estável + reconciliação | ✅ | Métricas Prom/OTel + dashboard
1 | Fundação operacional | Execução assíncrona + RBAC | ✅ | —
2 | Cognição inicial | ReAct + SSE + MCP | ✅ | —
3 | Governança cognitiva | Intent + PII + Trust | ✅ | Judge policy + dashboard
4 | Execução crítica | SCL off-chain + assinaturas | ⚙️ | Tagging completo + reconciliação ativa
5.0 | Marketplace + Delegação | Catálogo governado | ✅ | UX avançada de delegação
5.1 | PoU + Trust Gate | Imutabilidade + confiança | ⚙️ | Receipt Canon v1 completo em fluxos críticos
5.2 | Policies + Aprovação | Governança viva | ⚙️ | Fechar consistência de approvals no schema/contrato
5.3 | Auditoria pública (DLT-ready) | Verificação pública por txId | ⚙️ | Cobertura E2E HIGH + risk tiering final
5.4 | Interoperabilidade | Discovery/Negotiate/Execute versionados | ⚙️ | Matriz CI de compatibilidade
5.5 | Outcome / Experimentos | Promoção governada por KPI/FPFN | ⚙️ | Recomendação AXO completa
5.6 | Economy | PoU-gated payment + disputa + settlement | ⚙️ | Settlement multi-provider + reputação verificável
Track P | Produto operacional | Verticais + operação + DocOps | ⚙️ | Hardening de webhook e escala de verticais

---
## 🧾 RESUMO OPERACIONAL

Concluído: Fases 0 → 3 + 5.0  
Parcial: Fase 4 + 5.1 → 5.6 + Track P  
Planejado: Fechamentos de hardening e completude v8

---
## 🧠 Prioridades Técnicas (ordem sugerida)

1. Corrigir drift documental (fonte canônica única do roadmap + CI)
2. Fechar hardening F4/F5.1 (reconciliação contínua + receipt canon completo)
3. Fechar consistência contratual de approvals (F5.2)
4. Completar cobertura HIGH e risk tiering final (F5.3)
5. Fechar matriz de compatibilidade interop (F5.4)
6. Evoluir settlement multi-provider e reputação verificável (F5.6)
7. Escalar Track P com gates de não-regressão por vertical

---
## 📍 Estado Atual (Q1/2026)

- Infra e cognição maduras; governança ativa e auditável.
- Execução crítica com SCL off-chain, ledger e verificação pública por `txId`.
- Interoperabilidade e economy em operação parcial avançada.
- v8 prioriza hardening, compatibilidade e fechamento de lacunas para escala.
