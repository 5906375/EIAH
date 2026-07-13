# F0.46 — roadmap release gate chain consolidation

## Data
2026-07-13

## Objetivo
Consolidar documentalmente no roadmap/plano canônico a cadeia F0.34–F0.45 já mergeada, sem alterar runtime, sem alterar `release.yml` produtivo e sem declarar F0/P0 como fechado.

## Pré-condição confirmada

- `main` atualizado após o merge da F0.45
- `plano_unificacao_EIAH_interativo_atualizado_pos_F0_44_conversacao.html` presente no repositório
- evidência F0.45 presente em `ops/evidence/latest`
- `docs/EVIDENCE_INDEX.md` apontando para a evidência F0.45
- fonte canônica do roadmap permanece `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `ops/evidence/latest/f0-45-plan-unification-conversation-layer-consolidation-2026-07-11.md`
- `plano_unificacao_EIAH_interativo_atualizado_pos_F0_44_conversacao.html`

## Consolidação aplicada no roadmap

O roadmap canônico recebeu uma atualização executiva específica para a cadeia F0.34–F0.45, registrando de forma conservadora:

- `ReleaseNode22Readiness` verde em F0.34;
- auditoria controlada de `release.yml` em F0.35;
- separação Camada A/Camada B em F0.36;
- bridge `ReleaseNode22ValidationBuildDryRun` em F0.37;
- run verde do bridge em F0.38;
- risk model da Camada B em F0.39;
- `ReleasePublishPreflight` criado/verde em F0.40/F0.41;
- decisão de gate mínimo em F0.42;
- `ReleaseActivationRollbackGate` criado/verde em F0.43/F0.44;
- plano consolidado com camada Conversação materializado em F0.45.

Também foi explicitado no roadmap:

- `release.yml` produtivo permanece intocado;
- publish real, `secrets` produtivos, login em registry, GHCR/Docker push e tags/releases seguem bloqueados;
- a camada Conversação permanece `especificada/parcial`;
- F0/P0 transversal continuam parciais.

## Conteúdo preservado

- nenhuma alteração em runtime;
- nenhuma alteração em `ChatAgentLauncher`;
- nenhuma alteração em engine;
- nenhuma alteração em contratos;
- nenhuma alteração em workflows;
- nenhuma alteração em `release.yml`.

## Comandos executados

```bash
git status --short
git log --oneline -8
grep -n "ROADMAP_UNIFICADO\|F0.45\|f0-45-plan-unification-conversation-layer-consolidation" docs/EVIDENCE_INDEX.md
ls -la ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md
ls -la ops/evidence/latest/f0-45-plan-unification-conversation-layer-consolidation-2026-07-11.md
ls -la plano_unificacao_EIAH_interativo_atualizado_pos_F0_44_conversacao.html
grep -n "F0.34\|F0.35\|F0.36\|F0.37\|F0.38\|F0.39\|F0.40\|F0.41\|F0.42\|F0.43\|F0.44\|F0.45\|release.yml\|publish\|secrets\|GHCR\|tags" ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md
pnpm check:evidence-index
pnpm check:docs-link-integrity
git diff --check
git diff -- .github/workflows/release.yml
git diff -- .github/workflows/release-activation-rollback-gate.yml
git diff -- .github/workflows/release-publish-preflight.yml
git diff -- .github/workflows/release-node22-readiness.yml
git diff -- .github/workflows/release-node22-validation-build-dry-run.yml
git diff -- package.json
git diff -- pnpm-lock.yaml
git diff -- apps
git diff -- packages
git diff -- scripts
git status --short
git diff --stat
```

## Resultados reais dos checks

`pnpm check:evidence-index`

```text
{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 171383,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 474
}
```

`pnpm check:docs-link-integrity`

```text
{
  "ok": true,
  "check": "check:docs-link-integrity",
  "filesChecked": 15
}
```

`git diff --check`

```text
sem saída
```

## Prova de isolamento

Os diffs de isolamento abaixo devem permanecer sem saída:

- `git diff -- .github/workflows/release.yml`
- `git diff -- .github/workflows/release-activation-rollback-gate.yml`
- `git diff -- .github/workflows/release-publish-preflight.yml`
- `git diff -- .github/workflows/release-node22-readiness.yml`
- `git diff -- .github/workflows/release-node22-validation-build-dry-run.yml`
- `git diff -- package.json`
- `git diff -- pnpm-lock.yaml`
- `git diff -- apps`
- `git diff -- packages`
- `git diff -- scripts`

`git status --short` após o diff

```text
 M ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md
 M docs/EVIDENCE_INDEX.md
?? ops/evidence/latest/f0-46-roadmap-release-gate-chain-consolidation-2026-07-13.md
```

`git diff --stat`

```text
 ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md | 24 ++++++++++++++++++++++++
 docs/EVIDENCE_INDEX.md                        |  1 +
 2 files changed, 25 insertions(+)
```

## Status
Status: parcial/evidenciado
