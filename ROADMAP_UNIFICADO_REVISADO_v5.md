# ROADMAP UNIFICADO v5 (Atualizado em 2026-02-16)
# (Gateway + Core + Governança Cognitiva + Execução Crítica + Marketplace)

Legenda:
- ✅ Implementado / Concluído
- ⚙️ Parcial / Em progresso
- 🏗️ Planejado / Não iniciado

---
## Definição de Done por Fase

DONE = merge no `main` + testes essenciais + evidências no repo + runbook (quando aplicável) + métricas/observabilidade mínimas + endpoints/documentos previstos pela fase.

---
## FASE 0 — Infraestrutura Comum (Pré-Execução) ✅

Status consolidado: ✅ concluída.

Evidências principais:
- ✅ Schema unificado em `@repo/db` com `Run`, `RunEvent`, `GuardrailLedger`, `GuardrailAuditLedger`, `SclLedger`.
- ✅ Conexões Redis/BullMQ para `runQueue`, `actionQueue`, `maintenanceQueue`.
- ✅ Isolamento multi-tenant/workspace na camada de dados e rotas.
- ✅ Reconciliação Guardrail↔SCL com serviço dedicado e persistência de relatório de auditoria.
- ✅ Anti-duplicação de scheduler com lock Redis + limpeza de repeatables obsoletos.
- ✅ Métricas de lock skip, scheduling e reconciliação expostas via endpoint Prom.

Observação:
- Custódia Vault obrigatória está implementada por política/configuração (`SIGNER_REQUIRED` + `SIGNER_PROVIDER=vault`), mas depende de enforcement de ambiente em produção.

---
## FASE 1 — Fundação Operacional ✅

Status consolidado: ✅ concluída.

Evidências principais:
- ✅ Gateway com auth, enforce tenant e rotas de runs/actions/maintenance/governance.
- ✅ Workers assíncronos (run-worker, action-runner, maintenance-worker).
- ✅ RBAC multi-tenant/workspace com permissões granulares.
- ✅ VersionedActionRegistry e pipeline de catálogo de ações.
- ✅ Observabilidade básica com `RunEvent` e métricas de filas.

---
## FASE 2 — Cognição Inicial (ReAct + Intenção) ✅

Status consolidado: ✅ concluída.

Evidências principais:
- ✅ Loop ReAct/orquestração funcional no worker.
- ✅ Persistência de eventos e plano (`RunEvent`, `PlanStepRecord`).
- ✅ Streaming SSE de runs com infraestrutura de pub/sub.
- ✅ Action Runner com MCP, validação de contrato/schema e execução governada.
- ✅ Trust Score como gate na execução do Action Runner.

---
## FASE 3 — Governança Cognitiva e Observabilidade ✅

Status consolidado: ✅ concluída.

Evidências principais:
- ✅ Memória semântica (stores e endpoints de memória/search).
- ✅ Intent validator em modo enforce.
- ✅ Run Viewer/governança com evidências de ledger e masking.
- ✅ Trust Score com histórico e dashboard operacional.
- ✅ Judge Gate já com suporte a `shadow|enforce` e bloqueio no Action Runner.

Ponto de atenção:
- Ajuste fino de thresholds/políticas do Judge para fluxos críticos por ambiente (hardening operacional contínuo).

---
## FASE 4 — Execução Crítica Imutável (SCL Off-Chain) ⚙️

Status consolidado: ⚙️ parcial avançada.

Implementado:
- ✅ Ledger append-only (SCL/Guardrail) com hash crítico e payload hash.
- ✅ Assinatura com signer manager (Vault/HTTP/Local) + políticas de assinatura.
- ✅ `criticality` no Action Registry com auditoria de cobertura.
- ✅ Roteamento e gate SCL em ações high/critical no Action Runner.
- ✅ Reconciliação Guardrail↔SCL com relatório e endpoint de integridade.

Para concluir:
- ⚙️ Cobertura 100% de `criticality` explícita (eliminar itens inferidos/needsReview).
- ⚙️ Endurecer política de assinatura obrigatória por ambiente (fail-closed produtivo).

---
## FASE 5.0 — Governança Avançada e Marketplace ⚙️

Status consolidado: ⚙️ parcial avançada.

Implementado:
- ✅ API de marketplace/delegações (`/marketplace`, `/marketplace/:id`, `/marketplace/:id/subscribe`, `/delegations...`).
- ✅ Tabelas e fluxo de `MarketplaceItem` + `DelegationPolicy`.
- ✅ `enforceTenant` com `checkDelegationPolicy()` e evento `delegation.used`.
- ✅ Front de self-service e painel de governança com delegação.
- ✅ Exibição de `policyHash` e `signatureHash` no UI de governança.

Para concluir:
- ⚙️ UX end-to-end mais robusta para assinatura/delegação em cenários complexos.
- ⚙️ Runbook operacional e telemetria orientada a produto para ciclo de delegação.

---
## FASE 5.1 — Proof of Usage (PoU) + Trust Gate ⚙️

Status consolidado: ⚙️ parcial avançada.
Dependência explícita: PoU forte depende do fechamento da Fase 4 (SCL/ledger com `criticalHash + sclTxId + assinatura` consistentes).

Implementado:
- ✅ Modelo PoU + migrações + serviço `create/finalize/fail`.
- ✅ Composite TxID, snapshots de trust e assinatura/atestado.
- ✅ Pipeline PoU no Action Runner com eventos de bloqueio/finalização.
- ✅ Endpoint de auditoria externa `GET /ledger/pou/:id`.
- ✅ Endpoint de integridade de ledger (`/ledger/integrity/report`).

Para concluir:
- ⚙️ Hardening operacional (runbooks, SLOs, validação externa e políticas de exposição).
- ⚙️ Padronização de auditoria externa para consumidores não internos.

---
## FASE 5.2 — Policies Autoaplicáveis + Human Approval ⚙️

Status consolidado: ⚙️ (antes marcado como planejado).

Implementado:
- ✅ `PolicyEngine` integrado via adapter e avaliação em `runs`/`runWorker`.
- ✅ Endpoint de aprovação humana `POST /runs/:id/approve`.
- ✅ Modelo `ApprovalRecord` com trilha de decisão, hashes, trust e idempotência.
- ✅ Listagem de pendências e painel de approvals no front de governança.
- ✅ Gating por identidade wallet, RBAC, trust e policy durante aprovação.

Para concluir:
- ⚙️ Consolidar estado de aprovação diretamente no modelo `Run` (se essa for a decisão arquitetural final).
- ⚙️ Conectar ações de aprovação/rejeição do painel de governança ao endpoint final em todos os fluxos UI.
- ⚙️ Runbook de operações para aprovação humana em produção.

---
## FASE 5.3 — DLT On-Chain + Auditoria Pública 🏗️

Status consolidado: 🏗️ não iniciado (infra parcial preparatória).

Estado atual:
- ✅ Existem referências/contratos para executor `web3` e casos de uso on-chain no catálogo.
- 🏗️ Executor Web3 real ainda não implementado (`web3 executor not implemented`).
- 🏗️ Não há publicação on-chain canônica de ledger com verificação pública por tx.
- 🏗️ Tokenização de reputação e policies on-chain ainda não iniciadas.
- ✅ Critério preparatório v5: `txId` consultável e reconciliável com IDs internos (`RunId`/`SCL`/`PoU`).
- ✅ Critério preparatório v5: replay idempotente por padrão (sem gerar novo `txId` indevido).

---
## MAPEAMENTO RESUMIDO (ATUALIZADO)

Fase | Foco Central | Entregável Principal | Status | Próximas Ações
--- | --- | --- | --- | ---
0 | Infra comum | Base estável + reconciliação | ✅ | Hardening de enforcement Vault por ambiente
1 | Fundação operacional | Execução assíncrona + RBAC | ✅ | —
2 | Cognição inicial | ReAct + SSE + MCP | ✅ | —
3 | Governança cognitiva | Intent + Trust + Judge + observabilidade | ✅ | Tuning de políticas de Judge/Trust
4 | Execução crítica | SCL off-chain + assinatura + reconciliação | ⚙️ | 100% criticality explícita + fail-closed de assinatura
5.0 | Marketplace + Delegação | Catálogo governado e delegação auditável | ⚙️ | UX/runbook end-to-end
5.1 | PoU + Trust Gate | Imutabilidade + confiança + auditoria | ⚙️ | Hardening operacional/externo
5.2 | Policies + Aprovação | Governança viva com aprovação humana | ⚙️ | Finalizar integração UI e estratégia de estado no Run
5.3 | DLT on-chain | Auditoria pública | 🏗️ | Implementar executor Web3 + publicação/verificação on-chain

---
## Concluído Além do Planejado Original

- ✅ Fase 5.2 saiu de “planejado” para implementação parcial real (PolicyEngine + approvals API/UI).
- ✅ Endpoint de auditoria PoU (`/ledger/pou/:id`) já entregue, embora estava listado como pendente.
- ✅ Painel de governança ampliado com abas de approvals/delegação/integridade e evidências sensíveis.
- ✅ Mecanismos de idempotência e trilha de negação (RBAC/trust/identidade) na aprovação de runs.

---
## Prioridades Técnicas Recomendadas (Nova Ordem)

1. Fechar cobertura explícita de `criticality` (remover dependência de inferência para produção).
2. Harden de assinatura e policy modes em fail-closed por ambiente crítico.
3. Finalizar UX de approvals/delegações com ações totalmente conectadas e auditáveis.
4. Completar hardening de PoU/Trust Gate (runbooks, SLOs, auditoria externa padronizada).
5. Iniciar Fase 5.3 com implementação real do executor Web3 e trilha de verificação pública.
