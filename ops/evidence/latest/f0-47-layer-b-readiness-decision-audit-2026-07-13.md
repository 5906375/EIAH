# F0.47 — layer B readiness decision audit

## Data
2026-07-13

## Objetivo
Criar uma auditoria documental de readiness da Camada B para decisão futura de release/publish, partindo da cadeia F0.34–F0.46 já mergeada.

## Pré-condição confirmada

- `main` atualizado após o merge da F0.46
- F0.46 presente no histórico recente de `main`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md` contém a consolidação F0.34–F0.45
- `docs/EVIDENCE_INDEX.md` aponta para a evidência F0.46
- `.github/workflows/release.yml` produtivo permanece intocado

## Escopo desta etapa

Esta etapa é audit-only/documental.

Não:

- executa publish;
- libera release produtivo;
- altera `release.yml`;
- altera workflows;
- altera runtime;
- altera `ChatAgentLauncher`;
- declara Camada B como pronta.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `ops/evidence/latest/f0-46-roadmap-release-gate-chain-consolidation-2026-07-13.md`
- `.github/workflows/release.yml`

## Base auditada

A cadeia F0.34–F0.46 já prova documentalmente que:

- o `ReleaseNode22Readiness` ficou verde em `main`;
- a auditoria de `release.yml` separou claramente readiness de release produtivo;
- a Camada A foi validada por bridge/dry-run e run verde próprio;
- a Camada B ganhou `risk model`, `publish preflight` e `activation/rollback gate`, todos sem side effects;
- `ReleasePublishPreflight` e `ReleaseActivationRollbackGate` já tiveram runs verdes reais;
- o roadmap canônico e o plano consolidado já absorveram a trilha F0.34–F0.45;
- a Conversação foi consolidada documentalmente sem promover runtime.

## Achados da auditoria de readiness

### O que está evidenciado

1. Há evidência suficiente de preparação documental e de gate para a Camada B.
2. A separação entre Camada A e Camada B está clara e consistente no repositório.
3. Os fluxos manuais sem side effects reduzem risco de erro estrutural:
   - `ReleaseNode22ValidationBuildDryRun`
   - `ReleasePublishPreflight`
   - `ReleaseActivationRollbackGate`
4. O repositório já possui trilha explícita para:
   - versão alvo;
   - superfície (`cli`/`api`/`workers`);
   - owners;
   - janela operacional;
   - rollback;
   - retry/idempotência;
   - boundary de `secrets`.

### O que ainda não está evidenciado

1. Não existe evidência de uso real e controlado de `NPM_TOKEN`.
2. Não existe evidência de login real controlado em registry/GHCR com `REGISTRY_PAT`.
3. Não existe evidência de publish CLI real.
4. Não existe evidência de push real de imagem API/worker.
5. Não existe evidência de controle operacional de `tags/releases` em execução real.
6. Não existe evidência de rollback executado em superfície real da Camada B.
7. `release.yml` produtivo continua divergente e intocado por desenho.

## Decisão documental

A decisão correta após F0.46 é:

- a Camada B está **melhor preparada documentalmente**, mas **não está pronta** para decisão executiva de publish real;
- a readiness atual é suficiente para auditoria e preparação de decisão, não para promoção produtiva;
- qualquer passo seguinte que discuta release/publish real ainda exige PR separado, autorização explícita e boundary operacional próprio.

## Classificação conservadora

### Evidenciado

- readiness documental da cadeia F0.34–F0.46;
- separação Camada A/Camada B;
- preflight sem side effects;
- gate reforçado de ativação/rollback sem side effects;
- roadmap/plano/index sincronizados.

### Parcial

- readiness operacional da Camada B para decisão futura;
- maturidade de rollback real;
- governança de secrets em execução produtiva.

### Não autorizado

- publish real;
- registry login;
- Docker/GHCR push;
- tags/releases;
- migração direta de `release.yml`.

## Recomendações para decisão futura

Antes de qualquer decisão sobre publish real, a trilha seguinte ainda precisa continuar separada e conservadora:

1. decidir explicitamente a superfície de promoção inicial (`cli`, `api` ou `workers`);
2. decidir o boundary de secrets e owners operacionais reais;
3. definir janela operacional real;
4. definir rollback executável por superfície;
5. manter `release.yml` intocado até existir evidência própria da nova etapa.

## Comandos executados

```bash
git status --short
git log --oneline -8
grep -n "F0.46\|f0-46-roadmap-release-gate-chain-consolidation\|F0.45\|F0.44\|release.yml\|publish\|secrets\|GHCR\|tags" docs/EVIDENCE_INDEX.md
grep -n "F0.34\|F0.35\|F0.36\|F0.37\|F0.38\|F0.39\|F0.40\|F0.41\|F0.42\|F0.43\|F0.44\|F0.45\|release.yml\|publish\|secrets\|GHCR\|tags" ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md
ls -la ops/evidence/latest/f0-46-roadmap-release-gate-chain-consolidation-2026-07-13.md
ls -la .github/workflows/release.yml
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
  "sizeChars": 172049,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 475
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

Os diffs abaixo devem permanecer sem saída:

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
 M docs/EVIDENCE_INDEX.md
?? ops/evidence/latest/f0-47-layer-b-readiness-decision-audit-2026-07-13.md
```

`git diff --stat`

```text
 docs/EVIDENCE_INDEX.md | 1 +
 1 file changed, 1 insertion(+)
```

## Status
Status: parcial/evidenciado
