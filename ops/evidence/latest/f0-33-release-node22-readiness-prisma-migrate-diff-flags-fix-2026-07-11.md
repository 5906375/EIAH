# F0.33 — fix Prisma migrate diff flags in ReleaseNode22Readiness

## Data
2026-07-11

## Objetivo
Corrigir a nova falha real observada no workflow `ReleaseNode22Readiness` após F0.32, agora concentrada nas flags removidas do comando `prisma migrate diff`.

## Contexto

O run pós-F0.32 confirmou progresso no step de validação Prisma:

```text
pnpm --filter @repo/db prisma validate --schema ./prisma/schema.prisma
Prisma schema loaded from prisma/schema.prisma.
The schema at prisma/schema.prisma is valid 🚀
```

```text
pnpm --filter @repo/db prisma format --schema ./prisma/schema.prisma --check
```

Com isso, o bloqueio remanescente passou a ser o `migrate diff`.

## Falha real

Erro observado no workflow:

```text
> @repo/db@1.0.0 prisma /home/runner/work/EIAH/EIAH/packages/db
> prisma migrate diff --from-schema-datamodel ./prisma/schema.prisma --to-schema-datamodel ./prisma/schema.prisma

Loaded Prisma config from prisma.config.ts.

Error:
`--from-schema-datamodel` was removed. Please use `--[from/to]-schema` instead.
```

## Causa raiz

O workflow ainda usava flags removidas do Prisma CLI:

- `--from-schema-datamodel`
- `--to-schema-datamodel`

No Prisma 7.2.0 instalado no repositório, o parser do comando `migrate diff` já marca essas flags como removidas e exige:

- `--from-schema`
- `--to-schema`

## Correção aplicada

| Arquivo | Alteração | Motivo |
| --- | --- | --- |
| `.github/workflows/release-node22-readiness.yml` | trocou `--from-schema-datamodel` / `--to-schema-datamodel` por `--from-schema` / `--to-schema` no step `Validate Prisma schema` | alinhar o workflow ao contrato real do Prisma 7.2.0 já instalado no monorepo |

## Evidência local adicional

Leitura direta do `prisma/build/index.js` instalado em `node_modules`:

```text
case"--from-schema-datamodel":case"--to-schema-datamodel":return`...was removed. Please use \`--[from/to]-schema\` instead.`
```

Também foi confirmado no parser local que `migrate diff` aceita `--from-schema` e `--to-schema` como opções válidas.

## Validações executadas

| Comando | Resultado | Observação |
| --- | --- | --- |
| `sed -n '1,120p' .github/workflows/release-node22-readiness.yml` | pass | confirmou o uso antigo de `--from-schema-datamodel` / `--to-schema-datamodel` antes da correção |
| `rg -n --fixed-strings "from-schema-datamodel" node_modules/.pnpm/prisma@7.2.0_*/node_modules/prisma/build` | pass | localizou no Prisma 7.2.0 a mensagem de remoção das flags antigas e a orientação para `--[from/to]-schema` |
| `packages/db/node_modules/.bin/prisma migrate diff --from-schema ./packages/db/prisma/schema.prisma --to-schema ./packages/db/prisma/schema.prisma` | fail local por ambiente | bloqueado por permissão local de cópia/utime do `schema-engine`, não por rejeição sintática das novas flags |
| `pnpm check:evidence-index` | pass | `ok: true`, `refsChecked: 455` após indexar F0.33 e remover wildcard documental inválido |

## Limitação local observada

Ao tentar executar o `prisma migrate diff` localmente, a sessão encontrou bloqueio de filesystem nas engines do Prisma:

```text
Error: EACCES: permission denied, copyfile '/home/jusall/.cache/prisma/.../schema-engine' -> '/home/jusall/projects/EIAH_BUILDER/node_modules/.pnpm/@prisma+engines@7.2.0/node_modules/@prisma/engines/schema-engine-...tmp...'
```

Antes disso, também houve bloqueio por cache read-only:

```text
Error: EROFS: read-only file system, utime '/home/jusall/.cache/prisma/.../schema-engine'
```

Essas limitações impedem a prova de execução local completa do `migrate diff`, mas não alteram a causa raiz nem a correção necessária: o workflow estava usando flags removidas pelo Prisma 7.2.0.

## Prova de isolamento

Sem alteração em:

- `.github/workflows/release.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/lint.yml`
- `.github/workflows/critical-dod.yml`
- `package.json`
- `pnpm-lock.yaml`
- `packages/db/prisma/schema.prisma`
- `packages/db/prisma.config.ts`
- `packages/db/package.json`
- `apps/api`
- `apps/cli`
- `apps/web`
- `packages/core`
- `packages/contracts`
- `apps/web/src/components/agents/ChatAgentLauncher.tsx`

## Resultado e decisão

F0.33 corrige o bloqueio remanescente do `ReleaseNode22Readiness` no `prisma migrate diff`, trocando as flags removidas pelas flags suportadas na versão real do Prisma instalada no repositório.

Ainda é obrigatório observar um novo run real verde do workflow em `main` antes de qualquer migração de `.github/workflows/release.yml`.

## Status
Status: parcial/evidenciado
