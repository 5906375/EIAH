# ROADMAP ATUALIZADO v8

Data de referência: **2026-03-10**
Escopo: plataforma agentic governada (core + governança + interop + economy + Track P)

## 1) Resumo executivo

O core da plataforma está operacional e auditável (F0-F3 concluídas), com F4/F5 já em produção parcial e foco de v8 em **hardening verificável**, **fechamento de lacunas de governança/economy** e **redução de drift documental**.

## 2) Estado consolidado por fase

| Fase | Status | Situação v8 |
| --- | --- | --- |
| 0 — Infraestrutura comum | ✅ Concluída | Manter estabilidade e SLOs |
| 1 — Fundação operacional | ✅ Concluída | Manter |
| 2 — Cognição inicial | ✅ Concluída | Manter |
| 3 — Governança cognitiva | ✅ Concluída | Evolução incremental |
| 4 — Execução crítica imutável | ⚙️ Parcial avançada | Hardening operacional e validação externa contínua |
| 5.0 — Marketplace/governança avançada | ✅ Concluída (core) | Fechar UX/auditoria avançada de delegação |
| 5.1 — PoU + Trust Gate | ⚙️ Parcial avançada | Consolidar Receipt Canon v1 completo em todos os fluxos |
| 5.2 — Policies autoaplicáveis + human approvals | ⚙️ Parcial | Fechar modelo de aprovação e consistência de schema/contratos |
| 5.3 — Auditoria pública DLT | ⚙️ Parcial | Cobertura E2E HIGH completa + reconciliação contínua |
| 5.4 — Interoperabilidade | ⚙️ Parcial avançada | Matriz de compatibilidade CI e freeze de contrato |
| 5.5 — Outcome/experimentos | ⚙️ Parcial avançada | Recomendação AXO e automações de promoção |
| 5.6 — Economy | ⚙️ Parcial avançada | Settlement completo (reduzir stubs) + reputação verificável |
| Track P — Produto operacional | ⚙️ Parcial avançada | Escala de verticais, operações e qualidade de rollout |

## 3) Objetivos do v8

1. Transformar “parcial avançado” em “operacionalmente fechado” com critérios de evidência.
2. Eliminar drift entre docs, contratos e runtime.
3. Fechar cadeia econômica fim a fim com settlement confiável por provider.
4. Sustentar rollout de verticais com gates de não-regressão.

## 4) Backlog priorizado v8 (execução)

## P0 — Integridade documental e fonte da verdade
- Definir e publicar arquivo único de roadmap canônico (`ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-03-10.md`).
- Atualizar `docs/EVIDENCE_INDEX.md` para apontar apenas fontes existentes.
- Adicionar check de CI para falhar quando “source of truth” não existir.

**DoD P0**
- Referência de roadmap válida no índice.
- CI bloqueando novas quebras de referência.

## P1 — Governança/execução crítica
- Completar hardening de F4 (alertas, reconciliação contínua, rotina operacional).
- Consolidar F5.1: Receipt Canon v1 obrigatório para fluxos críticos.
- Fechar F5.2: padronizar aprovação humana no modelo e contrato (sem lacunas de schema).

**DoD P1**
- Evidência recorrente de reconciliação sem gaps críticos.
- Testes de fail-closed cobrindo cadeias inconsistentes.
- Contrato de aprovação humana consistente entre API, schema e evidência.

## P2 — Auditoria pública e interop
- Cobrir E2E HIGH por ação crítica definida em policy.
- Fechar matriz de compatibilidade interop em CI.
- Congelar versão de contrato interop com política explícita de evolução.

**DoD P2**
- E2E HIGH completo para ações críticas.
- CI aprovado para matriz de compatibilidade.
- Baseline interop atualizado sem breaking não-versionado.

## P3 — Economy hardening
- Evoluir settlement provider: reduzir/adaptar stubs (`crypto`/`bank`) para modo operacional.
- Consolidar webhook billing (assinatura, replay, idempotência) com evidência periódica.
- Expandir reputação/disputas para trilha verificável de produção.

**DoD P3**
- Settlement multi-provider com modos explicitamente suportados por ambiente.
- Métricas de replay/duplicidade estáveis.
- Evidência de ciclo econômico completo em produção controlada.

## P4 — Track P (produto e rollout)
- Escalar verticais com checklist padrão e gates de não-regressão.
- Fortalecer command centers por vertical (funil, bloqueios, export de prova).
- Operar piloto comercial com critérios de avanço `shadow -> pilot -> small`.

**DoD P4**
- KPI mínimo por vertical atingido.
- Sem regressão de isolamento multi-tenant/workspace.
- Evidências semanais de operação e rollout.

## 5) Riscos principais e mitigação

| Risco | Impacto | Mitigação v8 |
| --- | --- | --- |
| Drift docs vs runtime | Decisão errada e auditoria fraca | CI de consistência + fonte de verdade única |
| Lacunas de approvals/schema | Governança incompleta | fechamento contratual e testes de contrato |
| Settlement parcial por provider | Economia limitada | roadmap de provider por ambiente com SLO |
| Coexistência de run-workers | divergência operacional | definir modo único de operação por ambiente |

## 6) Métricas de saída v8

- `hardMetricsGo=true` em ciclos APE semanais consecutivos.
- `auditGap=0` e `duplicateSideEffects=0` em evidências recorrentes.
- Cobertura E2E HIGH de ações críticas definida em policy.
- Regressão de interop/economy bloqueada por CI.

## 7) Plano de entrega (ondas)

1. **Onda 1 (P0 + P1 base)**: integridade documental + fechamento governança crítica.
2. **Onda 2 (P2 + P3 base)**: interop compatível + economy multi-provider operacional.
3. **Onda 3 (P4 + estabilização)**: expansão de verticais com gates e rollout controlado.

## 8) Declaração de estado atual (v8)

A plataforma já opera como base agentic governada e auditável; o v8 foca em fechar lacunas de hardening, interoperabilidade e economia para atingir operação plenamente verificável em escala.
