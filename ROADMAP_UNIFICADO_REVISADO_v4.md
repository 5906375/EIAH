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
## 🔐 FASE 5.1 — Proof of Usage (PoU) + Trust Gate 🏗️

Para implementar:
- proofOfUsage.ts → (intentHash + resultHash + signatures)
- Estender SCLLedger.ts → TxID composto
- trustGate.ts → bloqueio por Trust Score mínimo
- Reforçar trustScoreEngine.ts → anti-gaming + entropia

Critério de encerramento:
Execuções geram PoU imutável + autorização por confiança mínima.

---
## 🧠 FASE 5.2 — Policies Autoaplicáveis + Human Approval 🏗️

Para implementar:
- PolicyEngine.ts → enforcement no ActionRunner/Orchestrator
- /runs/:id/approve → endpoint de aprovação humana
- Run.approval_status + approvedBy
- Registro no GuardrailLedger/SCL (proof.finalized)
- Painel “Pendentes de Aprovação” no RunViewer

Critério de encerramento:
Policies vivas e autoexecutáveis + não-repúdio humano ativo.

---
## 🔗 FASE 5.3 — DLT On-Chain + Auditoria Pública 🏗️

Para implementar:
- Integração Web3 (ethers.js) → TxID real on-chain
- Verificação pública (/ledger/:txId)
- Tokenização de reputação (TrustScoreToken)
- Policies on-chain autoexecutáveis

Critério de encerramento:
Auditoria pública e verificação de reputação on-chain.

---
## 📘 MAPEAMENTO RESUMIDO (COM STATUS)

Fase | Foco Central | Entregável Principal | Status | Próximas Ações
--- | --- | --- | --- | ---
0 | Infraestrutura comum | Base estável + reconciliação | ✅ | Métricas Prom/OTel + dashboard
1 | Fundação operacional | Execução assíncrona + RBAC | ✅ | —
2 | Cognição inicial | ReAct + SSE + MCP | ✅ | —
3 | Governança cognitiva | Intent + PII + Trust | ✅ | Judge policy + dashboard
4 | Execução crítica | SCL off-chain + assinaturas | ⚙️ | Tagging completo + reconciliação ativa
5.0 | Marketplace + Delegação | Catálogo governado | ⚙️ | UX completa + auditoria avançada
5.1 | PoU + Trust Gate | Imutabilidade + confiança | 🏗️ | Implementar pipeline PoU
5.2 | Policies + Aprovação | Governança viva | 🏗️ | PolicyEngine + approvals
5.3 | DLT on-chain | Auditoria pública | 🏗️ | Web3 + explorer interno

---
## 🧾 RESUMO OPERACIONAL

Concluído: Fases 0 → 3  
Parcial: Fase 4 + 5.0  
Planejado: Fases 5.1 → 5.3

---
## 🧠 Prioridades Técnicas (ordem sugerida)

1. Completar tagging de `criticality` nas ações remanescentes
2. Reconciliação Guardrail ↔ SCL com alertas ativos
3. Trust Score dashboard e políticas de judge bloqueantes
4. Fluxo completo de delegação no front
5. PoU + Trust Gate
6. PolicyEngine + Human Approval
7. Web3 on-chain + reputação/tokenização

---
## 📍 Estado Atual (Q1/2026)

- Infra e cognição maduras; governança ativa.  
- Execução imutável off-chain com reconciliação e Vault obrigatório.  
- Marketplace funcional, porém ainda com UX limitada de delegação.  
- On-chain e políticas avançadas seguem planejadas.

