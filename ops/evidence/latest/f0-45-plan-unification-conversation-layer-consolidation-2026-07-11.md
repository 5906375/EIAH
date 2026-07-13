# F0.45 — plan unification conversation layer consolidation

## Data
2026-07-11

## Objetivo
Materializar no repositório o plano consolidado `plano_unificacao_EIAH_interativo_atualizado_pos_F0_44_conversacao.html`, incorporando a camada Conversação v2 ao plano pós-F0.44, sem alterar runtime.

## CODEX.md lido antes da execução
Sim.

## Arquivo consolidado presente

- `plano_unificacao_EIAH_interativo_atualizado_pos_F0_44_conversacao.html`
- presente na raiz do repositório
- tamanho observado: `74632` bytes

## Validação dos marcadores obrigatórios

O HTML consolidado contém:

- `atualizado pós-F0.44`
- `F0.44`
- `ReleaseActivationRollbackGate`
- `release.yml`
- `publish`
- `secrets produtivos`
- `id="conversacao"`
- `especificada/parcial`
- `agent-driven`
- `ChatAgentLauncher`

## Conversação preservada como especificada/parcial

A seção `id="conversacao"` está incorporada no plano consolidado e permanece com status `especificada/parcial`.

Ela registra explicitamente que:

- não altera runtime;
- não altera `ChatAgentLauncher`;
- não adiciona regra de comportamento diretamente à UI;
- deve seguir o padrão `agent-driven`;
- não está `DONE`.

## Consolidação pós-F0.44 preservada

O HTML consolidado preserva a trilha documental pós-F0.44 com referência explícita à incorporação das frentes:

- F0.35–F0.44 preservados;
- `ReleaseActivationRollbackGate` verde;
- `release.yml` produtivo intocado;
- publish, secrets produtivos, registry login, Docker/GHCR push e tags/releases ainda bloqueados para decisão futura dedicada.

## Escopo preservado

Esta etapa é estritamente documental.

Não altera:

- runtime;
- `release.yml`;
- workflows;
- `ChatAgentLauncher`;
- engine;
- apps;
- packages;
- scripts;
- schema Prisma;
- migrations;
- contratos.

## Comandos executados

```bash
git status --short
ls -la plano_unificacao_EIAH_interativo_atualizado_pos_F0_44_conversacao.html
grep -n "atualizado pós-F0.44\|F0.44\|ReleaseActivationRollbackGate\|release.yml\|publish\|secrets produtivos\|id=\"conversacao\"\|especificada/parcial\|agent-driven\|ChatAgentLauncher" plano_unificacao_EIAH_interativo_atualizado_pos_F0_44_conversacao.html
python3 -c "from html.parser import HTMLParser; from pathlib import Path; parser=HTMLParser(); parser.feed(Path('plano_unificacao_EIAH_interativo_atualizado_pos_F0_44_conversacao.html').read_text(encoding='utf-8')); print('HTML_PARSE_OK')"
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

`HTML_PARSE_OK`

```text
HTML_PARSE_OK
```

`pnpm check:evidence-index`

```text
{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md"
}
```

`pnpm check:docs-link-integrity`

```text
{
  "ok": true,
  "check": "check:docs-link-integrity"
}
```

`git diff --check`

```text
sem saída
```

## Prova de isolamento

Os diffs de isolamento abaixo permaneceram sem saída:

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

## Status
Status: parcial/evidenciado
