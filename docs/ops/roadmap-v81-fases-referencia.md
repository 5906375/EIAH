# Roadmap v8.1 — Fases de Referência

Fonte canônica: `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
Data de referência: **2026-06-15**
Uso: referência rápida de sessão — não substitui o roadmap canônico.

---

## Estado consolidado por fase

| Fase | Nome | Status v8.1 |
|------|------|-------------|
| F0 | Infraestrutura comum | ✅ Concluída |
| F1 | Fundação operacional | ✅ Concluída |
| F2 | Cognição inicial | ✅ Concluída |
| F3 | Governança cognitiva | ✅ Concluída |
| F4 | Execução crítica imutável | ⚙️ Parcial avançada / sustentada |
| F5.0 | Marketplace / governança avançada | ✅ Concluída (core) |
| F5.1 | PoU + Trust Gate / Receipt Canon | ✅ Concluída (operacional) |
| F5.2 | Policies autoaplicáveis + human approvals | ⚙️ Parcial avançada |
| F5.3 | Auditoria pública DLT | ⚙️ Parcial avançada |
| F5.4 | Interoperabilidade | ⚙️ Parcial avançada+ |
| F5.5 | Outcome / experimentos | ⚙️ Parcial avançada |
| F5.6 | Economy | ⚙️ Parcial avançada+ |
| Track P | Produto operacional (IMOB e verticais) | ⚙️ Parcial avançada+ |

---

## Detalhe por fase aberta

### F4 — Execução crítica imutável
- Hardening operacional recorrente obrigatório.
- Não declarar fechado sem evidência de ciclos recorrentes.
- Foco: alertas, reconciliação contínua, rotina operacional.

### F5.2 — Policies + human approvals
- IMOB avançou com responsible actor, reason codes e runtime mínimo Trilha B.
- Entitlement/billing real ainda fora do runtime.
- DoD: aprovação auditável ponta a ponta (modelo + contrato + trilha de evidência); Receipt Canon v1 completo; suite fail-closed sem gaps críticos.

### F5.3 — Auditoria pública DLT
- E2E HIGH recorrente e manifest/recency gates avançados.
- **Pendente explícito v8.1**: ratificação operacional dos SLO targets por ciclos recorrentes.
- Ações para fechar:
  1. Rodar `generate:e2e-high-manifest`
  2. Rodar `generate:slo-baseline`
  3. Repetir por 3 ciclos
  4. Calcular target
  5. Marcar `ratified: true`
  6. Gate bloquear de fato

### F5.4 — Interoperabilidade
- Interop spec v1 e contrato mínimo multi-vertical avançaram.
- Adotar Agent Protocol como contrato público canônico A2A/B2B.
- DoD: matriz de compatibilidade 100% no CI; sem breaking não-versionado; baseline e política sincronizados com runtime.

### F5.5 — Outcome / experimentos
- Mantém recomendação AXO e automações de promoção como evolução contínua.

### F5.6 — Economy
- Settlement A2A + EconomyReceipt v1 avançaram.
- Pendente: settlement por ambiente (providers `crypto`/`bank` ainda em stub); webhook billing com replay/idempotência; invoice mensal verificável.
- DoD: settlement multi-provider por ambiente; `duplicateSideEffects=0`; evidência de ciclo econômico completo em produção controlada.

### Track P — Produto operacional
- IMOB está **acima do programado**: Command Center, Dashboard operacional, RunArchive, Funil + Equipe, checklists executáveis implementados.
- Novas verticais (LEGAL, HEALTH, URBAN) continuam exigindo template, gates e rollout `shadow → pilot → small`.
- Pendente: ratificação SLO; gating fail-closed por tenantId/workspaceId em buscas/chat/ações por vertical.

---

## Backlog priorizado v8

### P0 — Integridade documental (transversal / obrigatório em todo ciclo)
- Manter `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md` e `docs/EVIDENCE_INDEX.md` sincronizados.
- CI bloqueando referências inválidas e drift documental.
- Qualquer divergência doc/contrato/runtime = incidente P0.
- **Status atual**: parcial — EVIDENCE_INDEX precisa apontar para o arquivo canônico vigente (2026-06-15).

### P1 — Governança / execução crítica
- Fechado por evidência/gates: `check:p1-critical-chain` + `check:p1-reconciliation-recurring`.
- DoD: evidência recorrente de reconciliação sem gaps críticos; testes fail-closed; contrato de aprovação humana consistente.

### P2 — Auditoria pública e interop
- Cobrir E2E HIGH para ações críticas definidas em policy.
- Fechar matriz de compatibilidade interop em CI.
- Congelar versão de contrato interop.
- DoD: E2E HIGH completo; CI aprovado para matriz; baseline interop sem breaking não-versionado; fluxo `discovery → negotiate → execute` validado.

### P3 — Economy hardening
- Evoluir settlement provider (stubs → modo operacional por ambiente).
- Consolidar invoice mensal, webhook billing (replay, idempotência).
- DoD: settlement multi-provider por ambiente; `auditGap=0`; evidência de ciclo econômico completo.

### P4 — Track P (produto e rollout)
- Escalar verticais com checklist padrão e gates de não-regressão.
- Rollout `shadow → pilot → small` com critérios explícitos.
- IMOB Knowledge Search in-chat sem lógica nova no launcher.
- DoD: KPI mínimo por vertical; sem regressão multi-tenant/workspace; evidência semanal; busca documental com fonte explícita no payload.

---

## Verticais

| Vertical | Status |
|----------|--------|
| IMOB | ✅ Operacional e ativa (acima do programado) |
| LEGAL | `context_only` — não operacional |
| HEALTH | `context_only` — desabilitada |
| URBAN | Não existe ainda no codebase |

**Regra**: não promover vertical `context_only` para operacional sem baseline + contrato + gates + decisão explícita + evidência indexável.

---

## Pendente crítico único v8.1

```
Ratificação operacional dos SLO targets por ciclos recorrentes (F5.3)
```

Enquanto não ocorrer, o v8 não pode ser declarado "operacionalmente fechado".

---

## PRs que materializam avanço além do v8

| PR | Frente | Classificação |
|----|--------|--------------|
| #141 | IMOB Trilha B Fase 4 — contrato mínimo multi-vertical | Além do programado |
| #142 | IMOB Data Backend — normalização, contracts, responsible owner | Além do programado |
| #143 | IMOB Run Archive — serviço, worker, persistência | Além do programado |
| #144 | IMOB Web — Command Center, dashboard, superfícies operacionais | Além do programado |
| #145 | IMOB Funnel/Team — consolidação equipe no funil | Além do programado |
| #146 | IMOB Trilha B runtime mínimo — validação de contrato canônico | Além do programado |

---

## Trilha B — estado normativo

- PR `PR-IMOB-DATA-TRILHA-B-RUNTIME-01`: **concluído** (validação real do contrato em `assignResponsibleActor()`).
- Não reabrir esta frente agora.
- Só voltar se: (a) adicionar gate real de entitlement/billing no runtime, ou (b) expandir para outra vertical (ex: LEGAL).

---

## Fluxo operacional das verticais no SaaS

```
EIAH SaaS
→ Cadastro
→ Tenant
→ Assinatura / Plano
→ Pagamento / Billing
→ Ativação / Entitlements
→ Permissões / Roles / Scope
→ Workspace
→ Chat Agent Launcher EIAH
→ Verticais (IMOB, LEGAL, etc.)
```

**Regra-mãe do chat:**
```
Agente define. Engine executa. Launcher renderiza.
```
Sem entitlement ativo → fail-closed obrigatório.

---

## Regras de decisão v8.1

1. Não reabrir frentes já fechadas do IMOB Data sem decisão explícita.
2. Evidence Index só pode ser atualizado com arquivos existentes fisicamente no repositório.
3. Evidence Index só pode apontar para evidências geradas por execução real.
4. Nenhuma regra de comportamento do chat nasce no `ChatAgentLauncher`.
5. Fluxos sem `tenantId`, `workspaceId` ou `entitlement` válidos devem falhar em modo fail-closed.
6. Sem evidência indexável, o status é `parcial`.
7. Toda implementação deve ser checada contra o roadmap v8.1 antes de ser considerada válida.
8. Não declarar compatibilidade sem baseline versionado e CI.
9. Não criar breaking change sem política de versionamento e bump apropriado.
10. Não executar ação crítica sem trilha verificável.

---

## ALERTAs ativos — IMOB Surface Data Reliability (2026-06-15)

Resultado do checklist `docs/ops/imob-surface-data-reliability-checklist.md` executado nesta sessão.

| ID | Item | Risco | Arquivo |
|----|------|-------|---------|
| A1 | 1 | Funil (kpiWindowDays variável) vs CC (snapshot fixo) → contadores divergem | `evidenciado localmente` |
| A2 | 10 | `syntheticThreads` silenciosos em todas as abas exceto Soluções | `evidenciado` |
| A3 | 15 | `caseCostMap` sempre 30d; `costByJourney` usa `kpiWindowDays` → custo diverge | `evidenciado localmente` |
| A4 | 31 | `apiListImobCases()` e `apiListImobCaseCosts()` sem `workspaceId` explícito no frontend | `evidenciado` |
| A5 | 33 | Aba Parceiros usa `owners[]` como proxy; `partners.tsx` usa `delegateeId` como `ownerId` | dashboard.tsx, partners.tsx |
| A6 | 35 | `buildCaseFallbackActions` e `buildCasePriority` com lógica de negócio em `dashboard.tsx` (viola AGENTS.md) | `evidenciado localmente` |
| A7 | 23 | `contextCase` em Soluções pode ser resolvido por heurística de texto/flow sem indicação ao usuário | aberto |
| A8 | 6, 26 | KPI totals de `properties.tsx` usam `syntheticProperties` sem badge de fonte no strip | `evidenciado` |
| A9 | 14, 34 | `properties.tsx` nunca sai do modo demo; IDs sintéticos não reconciliáveis com API | `evidenciado localmente` |
| A10 | 4 | "Casos em parceria" = contagem de delegações, não de casos CRM reais | `evidenciado localmente` |

**Placar**: 40 itens ✅ OK · 10 itens ⚠️ ALERTA · 35 itens total  
**Status dos alertas (2026-06-15)**: A1/A2/A3/A4/A5/A6/A7/A8/A9/A10 `evidenciado` — **10/10** · nenhum `aberto` · nenhum `evidenciado localmente`

> **Rodada IMOB Surface Data Reliability encerrada em 2026-06-15: nenhum alerta aberto; 10 alertas evidenciados com artefato físico indexado.**

### Patches aplicados em 2026-06-15

| ALERTA | Arquivo alterado | Evidência local | Status |
|--------|-----------------|-----------------|--------|
| A6 | `imobCommandCenterHelper.ts` — exportar `buildImobCasePriority`, adicionar `buildImobCaseFallbackActions` | `imobCommandCenterHelper.test.ts` — 10/10 pass | `evidenciado localmente` |
| A6 | `dashboard.tsx` — remover duplicatas, importar do helper | teste de não-regressão incluso | `evidenciado localmente` |
| A8 | `properties.tsx` — badge de fonte adicionado ao KPI strip | `docs/ops/evidence/latest/imob-surface-data-reliability/a8-ci-evidence.md` — 22/22 pass | `evidenciado` |
| A9 | `properties.tsx` — `syntheticProperties` removido, `apiListImobProperties()` substituído | `properties.test.ts` — 5/5 pass | `evidenciado localmente` |
| A10 | `partners.tsx` — KPI "Casos em parceria" → "Políticas delegadas", `activeCases` → `delegationPoliciesCount` | `partners.test.ts` — 4/4 pass | `evidenciado localmente` |
| A4 | `api.ts`, `dashboard.tsx`, `imobCrmRouter.ts` — defense in depth, workspaceId como checagem de consistência | `docs/ops/evidence/latest/imob-surface-data-reliability/a4-ci-evidence.md` — 6/6 pass (DB real) | `evidenciado` |
| A1 | `ImobCommandCenter.tsx`, `ImobDashboardHero.tsx`, `dashboard.tsx` — rótulos de contexto de janela; A1-follow-up: `apiGetImobFunnelHealth` agora recebe `window: "7d"` explicitamente | `docs/ops/evidence/latest/imob-surface-data-reliability/a1-ci-evidence.md` — 9/9 pass | `evidenciado` |
| A2 | `dashboard.tsx` — `syntheticThreads` removido, `selectedThreadId` inicia null, `requestedThreadId` validado contra threads reais, empty states semânticos | `docs/ops/evidence/latest/imob-surface-data-reliability/a2-ci-evidence.md` — 9/9 pass | `evidenciado` |
| A3 | `ImobCommandCenter.tsx` — prop `caseCostWindowDays?: number` (default 30), `costLabel` com `(${caseCostWindowDays}d)`; `dashboard.tsx` — passa `caseCostWindowDays={30}` explicitamente | `docs/ops/evidence/latest/imob-surface-data-reliability/a3-ci-evidence.md` — 8/8 pass | `evidenciado` |
| A5 | `partners.tsx` — `syntheticPartners` removido; `source` = `"empty"/"error"/"real"`; `delegateeId` fora do fallback de nome; badge `"delegações marketplace"/"sem delegações"/"indisponível"` | `docs/ops/evidence/latest/imob-surface-data-reliability/a5-ci-evidence.md` — 14/14 pass | `evidenciado` |
| A6 | `imobCommandCenterHelper.ts` — `buildImobCaseFallbackActions` adicionada e exportada; `dashboard.tsx` — definições locais removidas, importa do helper | `docs/ops/evidence/latest/imob-surface-data-reliability/a6-ci-evidence.md` — 10/10 pass | `evidenciado` |
| A7 | `dashboard.tsx` — `contextCase` useMemo refatorado para retornar `{ contextCase, contextCaseSource }`; badge `"estimado por contexto da thread"` quando `contextCaseSource === "heuristic"`; lógica e deeplinks inalterados | `docs/ops/evidence/latest/imob-surface-data-reliability/a7-ci-evidence.md` — 11/11 pass | `evidenciado` |
| A9 | `properties.tsx` — `syntheticProperties` removido; `apiListImobProperties()` na montagem; badge de fonte no KPI strip; empty state semântico | `docs/ops/evidence/latest/imob-surface-data-reliability/a9-ci-evidence.md` — 5/5 pass | `evidenciado` |
| A10 | `partners.tsx` — `"Casos em parceria"` → `"Políticas delegadas"`; `activeCases` → `delegationPoliciesCount`; `"processos ativos"` → `"políticas ativas"` | `docs/ops/evidence/latest/imob-surface-data-reliability/a10-ci-evidence.md` — 14/14 pass | `evidenciado` |

Arquivos de teste criados:
- `apps/web/src/features/imob/imobCommandCenterHelper.test.ts`
- `apps/web/src/pages/app/imob/properties.test.ts`
- `apps/web/src/pages/app/imob/partners.test.ts`
- `apps/api/src/tests/imob-crm-workspace-scope.test.ts`
- `apps/web/src/pages/app/imob/dashboard.threads.test.ts`
- `apps/web/src/features/imob/imobA1Labels.test.ts`
- `apps/web/src/features/imob/imobA3CostWindow.test.ts`
- `apps/web/src/pages/app/imob/dashboard.a7contextCase.test.ts`
