# Evidência local — truthful evidence no relatório J-360

Data: 2026-08-08

Classificação: **MITIGADO LOCALMENTE**

Branch: `fix/settlement-matrix-honesty`
HEAD inicial: `35749f1e975a712bc894f1bbd4775aabb1e1bc29`

## Escopo provado

- `sourceStatus` possui os estados `provided`, `not_provided` e `unknown`;
- payload legado sem o campo é lido como `unknown`, sem inferência baseada em
  `document`;
- o `unknown` derivado do parse é não enumerável e não aparece em
  `JSON.stringify`, impedindo write-back acidental;
- Landing, PDF, seus wrappers finos e o bloco HTML do `RunViewer` distinguem
  `unknown` de `not_provided`;
- o gate varre superfícies canônicas de runtime em `apps/**/src/**` e
  `packages/**/src/**`, respeitando as exclusões de testes, fixtures e outputs;
- o literal exato `Documento jurídico anexado` não existe nas fontes runtime
  canônicas verificadas.

O gate cobre somente esse literal exato. Concatenações, templates ou variantes
textuais não são detectados.

## Comandos e resultados

### Baseline

```text
git branch --show-current
git rev-parse HEAD
git status --short
git diff --stat
git diff --cached --stat
```

Resultado: branch e HEAD registrados acima; sete arquivos modificados da
mitigação R1 já existiam no worktree. Quatro arquivos vazios não rastreados
(`RBAC.`, `destrutivo`, `discovery`, `para`) e o diagnóstico LEGAL pré-existente
foram preservados fora do commit desta tarefa.

### Introdução histórica

```text
git log -S"Documento jurídico anexado" --oneline --reverse --all
```

Resultado:

```text
db375ec feat: add J360 and MKT governed report orchestration (#137)
```

### Testes e gate focados

```text
pnpm check:legal-truthful-evidence
```

Resultado final:

```text
API/interpreter + worker + core renderer + scanner: pass 4, fail 0
RunViewer renderer: pass 1, fail 0
scanner CLI: ok=true, violations=0
```

O teste do scanner cria um `tmpdir` controlado, grava uma violação em
`apps/demo/src/violator.ts:2` e confirma a localização. Um segundo teste executa
o scanner contra a raiz real e exige zero violações.

### Tentativa de build local amplo do core

```text
pnpm --filter @eiah/core build
```

Resultado: falhou antes do build do core porque `@repo/db`/`packages/db/dist`
não estava disponível. Este é o blocker pré-existente de infraestrutura
explicitamente fora do escopo. Nenhuma correção foi aplicada em `packages/db/**`.

O primeiro run do gate também expôs que o teste da API tentava resolver o
`dist` ausente de `@eiah/core`. O gate foi então ajustado para usar o TypeScript
versionado por meio de `tsconfig.legal-truthful-evidence.json`, em conformidade
com a regra de fonte canônica para checks críticos. O run seguinte ficou verde.

## CI

O gate foi adicionado como step bloqueante `Check LEGAL truthful evidence
invariant` no job existente `build_validate` de `.github/workflows/ci.yml`.
Não houve push e, portanto, não existe run de CI remoto nesta rodada.

## Diff e limites

O diff final e o `git status --short` são registrados novamente na saída da
tarefa após criação do commit local. `docs/EVIDENCE_INDEX.md` não foi alterado,
conforme restrição explícita da rodada.

Permanecem fora de escopo e abertos: R2, R3, R4 e R5. A limitação TS6059 de
`apps/api` permanece a já documentada em `docs/EVIDENCE_INDEX.md:852`.
