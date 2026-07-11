# F0.31 — fix ReleaseNode22Readiness @repo/db Prisma schema path

## Data
2026-07-11

## Objetivo
Corrigir a falha real do `ReleaseNode22Readiness` no step de validação Prisma de `@repo/db`, sem assumir que `/home/runner/work/EIAH/EIAH` é erro e sem introduzir path absoluto/hardcode de runner.

## Contexto
A investigação prévia confirmou:

- o workspace do GitHub Actions em `/home/runner/work/EIAH/EIAH` é compatível com o padrão `/home/runner/work/<repo>/<repo>`;
- não há evidência relevante de hardcode para `/home/runner/work`, `runner/work`, `EIAH/EIAH` ou `../EIAH/EIAH` em `.github`, `scripts`, `package.json`, `packages`, `apps` ou `docs`;
- `packages/db/prisma/schema.prisma` existe no repositório;
- `packages/db/prisma.config.ts` aponta para `./prisma/schema.prisma`;
- o step problemático no workflow chamava `pnpm --filter @repo/db prisma validate --schema packages/db/prisma/schema.prisma`.

## Falha real

O erro de readiness vinha do uso de um path de schema relativo à raiz do monorepo em um comando executado via `pnpm --filter @repo/db`, cujo `cwd` efetivo já é o diretório do pacote `packages/db`.

Resultado: o workflow tentava resolver `packages/db/prisma/schema.prisma` a partir de `packages/db`, produzindo um path incorreto equivalente a `packages/db/packages/db/prisma/schema.prisma`.

## Evidência da investigação

### Comando real no workflow antes da correção

```yaml
pnpm --filter @repo/db prisma validate --schema packages/db/prisma/schema.prisma
pnpm --filter @repo/db prisma format --schema packages/db/prisma/schema.prisma --check
pnpm --filter @repo/db prisma migrate diff \
  --from-schema-datamodel ./packages/db/prisma/schema.prisma \
  --to-schema-datamodel ./packages/db/prisma/schema.prisma
```

### Saída local mostrando o `cwd` efetivo do pacote

```text
> @repo/db@1.0.0 prisma /home/jusall/projects/EIAH_BUILDER/packages/db
> prisma validate --schema packages/db/prisma/schema.prisma
```

Essa saída confirma que o comando já estava rodando dentro de `packages/db`.

## Correção aplicada

| Arquivo | Alteração | Motivo |
| --- | --- | --- |
| `.github/workflows/release-node22-readiness.yml` | trocou `packages/db/prisma/schema.prisma` por `./prisma/schema.prisma` nos comandos `prisma validate`, `prisma format --check` e `prisma migrate diff` | alinhar o schema path ao `cwd` real do pacote `@repo/db` durante `pnpm --filter` |

## Validações executadas

| Comando | Resultado | Observação |
| --- | --- | --- |
| `grep -R "/home/runner/work\|runner/work\|EIAH/EIAH\|../EIAH/EIAH" -n .github scripts package.json packages apps docs 2>/dev/null || true` | pass/investigação | sem evidência relevante de hardcode em código-fonte; apenas matches binários em artefatos `.wasm` de `node_modules` |
| `grep -R "packages/db/prisma/schema.prisma\|prisma/schema.prisma\|prisma validate" -n .github scripts package.json packages/db 2>/dev/null || true` | pass/investigação | localizou o uso problemático no workflow de readiness e a configuração correta em `packages/db/prisma.config.ts` |
| `pnpm --filter @repo/db prisma validate --schema packages/db/prisma/schema.prisma` | fail local | mostrou `cwd` efetivo em `/home/jusall/projects/EIAH_BUILDER/packages/db`; a sessão local falhou antes da validação por `EROFS` em cache Prisma (`~/.cache/prisma`) |
| `pnpm check:evidence-index` | preencher após atualização do índice |  |
| `git diff -- .github/workflows/release.yml` | esperado vazio | prova de isolamento |
| `git diff -- .github/workflows/ci.yml` | esperado vazio | prova de isolamento |
| `git diff -- .github/workflows/lint.yml` | esperado vazio | prova de isolamento |
| `git diff -- .github/workflows/critical-dod.yml` | esperado vazio | prova de isolamento |

## Limitação local observada

Ao tentar reexecutar comandos Prisma localmente, a sessão encontrou bloqueio de sandbox por escrita em cache:

```text
Error: EROFS: read-only file system, utime '/home/jusall/.cache/prisma/.../schema-engine'
```

Ao tentar redirecionar cache para `/tmp`, houve bloqueio de rede do `corepack` para baixar `pnpm`:

```text
Error: getaddrinfo EAI_AGAIN registry.npmjs.org
```

Essas limitações impedem validar localmente, nesta sessão, o sucesso operacional completo do trio `validate/format/migrate diff` após a correção, mas não alteram a causa raiz identificada: o path do schema estava incorreto para o `cwd` real do pacote.

## Prova de isolamento

Sem alteração em:

- `.github/workflows/release.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/lint.yml`
- `.github/workflows/critical-dod.yml`
- `packages/db/prisma/schema.prisma`
- `packages/db/package.json`
- `package.json`
- `pnpm-lock.yaml`
- `apps/api`
- `apps/cli`
- `apps/web`
- `packages/core`
- `packages/contracts`
- `scripts/checkP1CriticalChain.ts`
- `apps/web/src/components/agents/ChatAgentLauncher.tsx`

## Resultado e decisão

A correção mínima de F0.31 ajusta o workflow `ReleaseNode22Readiness` para usar o schema path relativo correto do pacote `@repo/db`.

Ainda é obrigatório observar um novo run real verde do workflow em `main` antes de qualquer migração de `.github/workflows/release.yml`.

## Status
Status: parcial/evidenciado
