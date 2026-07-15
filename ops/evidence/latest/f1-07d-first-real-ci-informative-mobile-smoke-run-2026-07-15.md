# F1.7d — First Real CI Informative Mobile Smoke Run Trigger Strategy — 2026-07-15

## Resumo executivo

A F1.7d confirmou o primeiro run real do gate informativo mobile smoke no GitHub Actions sem alterar o workflow. Em vez de ampliar triggers, a estrategia validada foi usar o fluxo ja existente de PR para `main`, cujo merge (`PR #274`) gerou um `push` em `main` que disparou o `CI Monorepo` e executou com sucesso o job `ImobFrontdoorMobileSmokeInformative`, com artifact real e `smoke-report.json` classificando o smoke como `PASS`.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `.github/workflows/ci.yml`
- `ops/evidence/latest/f1-06l-controlled-official-playwright-runner-execution-2026-07-14.md`
- `ops/evidence/latest/f1-06m-manual-smoke-closure-ci-promotion-boundary-2026-07-14.md`
- `ops/evidence/latest/f1-07-ci-promotion-decision-gate-design-2026-07-14.md`
- `ops/evidence/latest/f1-07a-ci-informative-mobile-smoke-gate-proposal-2026-07-14.md`
- `ops/evidence/latest/f1-07b-ci-informative-mobile-smoke-gate-implementation-2026-07-14.md`
- `ops/evidence/latest/f1-07c-first-ci-informative-mobile-smoke-run-2026-07-14.md`

## Pré-checks

### `git status --short`
```text
<sem saida>
```

### `git branch --show-current`
```text
main
```

### `git log --oneline -10`
```text
0ff24e6 Merge pull request #274 from 5906375/test/f1-7b-ci-informative-mobile-smoke-gate-implementation
7a55812 docs(f1): capture first informative ci mobile smoke run
c71be53 ci(f1): add informative mobile smoke gate
0de13be docs(f1): propose informative ci mobile smoke gate
ea466cf docs(f1): design ci promotion boundary for mobile smoke
b9a1555 docs(f1): close manual mobile smoke and defer ci promotion
f8c8f6f test(f1): evidence official playwright runner mobile smoke pass
664814a docs(f1): select dedicated playwright runtime base for mobile smoke
a1af299 test(f1): evidence controlled chromium provisioning blocker
b63c644 docs(f1): define chromium provisioning strategy for mobile smoke
```

## Estratégia de disparo escolhida

Estrategia escolhida: **nao alterar o trigger**.

Leitura objetiva:
- a F1.7c provou que `push` em `test/*` nao disparava o `CI Monorepo`;
- o `ci.yml` ja aceitava `pull_request` e `push` em `main`;
- o caminho minimo e auditavel foi usar o PR ja aberto da branch `test/f1-7b-ci-informative-mobile-smoke-gate-implementation` contra `main`;
- o merge desse PR produziu o `push` em `main` que efetivamente disparou o primeiro run real do gate informativo.

Conclusao:
- nao foi necessario adicionar `workflow_dispatch`;
- nao foi necessario ampliar `push` para `test/**`;
- a estrategia validada foi **PR -> merge -> push em `main` -> run real**.

## Branch / commit / PR

- Branch de origem do PR: `test/f1-7b-ci-informative-mobile-smoke-gate-implementation`
- PR URL: `https://github.com/5906375/EIAH/pull/274`
- PR state: `closed`
- PR merged: `true`
- Head SHA do PR: `7a55812a166713e98c42eef278bf4d7adddb7071`
- Merge commit em `main`: `0ff24e6866c2df38b7cab1dfa3c267e3b0f9c12d`

## GitHub Actions run

- Run URL: `https://github.com/5906375/EIAH/actions/runs/29367988231`
- Run ID: `29367988231`
- Workflow: `CI Monorepo`
- Job: `ImobFrontdoorMobileSmokeInformative`
- Status: `completed`
- Conclusion: `success`

Dados adicionais observados:
- event: `push`
- branch: `main`
- head SHA: `0ff24e6866c2df38b7cab1dfa3c267e3b0f9c12d`
- run number: `633`

## Artifact

- Nome esperado: `imob-frontdoor-mobile-smoke-informative`
- Encontrado: `sim`
- Arquivos analisados:
  - `healthcheck.json`
  - `smoke-report.json`
  - `smoke.exit_code`
  - `smoke.stderr.log`
  - `smoke.stdout.json`
  - `web-build.stdout.log`
  - `web-preview.pid`
  - `web-preview.stderr.log`
  - `web-preview.stdout.log`

Metadados observados:
- artifact id: `8324890246`
- size_in_bytes: `3509`
- digest: `sha256:08e3daa055618f090bf4cfc059432e45ef39e8a61f42b1bd535152cdb40b88c1`

## smoke-report.json

- classification: `PASS`
- routeStatus: `200`
- durationSeconds: `4`
- runnerImport: `formal_dependency:playwright`
- fallbackUsed: `false`
- imageTag: `mcr.microsoft.com/playwright:v1.61.1-noble`
- smokeExitCode: `0`
- viewports:
  - `mobile-360` (`360x740`) -> `ok=true`
  - `mobile-390` (`390x844`) -> `ok=true`
  - `tablet-768` (`768x1024`) -> `ok=true`
  - `tablet-1024` (`1024x768`) -> `ok=true`
- reasons: `[]` em todos os viewports

Campos complementares observados:
- `nodeVersion`: `v22.23.1`
- `playwrightVersion`: `1.61.1`
- `baseUrl`: `http://127.0.0.1:4173`
- `route`: `/app/imob/chat`
- `hasPilotCopy`: `false` em todos os viewports

## Interpretação

O primeiro run real do gate informativo ficou finalmente evidenciado.

O que foi provado:
- o trigger real aconteceu no `push` para `main` apos merge do PR `#274`;
- o job `ImobFrontdoorMobileSmokeInformative` executou no GitHub Actions;
- o front door IMOB foi buildado e servido em preview;
- o healthcheck da rota `/app/imob/chat` retornou `200`;
- o smoke rodou com imagem oficial Playwright e dependencia formal `playwright`;
- `fallbackUsed=false` foi preservado;
- o artifact esperado foi gerado e analisado;
- o resultado objetivo do smoke foi `PASS`.

O que esta fora da prova:
- o gate continua informativo, nao bloqueante;
- nao houve correcao de smoke nesta etapa;
- nao ha promocao para required check;
- nao ha qualquer autorizacao para F2/F3, release, publish ou side effects externos.

## Checks executados

- `pnpm check:evidence-index`
  - `ok: true`
  - `refsChecked: 516`
- `pnpm check:docs-link-integrity`
  - `ok: true`
  - `filesChecked: 15`
- `git diff --check`
  - sem saida
- `git diff -- .github/workflows release.yml apps packages scripts`
  - sem saida

Checks observacionais adicionais usados na investigacao:
- consulta de PR `#274`
- consulta do run `29367988231`
- consulta de jobs do run
- consulta e download do artifact `imob-frontdoor-mobile-smoke-informative`
- leitura dos logs do job `ImobFrontdoorMobileSmokeInformative`

## Prova de isolamento

- nenhum diff em `.github/workflows/ci.yml`
- nenhum diff em `release.yml`
- nenhum diff em `apps/**`
- nenhum diff em `packages/**`
- nenhum diff em `scripts/**`
- nenhum diff em runtime/engine
- nenhum diff em `ChatAgentLauncher`
- nenhuma alteracao em contratos de agente
- nenhuma promocao do gate para bloqueante

## Riscos residuais

- o sucesso evidenciado e de um primeiro run real; ainda nao mede estabilidade recorrente ou flakiness de longo prazo;
- o job continua com warnings de deprecacao Node 20 em actions externas, embora o run tenha fechado `success`;
- o gate permanece informativo, portanto falhas futuras ainda nao bloquearao merge automaticamente.

## Próximos passos

- manter F1.7d como evidência do primeiro run real, sem superdeclarar fechamento de F1.7;
- se houver falha futura do smoke em CI real, abrir etapa separada `F1.7e — Smoke Failure Analysis/Fix`;
- se a governanca quiser subir maturidade do gate, abrir etapa separada para decidir criterios de promocao de informativo para bloqueante.

## Status final

Status: evidenciado
