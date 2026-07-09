# F0.6 — IMOB front door command center report

## Data

2026-07-09

## Objetivo

Consolidar estado, evidencias, gates, lacunas e proximos criterios do front door IMOB apos F0.1-F0.5.

## Escopo

Este PR e documental/evidencial. Nao altera runtime, UX, backend, policy, ChatAgentLauncher, Prisma, WhatsApp, mobile ou economy.

## Estado atual consolidado

| Frente | Evidencia | Estado | O que prova |
| --- | --- | --- | --- |
| F0.1 | `ops/evidence/latest/f0-1-imob-entitlement-error-rendering-2026-07-09.md` | parcial/evidenciado | Renderizacao do erro estruturado de entitlement/access gate preservando `message`, `reasonCode` e CTA real do backend. |
| F0.2 | `ops/evidence/latest/f0-2-imob-frontdoor-states-2026-07-09.md` | parcial/evidenciado | Padronizacao local dos estados `loading`, `empty`, `error`, `entitlement` e fallback desconhecido fail-closed. |
| F0.3 | `ops/evidence/latest/f0-3-imob-frontdoor-ux-rendering-2026-07-09.md` | parcial/evidenciado | Prova UX/rendering por snapshot textual deterministico cobrindo entitlement com/sem CTA, loading, empty, erro generico e fallback. |
| F0.4 | `ops/evidence/latest/f0-4-imob-frontdoor-regression-checklist-2026-07-09.md` | parcial/evidenciado | Nao-regressao consolidada de F0.1/F0.2/F0.3 com teste focado verde, launcher sem diff e checks documentais verdes. |
| F0.5 | `ops/evidence/latest/f0-5-imob-frontdoor-ci-gate-2026-07-09.md` | parcial/evidenciado | Gate dedicado `check:imob-frontdoor-regression` e job `ImobFrontdoorRegression` no CI para proteger a frente de forma recorrente. |

## Gates existentes

- `check:imob-frontdoor-regression`
  - onde esta definido: `package.json`
  - o que protege: agrega o teste focado IMOB, `check:chat-launcher-render-only`, `check:evidence-index` e `check:docs-link-integrity`
  - resultado local: `PASS`
- teste focado IMOB
  - onde esta definido: `apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts`
  - o que protege: F0.1-F0.3 em uma superficie focada do front door IMOB
  - resultado local: `PASS`
- `check:chat-launcher-render-only`
  - onde esta definido: `package.json` + `scripts/checkChatLauncherRenderOnly.ts`
  - o que protege: impede logica cognitiva nova no `ChatAgentLauncher`
  - resultado local: `PASS`
- `check:evidence-index`
  - onde esta definido: `package.json` + `scripts/checkEvidenceIndex.ts`
  - o que protege: integridade do Evidence Index e referencias fisicas reais
  - resultado local: `PASS`
- `check:docs-link-integrity`
  - onde esta definido: `package.json` + `scripts/checkDocsLinkIntegrity.ts`
  - o que protege: links documentais versionados usados pelas frentes de evidencia
  - resultado local: `PASS`
- job `ImobFrontdoorRegression`
  - onde esta definido: `.github/workflows/ci.yml`
  - o que protege: execucao recorrente do gate F0.5 em `pull_request`
  - resultado local: indiretamente validado pelo `pnpm check:imob-frontdoor-regression` verde

## Estado de governanca

- fail-closed preservado;
- CTA de entitlement vem do backend;
- ausencia de CTA inventado protegida por teste;
- `reasonCode` preservado;
- fallback desconhecido fail-closed;
- `ChatAgentLauncher` render-only protegido;
- Evidence Index validado;
- docs-link-integrity validado.

## Lacunas remanescentes

### P0 — Integridade documental

- Nenhum drift documental foi detectado pelos checks executados nesta etapa.
- `check:orphan-tests` permanece como divida preexistente conhecida com `blockingOrphanCount:50`; nao e regressao F0.6, mas segue como passivo estrutural do repositorio.

### P1 — Governança/execução crítica

- F0.1-F0.5 nao fecham execucao critica global da plataforma.
- Ainda faltam evidencias operacionais recorrentes alem da surface do front door, incluindo consolidacao por ciclos e integracao com frentes mais amplas de governanca do roadmap.

### P2 — Auditoria/interop

- Auditoria/interop multicanal continuam fora deste escopo.
- O front door IMOB ainda nao carrega cobertura propria para canais alem do web desktop atual.

### P3 — Economy hardening

- Fora do escopo desta frente.

### P4 — Track P / front door IMOB

- O front door IMOB avancou em renderizacao, nao-regressao e gate dedicado de CI.
- Mobile e WhatsApp continuam sem fechamento proprio por contrato/gates/evidencia operacional.

## Critérios para avançar de parcial/evidenciado

- gate F0.5 verde em CI por execucoes consecutivas suficientes para demonstrar estabilidade recorrente;
- zero regressao de `check:imob-frontdoor-regression`;
- `auditGap=0` quando existir metrificacao aplicavel ao front door ou cadeia operacional relacionada;
- `duplicateSideEffects=0` quando a frente passar a envolver acoes reais com side effects;
- `hardMetricsGo=true` em ciclos aplicaveis do roadmap, quando essa surface passar a participar formalmente desses ciclos;
- evidencia visual/UX mantida atualizada junto do gate recorrente;
- `check:orphan-tests` tratado ou explicitamente isolado de forma estavel fora do escopo global;
- nenhum diff em `ChatAgentLauncher` fora de PR dedicado, justificado e governado.

## Próximas recomendações

- resolver ou segregar a divida de `check:orphan-tests`;
- consolidar reporting do gate F0.5 apos execucoes reais em CI;
- avaliar extensao gradual do front door para mobile/WhatsApp somente com contratos e gates proprios;
- manter status conservador ate haver evidencia operacional recorrente alem da validacao local e documental.

## Checks executados

| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm check:imob-frontdoor-regression` | PASS | Teste focado IMOB + `check:chat-launcher-render-only` + `check:evidence-index` + `check:docs-link-integrity`. |
| `pnpm check:evidence-index` | PASS | `ok:true`, `refsChecked:405`. |
| `pnpm check:docs-link-integrity` | PASS | `ok:true`, `filesChecked:15`. |
| `pnpm check:chat-launcher-render-only` | PASS | `ok:true`, `violations:[]`. |
| `git diff -- apps/web/src/components/agents/ChatAgentLauncher.tsx` | vazio | sem alteracao |
| `git diff -- apps/web/src/pages/app/imob/chat.tsx` | vazio | sem alteracao |
| `git diff -- package.json` | vazio | sem alteracao F0.6 |
| `git diff -- .github/workflows/ci.yml` | vazio | sem alteracao F0.6 |
| `git diff --check` | PASS | sem saida |
| `pnpm check:orphan-tests` | FAIL residual | `blockingOrphanCount:50`; divida preexistente, nao regressao F0.6. |

## Status

Status: parcial/evidenciado
