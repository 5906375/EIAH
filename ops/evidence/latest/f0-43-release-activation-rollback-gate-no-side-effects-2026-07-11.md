# F0.43 — release activation/rollback gate without side effects

## Data
2026-07-11

## Objetivo
Implementar um gate manual reforçado de ativação/rollback para a Camada B do release path, sem side effects.

## Escopo

Esta etapa:

- não altera `release.yml`;
- não usa secrets produtivos;
- não publica NPM;
- não executa `npm publish` ou `pnpm publish`;
- não faz Docker/GHCR push;
- não faz login em registry;
- não cria tags/releases;
- não declara o release path fechado.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `.github/workflows/release.yml`
- `.github/workflows/release-publish-preflight.yml`
- `ops/evidence/latest/f0-42-release-publish-gate-decision-after-preflight-green-2026-07-11.md`

## Implementação

Workflow criado:

- `.github/workflows/release-activation-rollback-gate.yml`

Características do workflow:

- trigger manual via `workflow_dispatch`;
- exige `target_version` semver-like;
- exige `release_surface` explícita (`cli`, `api`, `workers`, `multi_surface`);
- exige `decision_reason`, `technical_owner`, `operational_owner`, `operational_window_utc` e `rollback_reference`;
- exige política declarada de `retry_strategy` e `idempotency_strategy`;
- exige confirmação humana explícita de que o gate não executa side effects;
- valida a superfície escolhida contra os artefatos reais do repositório;
- confirma que `release.yml` ainda contém as superfícies reais de publish que exigem gate reforçado;
- emite apenas resumo decisório e plano candidato de publish/rollback;
- se autoaudita contra padrões proibidos e contra referência a `NPM_TOKEN`, `NODE_AUTH_TOKEN` e `REGISTRY_PAT`.

## Garantias explícitas de no-side-effects

O novo workflow:

- não contém `pnpm publish`;
- não contém `npm publish`;
- não contém `docker/login-action`;
- não contém `docker/build-push-action`;
- não contém `gh release`;
- não contém `git tag`;
- não contém `NPM_TOKEN`;
- não contém `NODE_AUTH_TOKEN`;
- não contém `REGISTRY_PAT`;
- não possui trigger `push.tags`.

Ele apenas:

- valida os inputs humanos do gate;
- confirma a presença das superfícies reais no repositório;
- imprime o plano candidato por superfície;
- imprime a referência de rollback declarada;
- valida a estratégia declarada de retry/idempotência.

## Superfícies cobertas pelo gate

### Decisão humana

- `decision_reason`
- `decision_acknowledged`

### Versão e superfície

- `target_version`
- `release_surface`

### Owners e janela

- `technical_owner`
- `operational_owner`
- `operational_window_utc`

### Rollback e retry/idempotência

- `rollback_reference`
- `retry_strategy`
- `idempotency_strategy`

## Comandos executados

```bash
git status --short
sed -n '1,360p' .github/workflows/release.yml
sed -n '1,320p' .github/workflows/release-publish-preflight.yml
grep -R "f0-42-release-publish-gate-decision-after-preflight-green" -n docs/EVIDENCE_INDEX.md ops/evidence/latest 2>/dev/null || true
grep -R "NPM_TOKEN\|NODE_AUTH_TOKEN\|REGISTRY_PAT\|GITHUB_TOKEN\|docker/login-action\|docker/build-push-action\|docker push\|ghcr\|npm publish\|pnpm publish\|gh release\|git tag\|tags:" -n .github/workflows/release.yml .github/workflows/release-publish-preflight.yml 2>/dev/null || true
pnpm check:evidence-index
pnpm check:docs-link-integrity
python3 -c "import yaml; from pathlib import Path; path=Path('.github/workflows/release-activation-rollback-gate.yml'); yaml.safe_load(path.read_text()); print(f'YAML_OK {path}')"
git diff --check
git diff -- .github/workflows/release.yml
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

## Resultados locais

### Investigação inicial

- `release.yml` segue contendo `NODE_AUTH_TOKEN`, `REGISTRY_PAT`, `docker/login-action`, `docker/build-push-action` e triggers por tag;
- `release-publish-preflight.yml` segue sem side effects e só referencia `release.yml` para inspeção;
- F0.42 já estava indexado no `docs/EVIDENCE_INDEX.md`.

### Checks desta etapa

`pnpm check:evidence-index`

```text
{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 169541,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 471
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

`python3 -c "import yaml ..."`

```text
YAML_OK .github/workflows/release-activation-rollback-gate.yml
```

`git diff --check`

```text
sem saída
```

`git diff -- .github/workflows/release.yml`

```text
sem saída
```

`git diff -- .github/workflows/release-publish-preflight.yml`

```text
sem saída
```

`git diff -- .github/workflows/release-node22-readiness.yml`

```text
sem saída
```

`git diff -- .github/workflows/release-node22-validation-build-dry-run.yml`

```text
sem saída
```

`git diff -- package.json`

```text
sem saída
```

`git diff -- pnpm-lock.yaml`

```text
sem saída
```

`git diff -- apps`

```text
sem saída
```

`git diff -- packages`

```text
sem saída
```

`git diff -- scripts`

```text
sem saída
```

`git status --short` após o diff

```text
 M docs/EVIDENCE_INDEX.md
?? .github/workflows/release-activation-rollback-gate.yml
?? ops/evidence/latest/f0-43-release-activation-rollback-gate-no-side-effects-2026-07-11.md
```

## Prova de isolamento

Esta etapa altera somente:

- `.github/workflows/release-activation-rollback-gate.yml`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f0-43-release-activation-rollback-gate-no-side-effects-2026-07-11.md`

Não altera:

- `.github/workflows/release.yml`
- `.github/workflows/release-publish-preflight.yml`
- `.github/workflows/release-node22-readiness.yml`
- `.github/workflows/release-node22-validation-build-dry-run.yml`
- demais workflows existentes
- `package.json`
- `pnpm-lock.yaml`
- `.nvmrc`
- `.node-version`
- apps
- packages
- scripts existentes
- schema Prisma
- migrations
- `ChatAgentLauncher`
- IMOB UI

## Limitações

- o novo gate foi criado, mas ainda não teve run real no GitHub Actions;
- publish real, login em registry, GHCR push, tags/releases e uso real de secrets continuam fora do escopo;
- a Camada B segue não autorizada para ativação real.

## Status
Status: parcial/evidenciado
