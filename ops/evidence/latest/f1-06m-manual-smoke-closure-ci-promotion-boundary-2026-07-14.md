# F1.6m — Manual Smoke Closure and CI Promotion Boundary

## Status

evidenciado/documental

## Fontes lidas

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f1-06g-front-door-mobile-chromium-sandbox-validation-2026-07-14.md`
- `ops/evidence/latest/f1-06h-controlled-browser-smoke-environment-2026-07-14.md`
- `ops/evidence/latest/f1-06i-chromium-provisioning-strategy-2026-07-14.md`
- `ops/evidence/latest/f1-06j-controlled-chromium-provisioning-execution-2026-07-14.md`
- `ops/evidence/latest/f1-06k-dedicated-playwright-runtime-base-image-selection-2026-07-14.md`
- `ops/evidence/latest/f1-06l-controlled-official-playwright-runner-execution-2026-07-14.md`

## Agentes envolvidos

- `Codex` como executor técnico governado

## Objetivo

Consolidar documentalmente a cadeia F1.6g–F1.6l, declarar a F1.6l como **PASS manual/controlado** e estabelecer explicitamente a fronteira de decisão: o smoke verde ainda **não** foi promovido para CI.

## Consolidação F1.6g–F1.6l

| Etapa | Ambiente | Resultado | Classificação | Leitura operacional |
| --- | --- | --- | --- | --- |
| F1.6g | host local | launch Chromium falhou | `ENV_SANDBOX_BLOCKED` | host não serve como baseline canônico |
| F1.6h | `eiah-web` | Playwright resolveu, mas browser não existia | `CHROMIUM_BINARY_MISSING` | `eiah-web` não deve virar runner de browser |
| F1.6i | documental | estratégia de provisioning | `PROVISIONING_STRATEGY_REQUIRED` | recomendou runner dedicado |
| F1.6j | runner dedicado `node:22-bookworm` | Chromium provisionado, mas launch falhou por lib ausente | `UNKNOWN_CHROMIUM_LAUNCH_FAILURE` | `node:22-bookworm` puro é insuficiente |
| F1.6k | documental | seleção da base runtime | `proposta/parcial` | recomendou imagem oficial Playwright |
| F1.6l | runner oficial `mcr.microsoft.com/playwright:v1.61.1-noble` | smoke passou | `PASS` | evidência manual/controlada verde, ainda sem CI |

## Resultado consolidado da F1.6l

Leitura final da etapa verde:
- `classification=PASS`
- `exitCode=0`
- `image=mcr.microsoft.com/playwright:v1.61.1-noble`
- `runnerImport=formal_dependency:playwright`
- `fallbackUsed=false`
- `route_status=200`
- viewports verdes:
  - `360x740`
  - `390x844`
  - `768x1024`
  - `1024x768`

Implicação:
- o smoke F1.4 está **evidenciado em execução manual/controlada**;
- o problema não estava no script nem no produto IMOB em si;
- a barreira principal era o runtime/browser environment;
- a imagem oficial Playwright resolveu a trilha manual/controlada.

## Boundary CI

Declaração explícita:
- **PASS manual/controlado não significa CI promovido**.
- Nenhum workflow foi alterado nesta cadeia.
- Nenhum gate CI novo foi criado.
- Nenhum step de GitHub Actions foi atualizado.
- `release.yml` permanece intocado.
- F1.7 deve decidir a promoção para CI em PR separado.

Leitura normativa:
- a F1.6l prova viabilidade manual/controlada;
- ela **não** prova automaticamente custo, estabilidade, cache policy, tempo de job ou impacto operacional no CI;
- portanto, a fronteira correta é: **verde manual evidenciado, CI ainda não promovido**.

## Critérios mínimos para F1.7

Uma futura F1.7 de promoção para CI deve decidir explicitamente, antes de mexer em `.github/workflows`:

1. tag exata da imagem Playwright a usar no CI
2. política de `docker pull`/cache
3. custo e tempo esperado do step/job
4. condição de execução:
   - sempre
   - PR
   - branch específica
   - manual
5. natureza do gate:
   - obrigatório
   - informativo
6. artefatos e logs a persistir
7. política fail-closed
8. impacto no tempo total do CI monorepo
9. aprovação explícita antes de qualquer alteração em `.github/workflows`

## Bloqueios preservados

Confirmado:
- sem alteração em `ChatAgentLauncher`
- sem alteração em runtime
- sem alteração em engine
- sem alteração em `apps/**`
- sem alteração em `packages/**`
- sem alteração em `scripts/**`
- sem alteração em `.github/workflows`
- sem alteração em `release.yml`
- sem Docker
- sem novo smoke
- sem `docker pull`
- sem `docker run`
- sem `docker build`
- sem `docker push`
- sem `apt-get`
- sem `playwright install-deps`
- sem `publish`
- sem `secrets`
- sem `tags/releases`
- sem avanço F2/F3
- sem declaração de `CI-ready`

## Checks executados

```bash
pnpm check:evidence-index
pnpm check:docs-link-integrity
git diff --check
git diff -- .github/workflows release.yml apps packages scripts
```

## Arquivos alterados

- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f1-06m-manual-smoke-closure-ci-promotion-boundary-2026-07-14.md`

## Status final

evidenciado/documental
