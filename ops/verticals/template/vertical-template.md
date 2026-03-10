# Vertical Template v1 — EIAH

Objetivo: adicionar novas verticais (ex.: `legal`, `health`) sem regressão no core.

## Regras de arquitetura (obrigatórias)
1. Core permanece genérico (sem lógica de domínio).
2. Semântica de domínio fica no frontend da vertical.
3. Verticais reutilizam: Governança, Runs/Ledger, Economy, Interop.
4. Multi-tenant fail-closed por `tenantId/workspaceId`.

## Estrutura mínima
- Frontend:
  - `/app/<vertical>/chat`
  - `/app/<vertical>/processes`
  - `/app/<vertical>/partners`
- Marketplace:
  - `/app/marketplace/<vertical>`
  - `POST /api/marketplace/installations/activate`
- Gate de instalação:
  - bloqueio de `/app/<vertical>/*` quando não instalado.

## Checklist técnico por vertical
- [ ] Rotas frontend criadas sem quebrar navegação atual.
- [ ] Instalação por tenant/workspace funcional e idempotente.
- [ ] Session context expõe `productInstallations`.
- [ ] Entitlement de instalação propagado para menu e guards.
- [ ] Command Center da vertical usa dicionário semântico.
- [ ] Fluxos críticos continuam com PoU/Receipt/Ledger.

## Contratos recomendados
- `Agent Protocol` para discovery/negotiate/execute.
- `Receipt Canon` para prova auditável.
- `Settlement Provider` para pagamentos.

## Definition of Ready
- [ ] Vocabulário do domínio definido.
- [ ] Ações críticas do domínio mapeadas (`tier=HIGH` quando aplicável).
- [ ] Runbook operacional inicial publicado.

## Definition of Done
- [ ] Ativação via marketplace com evidência e2e.
- [ ] Gate de não-regressão no CI aprovado.
- [ ] Evidências APE atualizadas em `ops/evidence/latest`.
