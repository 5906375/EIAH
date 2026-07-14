# F1.7c — First CI Informative Mobile Smoke Run and Artifact Capture

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
- `ops/evidence/latest/f1-06l-controlled-official-playwright-runner-execution-2026-07-14.md`
- `ops/evidence/latest/f1-06m-manual-smoke-closure-ci-promotion-boundary-2026-07-14.md`
- `ops/evidence/latest/f1-07-ci-promotion-decision-gate-design-2026-07-14.md`
- `ops/evidence/latest/f1-07a-ci-informative-mobile-smoke-gate-proposal-2026-07-14.md`
- `ops/evidence/latest/f1-07b-ci-informative-mobile-smoke-gate-implementation-2026-07-14.md`

## Agentes envolvidos
- Codex como executor tecnico governado

## Branch, commit e HEAD
- Branch local/remota: `test/f1-7b-ci-informative-mobile-smoke-gate-implementation`
- HEAD curto confirmado: `c71be53`
- HEAD completo: `c71be5369f2ae0d0ee9825144e8d697404be5bfc`

## Pre-checks obrigatorios

### `git status --short`
```text
<sem saida>
```

### `git branch --show-current`
```text
test/f1-7b-ci-informative-mobile-smoke-gate-implementation
```

### `git log --oneline -10`
```text
c71be53 ci(f1): add informative mobile smoke gate
0de13be docs(f1): propose informative ci mobile smoke gate
ea466cf docs(f1): design ci promotion boundary for mobile smoke
b9a1555 docs(f1): close manual mobile smoke and defer ci promotion
f8c8f6f test(f1): evidence official playwright runner mobile smoke pass
664814a docs(f1): select dedicated playwright runtime base for mobile smoke
a1af299 test(f1): evidence controlled chromium provisioning blocker
b63c644 docs(f1): define chromium provisioning strategy for mobile smoke
769b171 test(f1): classify mobile smoke browser environment blockers
5734026 Merge pull request #273 from 5906375/test/f1-6f-playwright-runner-normalization-after-relink-stabilization
```

Leitura:
- `HEAD` contem `c71be53 ci(f1): add informative mobile smoke gate`
- working tree estava limpa antes do push controlado

## Comando de push realizado
```bash
git push -u origin test/f1-7b-ci-informative-mobile-smoke-gate-implementation
```

## Resultado do push
- push concluido com sucesso
- branch remota criada em `origin`
- mensagem remota ofereceu URL de PR para a branch

## Run URL / ID
- Run URL: ausente
- Run ID: ausente

## Workflow e job observados
- Workflow alvo: `CI Monorepo`
- Job esperado: `ImobFrontdoorMobileSmokeInformative`

Observacao importante:
- o arquivo `.github/workflows/ci.yml` atual declara:

```yaml
on:
  push:
    branches:
      - main
      - 'release/**'
  pull_request:
```

- portanto, um `push` para `test/f1-7b-ci-informative-mobile-smoke-gate-implementation` nao satisfaz o filtro de `push`
- e tambem nao cria evento `pull_request` por si so

## Verificacao remota de runs
Consulta remota por SHA:
- repositório: `5906375/EIAH`
- commit: `c71be5369f2ae0d0ee9825144e8d697404be5bfc`

Resultado observado:
```json
{"workflow_runs":[]}
```

Leitura:
- nenhum workflow run foi encontrado para o commit atual
- nao ha evidencia de que o job `ImobFrontdoorMobileSmokeInformative` tenha sido agendado

## Artifact encontrado ou ausente
- Artifact: ausente
- Nome esperado: `imob-frontdoor-mobile-smoke-informative`
- Motivo: sem workflow run, nao houve upload de artifact

## Arquivos de artifact analisados
- nenhum

## Resultado do `smoke-report.json`
- indisponivel

Campos nao observados por ausencia de artifact/run:
- `classification`
- `route_status` / `routeStatus`
- `durationSeconds`
- `runnerImport`
- `fallbackUsed`
- `imageTag`
- `smokeExitCode`
- `viewports`
- `reasons`

## Logs relevantes
- Push remoto bem-sucedido
- Nenhum run associado ao commit no GitHub
- Nenhum artifact disponivel

## Interpretacao
- classificacao da etapa: `run ausente`
- causa imediata: o trigger atual do workflow nao cobre `push` em branches `test/*`
- isso e coerente com a configuracao do `ci.yml`
- nao houve erro de smoke, healthcheck, build ou artifact upload porque o workflow sequer foi iniciado

## Riscos residuais
- o gate informativo existe no repositório, mas ainda nao tem primeira execucao real em GitHub Actions
- ainda nao ha medida de duracao/flake/custo em CI real
- o comportamento do job no ambiente de GitHub Actions segue nao evidenciado

## Decisao
- manter gate informativo
- nao promover para obrigatorio
- nao corrigir workflow nesta etapa

## Proxima etapa recomendada
- F1.7d para corrigir a estrategia de disparo do primeiro run real
- opcoes a decidir em PR separado:
  - abrir PR para disparar `pull_request`
  - adicionar `workflow_dispatch`
  - ou ampliar filtro de `push` de forma explicitamente aprovada

## Checks documentais
- `pnpm check:evidence-index`
- `pnpm check:docs-link-integrity`
- `git diff --check`
- `git diff -- .github/workflows release.yml apps packages scripts`

## Prova de isolamento
- nenhuma alteracao adicional em `.github/workflows/ci.yml`
- nenhuma alteracao em `release.yml`
- nenhuma alteracao em `apps/**`
- nenhuma alteracao em `packages/**`
- nenhuma alteracao em `scripts/**`
- nenhuma alteracao em runtime/engine
- `ChatAgentLauncher` permaneceu intocado
- sem release/tag/publish
- sem push adicional do commit documental

## Status final
- parcial
