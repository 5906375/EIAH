# F0.32 — fix Prisma schema formatting drift in ReleaseNode22Readiness

## Data
2026-07-11

## Objetivo
Corrigir a nova falha real observada no `ReleaseNode22Readiness` após F0.31, agora concentrada no step `prisma format --check` de `@repo/db`.

## Contexto

O run pós-F0.31 confirmou que o path do schema foi corrigido:

```text
pnpm --filter @repo/db prisma validate --schema ./prisma/schema.prisma
Prisma schema loaded from prisma/schema.prisma.
The schema at prisma/schema.prisma is valid 🚀
```

Com isso, o bloqueio remanescente saiu do path e passou a ser o drift de formatação do arquivo `packages/db/prisma/schema.prisma`.

## Falha real

O workflow de readiness manteve o gate:

```yaml
pnpm --filter @repo/db prisma format --schema ./prisma/schema.prisma --check
```

Após a correção de F0.31, esse gate passou a alcançar o schema correto e expôs drift real de formatação no arquivo rastreado.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `.github/workflows/release-node22-readiness.yml`
- `packages/db/package.json`
- `packages/db/prisma.config.ts`
- `packages/db/prisma/schema.prisma`

## Correção aplicada

| Arquivo | Alteração | Motivo |
| --- | --- | --- |
| `packages/db/prisma/schema.prisma` | reaplicado o output canônico do formatter do Prisma ao arquivo inteiro | eliminar o drift real agora alcançado por `prisma format --check` no workflow |

## Evidência objetiva do drift

Para evitar depender do binário `prisma` local, foi usado diretamente o `prisma_schema_build_bg.wasm` já presente em `node_modules` para comparar o conteúdo atual do schema com o output canônico do formatter.

Saída real antes da correção:

```text
HAS_DIFF
FIRST_DIFF_LINE 12
```

Trecho real do diff observado:

```diff
@@ -9,7 +9,6 @@ datasource db {
   provider = "postgresql"
 }

-
 // ========================================
```

Além da linha em branco extra, o formatter reaplicou o alinhamento canônico de múltiplos blocos `model`.

## Validações executadas

| Comando | Resultado | Observação |
| --- | --- | --- |
| `node /tmp/prisma_format_check.js` antes da correção | pass | retornou `HAS_DIFF` e `FIRST_DIFF_LINE 12`, provando drift real |
| `node /tmp/prisma_format_check.js` depois da correção | pass | retornou `NO_DIFF`, provando idempotência do formatter |
| `git diff -- packages/db/prisma/schema.prisma` | pass | diff limitado ao reflow de formatação do schema |
| `pnpm check:evidence-index` | pass | `ok: true`, `refsChecked: 453` após indexar F0.32 e remover wildcard documental inválido |
| `pnpm check:docs-link-integrity` | pass | `ok: true`, `filesChecked: 15` |

## Limitações locais

Tentativas de executar o binário local do Prisma diretamente continuaram bloqueadas por permissão de escrita em engines já instaladas:

```text
Error: Can't write to /home/jusall/projects/EIAH_BUILDER/node_modules/.pnpm/@prisma+engines@7.2.0/node_modules/@prisma/engines please make sure you install "prisma" with the right permissions.
```

Por isso, nesta sessão, a prova local do formatter foi feita via `prisma_schema_build_bg.wasm`, que valida exatamente o output canônico de formatação sem alterar runtime nem workflow.

## Prova de isolamento

Sem alteração em:

- `.github/workflows/release-node22-readiness.yml`
- `.github/workflows/release.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/lint.yml`
- `.github/workflows/critical-dod.yml`
- `packages/db/package.json`
- `packages/db/prisma.config.ts`
- `package.json`
- `pnpm-lock.yaml`
- `apps/api`
- `apps/cli`
- `apps/web`
- `packages/core`
- `packages/contracts`
- `apps/web/src/components/agents/ChatAgentLauncher.tsx`

## Resultado e decisão

F0.32 corrige apenas o drift real de formatação do schema Prisma que passou a ser verificado corretamente depois de F0.31. O workflow `ReleaseNode22Readiness` ainda precisa de novo run real em `main` para evidenciar o avanço além desse gate.

## Status
Status: parcial/evidenciado
