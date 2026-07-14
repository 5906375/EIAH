# F1.7a — CI informative mobile smoke gate implementation proposal

## Status
proposta/documental

## Data
2026-07-14

## Agentes envolvidos
- Codex como executor técnico governado

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
- `ops/evidence/latest/f1-06l-controlled-official-playwright-runner-execution-2026-07-14.md`
- `ops/evidence/latest/f1-06m-manual-smoke-closure-ci-promotion-boundary-2026-07-14.md`
- `ops/evidence/latest/f1-07-ci-promotion-decision-gate-design-2026-07-14.md`

## Resumo F1.6l / F1.6m / F1.7
- F1.6l provou PASS manual/controlado do smoke F1.4 com `mcr.microsoft.com/playwright:v1.61.1-noble`, `classification=PASS`, `exitCode=0`, `runnerImport=formal_dependency:playwright` e `fallbackUsed=false`.
- F1.6m registrou explicitamente que PASS manual/controlado nao equivale a promocao de CI.
- F1.7 definiu que a proxima aproximacao em CI deve comecar como gate informativo, nao obrigatorio.

## Workflow inspecionado em modo read-only
- Arquivo: `.github/workflows/ci.yml`
- Job atual relevante: `imob_frontdoor_regression`
- Nome do job atual: `ImobFrontdoorRegression`
- Comportamento atual:
  - checkout
  - setup pnpm
  - setup node 22
  - `pnpm install --frozen-lockfile --ignore-scripts`
  - `pnpm check:imob-frontdoor-regression`
- O job atual e leve, sem container/browser image e sem passo de servir frontend para smoke browser.

## Decisao sobre encaixe futuro
- Recomendacao: novo job isolado no workflow `ci.yml`, separado de `ImobFrontdoorRegression`.
- Motivo:
  - nao misturar gate render-only/documental com smoke browser;
  - reduzir blast radius sobre o gate atual;
  - facilitar observacao de flake/duracao sem contaminar um check ja estabilizado;
  - permitir promocao futura para required de forma independente.
- Workflow separado nao e a primeira recomendacao porque a necessidade descrita em F1.7 e de promocao futura para CI do monorepo, mas ainda sem tornar required.

## Proposta de implementacao informativa
- Nome sugerido do job futuro: `imob_frontdoor_mobile_smoke_informative`
- Tipo: informativo, nao required na fase inicial
- Runtime sugerido:
  - `runs-on: ubuntu-latest`
  - `container: mcr.microsoft.com/playwright:v1.61.1-noble`
- Instalacao:
  - reaproveitar `pnpm/action-setup@v4`
  - `actions/setup-node@v4` com Node 22
  - `pnpm install --frozen-lockfile --ignore-scripts`
- Front door servido no proprio job:
  - `pnpm --filter @eiah/web preview --host 0.0.0.0 --port 4173`
  - base URL proposta: `http://127.0.0.1:4173`
- Healthcheck proposto:
  - esperar a rota `http://127.0.0.1:4173/app/imob/chat`
  - exigir `route_status=200`
  - timeout inicial sugerido: `60s`
- Smoke proposto:
  - `F1_FRONT_DOOR_BASE_URL=http://127.0.0.1:4173 node scripts/smoke-f1-4-front-door-mobile.mjs`
  - manter resolucao de runner por dependência formal `playwright`
  - preservar `fallbackUsed=false`
- Viewports esperadas:
  - `360x740`
  - `390x844`
  - `768x1024`
  - `1024x768`

## Patch planejado em alto nivel
- Adicionar novo job isolado em `.github/workflows/ci.yml`
- Nao alterar `ImobFrontdoorRegression`
- Nao alterar `release.yml`
- Nao alterar apps/packages/scripts nesta etapa de proposta
- Publicar artefatos do smoke apenas para observacao
- Inicialmente marcar o gate como informativo e nao obrigatorio

## Politica de imagem / tag / cache
- Imagem recomendada: `mcr.microsoft.com/playwright:v1.61.1-noble`
- Justificativa:
  - mesma imagem validada com PASS em F1.6l;
  - evita repetir drift observado em `node:22-bookworm` por dependencia nativa ausente;
  - alinha a execucao CI com a evidencia manual/controlada mais forte disponivel.
- Registro futuro desejado:
  - image tag
  - image id ou digest, se disponivel no runtime do CI
  - versao `playwright`
  - `nodeVersion`
  - `pnpmVersion`

## Comando proposto para servir o front door
```bash
pnpm --filter @eiah/web preview --host 0.0.0.0 --port 4173
```

## Comando proposto para rodar o smoke
```bash
F1_FRONT_DOOR_BASE_URL=http://127.0.0.1:4173 node scripts/smoke-f1-4-front-door-mobile.mjs
```

## Artefatos e logs propostos
- JSON completo do smoke
- stdout do smoke
- stderr do smoke
- `classification`
- `exitCode`
- `route_status`
- `durationSeconds`
- `runnerImport`
- `fallbackUsed`
- image tag
- image id/digest quando disponivel

## Fail-closed atual e futuro
- Fase informativa atual:
  - nao bloquear merge inicialmente
  - registrar falha/classificacao sem promover o check a required
- Fase obrigatoria futura:
  - `classification != PASS` bloqueia
  - ausencia de JSON valido bloqueia
  - `route_status != 200` bloqueia
  - `fallbackUsed != false` bloqueia
  - viewports incompletas bloqueiam

## Riscos e mitigacao
- Pull externo da imagem:
  - risco: custo/latencia/cache inconsistente
  - mitigacao: usar tag fixa ja validada e observar estabilidade antes de required
- Flake browser/network:
  - risco: falso negativo no CI
  - mitigacao: gate inicialmente informativo, job isolado e observacao de N execucoes
- Diferenca entre runner manual e GitHub Actions:
  - risco: PASS local/controlado nao reproduzir igual no CI
  - mitigacao: usar mesma imagem oficial Playwright e registrar artefatos completos
- Servir frontend no CI:
  - risco: `vite preview` ou healthcheck nao estabilizarem no tempo esperado
  - mitigacao: timeout explicito e healthcheck claro antes do smoke
- Impacto no monorepo:
  - risco: aumento de duracao do CI
  - mitigacao: job separado, inicialmente nao obrigatorio

## Criterios de promocao para obrigatorio
- N execucoes CI informativas estaveis
- `classification=PASS` consistente
- `route_status=200` consistente
- `durationSeconds` dentro de limite acordado
- zero flake observada no periodo definido
- artefatos completos em todas as execucoes
- aprovacao explicita posterior

## Bloqueios preservados
- Nenhum workflow foi alterado nesta etapa
- `release.yml` permaneceu intocado
- Nenhum Docker foi executado
- Nenhum smoke foi executado
- Nenhum app/package/script/runtime/engine foi alterado
- `ChatAgentLauncher` permaneceu intocado
- Nenhuma promocao CI foi realizada

## Checks executados
- `pnpm check:evidence-index`
- `pnpm check:docs-link-integrity`
- `git diff --check`
- `git diff -- .github/workflows release.yml apps packages scripts`

## Status final
- proposta/documental
