# F0.40 — release publish preflight without side effects

## Data
2026-07-11

## Objetivo
Implementar um preflight manual da Camada B do release path, validando metadados, versão, artefatos esperados, permissões mínimas e comandos candidatos de publish sem executar publish real.

## Escopo

Esta etapa não:

- altera `release.yml`;
- usa secrets produtivos;
- executa `npm publish` ou `pnpm publish`;
- faz login em registry;
- faz Docker/GHCR push;
- cria tags/releases;
- declara o release path fechado.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `.github/workflows/release.yml`
- `.github/workflows/release-node22-validation-build-dry-run.yml`
- `ops/evidence/latest/f0-39-release-publish-layer-risk-model-2026-07-11.md`

## Implementação

Workflow criado:

- `.github/workflows/release-publish-preflight.yml`

Características do workflow:

- trigger manual via `workflow_dispatch`;
- baseline alinhada à Camada A com Node `22` e pnpm `10.12.4`;
- valida `release_version` com regex semver-like;
- detecta superfícies reais (`apps/cli`, `apps/api`, `apps/workers/action-runner`);
- valida existência de `apps/cli/package.json`, `apps/api/Dockerfile.prod` e `apps/workers/action-runner/Dockerfile.prod`;
- confirma que `release.yml` ainda contém as superfícies reais de permissão/publish (`id-token: write`, `packages: write`, `NPM_TOKEN`, `REGISTRY_PAT`);
- renderiza apenas comandos candidatos de publish e refs de imagem;
- se autoaudita contra padrões proibidos de side effect.

## Garantias explícitas de no-side-effects

O novo workflow:

- não contém `pnpm publish`;
- não contém `npm publish`;
- não contém `docker/login-action`;
- não contém `docker/build-push-action`;
- não contém `gh release`;
- não contém `git tag`;
- não possui trigger `push.tags`.

Ele apenas imprime:

- comando candidato de version bump do CLI;
- comando candidato de publish do CLI;
- refs candidatas de imagens GHCR para API e workers.

## Superfícies validadas

### Metadados e versão

- `release_version` resolvida por input opcional ou fallback `0.0.0-publish-preflight`
- validação semver-like no próprio workflow

### Artefatos esperados

- `apps/cli/package.json`
- `apps/api/Dockerfile.prod`
- `apps/workers/action-runner/Dockerfile.prod`

### Permissões mínimas candidatas

Inspecionadas em `.github/workflows/release.yml`:

- `id-token: write`
- `packages: write`
- `NPM_TOKEN`
- `REGISTRY_PAT`

## Comandos executados

```bash
git status --short
sed -n '1,360p' .github/workflows/release.yml
sed -n '1,260p' .github/workflows/release-node22-validation-build-dry-run.yml
grep -R "f0-39-release-publish-layer-risk-model" -n docs/EVIDENCE_INDEX.md ops/evidence/latest 2>/dev/null || true
grep -R "NPM_TOKEN\|NODE_AUTH_TOKEN\|REGISTRY_PAT\|GITHUB_TOKEN\|docker/login-action\|docker/build-push-action\|docker push\|ghcr\|npm publish\|pnpm publish\|gh release\|git tag\|tags:" -n .github/workflows/release.yml .github/workflows/release-node22-validation-build-dry-run.yml 2>/dev/null || true
pnpm check:evidence-index
pnpm check:docs-link-integrity
python3 - <<'PY'
import yaml
from pathlib import Path
for path in [
    Path(".github/workflows/release-publish-preflight.yml"),
]:
    yaml.safe_load(path.read_text())
    print(f"YAML_OK {path}")
PY
git diff --check
git diff -- .github/workflows/release.yml
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

- `git status --short` antes do diff: sem alterações
- F0.39 já estava indexado no `docs/EVIDENCE_INDEX.md`
- `release.yml` segue contendo as superfícies reais de publish da Camada B
- `release-node22-validation-build-dry-run.yml` segue sem publish, sem secrets e sem Docker push

### Checks desta etapa

`pnpm check:evidence-index`

```text
{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 167441,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 467
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
YAML_OK .github/workflows/release-publish-preflight.yml
```

`git diff --check`

```text
sem saída
```

`git diff -- .github/workflows/release.yml`

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
?? .github/workflows/release-publish-preflight.yml
?? ops/evidence/latest/f0-40-release-publish-preflight-no-side-effects-2026-07-11.md
```

## Prova de isolamento

Esta etapa altera somente:

- `.github/workflows/release-publish-preflight.yml`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f0-40-release-publish-preflight-no-side-effects-2026-07-11.md`

Não altera:

- `.github/workflows/release.yml`
- `.github/workflows/release-node22-readiness.yml`
- `.github/workflows/release-node22-validation-build-dry-run.yml`
- demais workflows existentes
- `package.json`
- `pnpm-lock.yaml`
- apps
- packages
- scripts existentes
- schema Prisma
- migrations
- `ChatAgentLauncher`
- IMOB UI

## Limitações

- o workflow de preflight foi criado, mas não executado em GitHub Actions nesta etapa;
- publish real, login em registry, GHCR push, tags/releases e secrets permanecem fora do escopo;
- a Camada B segue não autorizada para ativação.

## Status
Status: parcial/evidenciado
