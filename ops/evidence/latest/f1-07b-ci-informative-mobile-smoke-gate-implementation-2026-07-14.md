# F1.7b — CI informative mobile smoke gate implementation

## Status
parcial

## Data
2026-07-14

## Fontes lidas
- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `.github/workflows/ci.yml`
- `package.json`
- `apps/web/package.json`
- `scripts/smoke-f1-4-front-door-mobile.mjs`
- `ops/evidence/latest/f1-06l-controlled-official-playwright-runner-execution-2026-07-14.md`
- `ops/evidence/latest/f1-06m-manual-smoke-closure-ci-promotion-boundary-2026-07-14.md`
- `ops/evidence/latest/f1-07-ci-promotion-decision-gate-design-2026-07-14.md`
- `ops/evidence/latest/f1-07a-ci-informative-mobile-smoke-gate-proposal-2026-07-14.md`

## Agentes envolvidos
- Codex como executor tecnico governado

## Resumo F1.6l / F1.6m / F1.7 / F1.7a
- F1.6l provou PASS manual/controlado do smoke mobile F1 com `mcr.microsoft.com/playwright:v1.61.1-noble`, `classification=PASS`, `runnerImport=formal_dependency:playwright` e `fallbackUsed=false`.
- F1.6m registrou que esse PASS ainda nao promovia CI.
- F1.7 definiu que a promocao futura deveria comecar como gate informativo.
- F1.7a transformou isso em proposta de patch isolado em `ci.yml`.

## Arquivo CI alterado
- `.github/workflows/ci.yml`

## Descricao do job adicionado
- Job: `imob_frontdoor_mobile_smoke_informative`
- Nome exibido: `ImobFrontdoorMobileSmokeInformative`
- Tipo: informativo
- Isolamento: job novo, sem alterar `ImobFrontdoorRegression`
- Politica de nao-bloqueio inicial:
  - `continue-on-error: true` no job
  - etapa final avalia `classification`
  - em caso de falha o job sinaliza problema, mas a intencao continua sendo nao promover a check obrigatoria nesta etapa

## Como o front door e servido
- Instala dependencias do monorepo com `pnpm install --frozen-lockfile --ignore-scripts`
- Builda `@eiah/web` com `pnpm --filter @eiah/web build`
- Sobe preview deterministico com:

```bash
pnpm --filter @eiah/web preview --host 0.0.0.0 --port 4173
```

- Faz healthcheck explicito da rota:

```text
http://127.0.0.1:4173/app/imob/chat
```

- Exige `route_status=200` antes de rodar o smoke

## Como o smoke e executado
- Imagem do job:
  - `mcr.microsoft.com/playwright:v1.61.1-noble`
- Comando executado no workflow:

```bash
F1_FRONT_DOOR_BASE_URL=http://127.0.0.1:4173 \
F1_FRONT_DOOR_ROUTE=/app/imob/chat \
F1_FRONT_DOOR_TOKEN=seed_53670bd0a12cf8e0960b688fc402ad79 \
F1_FRONT_DOOR_INSTALLED_PRODUCTS=IMOB \
node scripts/smoke-f1-4-front-door-mobile.mjs
```

- O workflow nao altera o script; ele so envolve a saida do smoke para enriquecer o artifact com:
  - `route_status`
  - `durationSeconds`
  - `smokeExitCode`
  - `imageTag`

## Env vars usadas
- `F1_FRONT_DOOR_BASE_URL=http://127.0.0.1:4173`
- `F1_FRONT_DOOR_ROUTE=/app/imob/chat`
- `F1_FRONT_DOOR_TOKEN=seed_53670bd0a12cf8e0960b688fc402ad79`
- `F1_FRONT_DOOR_INSTALLED_PRODUCTS=IMOB`
- `F1_MOBILE_SMOKE_IMAGE_TAG=mcr.microsoft.com/playwright:v1.61.1-noble`
- `F1_MOBILE_SMOKE_ARTIFACT_DIR=.artifacts/imob-frontdoor-mobile-smoke`

## Artefatos e logs configurados
- `web-build.stdout.log`
- `web-preview.stdout.log`
- `web-preview.stderr.log`
- `web-preview.pid`
- `healthcheck.json`
- `smoke.stdout.json`
- `smoke.stderr.log`
- `smoke.exit_code`
- `smoke-report.json`

Conteudo esperado do `smoke-report.json`:
- `classification`
- `runnerImport`
- `fallbackUsed`
- `route_status`
- `durationSeconds`
- `smokeExitCode`
- `imageTag`
- `viewports`

## Politica informativa
- O job foi adicionado como trilha informativa inicial
- Nao altera `release.yml`
- Nao promove required check
- Nao toca apps/packages/scripts/runtime/engine
- Nao toca `ChatAgentLauncher`

## O que ainda falta para tornar obrigatorio
- pelo menos N execucoes estaveis em GitHub Actions
- confirmacao real de duracao aceitavel
- observacao de flake
- artefatos completos em runs reais
- aprovacao explicita posterior para promocao

## Riscos e mitigacao
- Pull da imagem Playwright:
  - risco de latencia/cache
  - mitigacao: tag fixa alinhada a F1.6l
- Diferenca entre runner controlado manual e GitHub Actions:
  - risco de flake nao vista localmente
  - mitigacao: gate informativo antes de required
- `vite preview`:
  - risco de rota nao estabilizar
  - mitigacao: healthcheck fail-closed com timeout e artifact explicito
- Contrato do smoke:
  - risco de faltar `route_status`/`durationSeconds` no script original
  - mitigacao: wrapper do workflow enriquece o JSON sem alterar `scripts/**`

## Checks executados
- `pnpm check:evidence-index`
- `pnpm check:docs-link-integrity`
- `git diff --check`
- `git diff -- release.yml apps packages scripts`

## Prova de isolamento
- Alteracoes restritas a:
  - `.github/workflows/ci.yml`
  - `docs/EVIDENCE_INDEX.md`
  - `ops/evidence/latest/f1-07b-ci-informative-mobile-smoke-gate-implementation-2026-07-14.md`
- Nenhum arquivo em `apps/**` foi alterado
- Nenhum arquivo em `packages/**` foi alterado
- Nenhum arquivo em `scripts/**` foi alterado
- Nenhum runtime/engine foi alterado
- `ChatAgentLauncher` permaneceu intocado
- Nenhum Docker foi executado neste turno
- Nenhum push foi realizado

## Status final
- parcial
- Implementacao do gate informativo concluida
- Execucao real do novo job em GitHub Actions permanece pendente para evidenciar comportamento em CI
