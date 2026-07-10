# F0.27 — record ReleaseNode22Readiness apps/cli build failure evidence

## Data
2026-07-10

## Objetivo
Registrar a falha real do rerun do workflow `ReleaseNode22Readiness` após F0.26, sem corrigir o workflow, sem alterar `release.yml` e sem tocar em `apps/cli`, `packages/core` ou `packages/db` nesta etapa.

## Escopo
Este PR é audit-only/evidencial. Não altera `.github/workflows/release-node22-readiness.yml`, `.github/workflows/release.yml`, `apps/cli`, `packages/core`, `packages/db`, `package.json`, lockfile, scripts globais, IMOB/front door, `ChatAgentLauncher`, backend funcional amplo, Prisma, mobile, billing/economy ou policy.

## Contexto
- F0.24 corrigiu a ordem de `install/build` do readiness.
- F0.25 registrou a falha de masking em `packages/utils` / `apps/web`.
- F0.26 corrigiu o export de masking em `packages/utils/src`, com build local de `@eiah/web` passando novamente.
- F0.27 observa o novo rerun real após essa correção.

## Execução observada

Fonte da observação:
- rerun real do GitHub Actions reportado nesta etapa pelo usuário

| Item | Valor |
| --- | --- |
| Workflow | `ReleaseNode22Readiness` |
| Arquivo | `.github/workflows/release-node22-readiness.yml` |
| Trigger | `workflow_dispatch` |
| Status geral | `failure` |
| Publish real | não |
| Docker/GHCR push | não |
| Secrets de release | não |

## Resultado observado

Achados objetivos:
- a falha de masking em `packages/utils` / `apps/web`, documentada em F0.25 e corrigida em F0.26, foi superada;
- o readiness avançou além do bloco de web build;
- o novo bloqueio real apareceu no build de `apps/cli`.

Causas observadas:
- `TS6059`: arquivos de `packages/db`, `packages/core` e `packages/contracts` entram no programa de `apps/cli`, mas estão fora de `rootDir apps/cli/src`;
- erros de tipos `GuardrailLedger`/Prisma: `tenantId_actionType_idempotencyKey`, `idempotencyKey` e `usageCount` não existem nos tipos gerados usados pelo `apps/cli`.

Resumo do bloqueio:
```text
apps/cli build failed
TS6059: files from packages/db, packages/core and packages/contracts are in the program but outside rootDir apps/cli/src
GuardrailLedger/Prisma type errors: tenantId_actionType_idempotencyKey, idempotencyKey and usageCount do not exist in the generated types used by apps/cli
```

## Diagnóstico objetivo
- F0.26 cumpriu seu objetivo específico: o rerun não falhou mais no build web por `./masking`;
- o novo bloqueio é posterior e distinto do de F0.25;
- o readiness continua sem run verde observado;
- portanto, ainda não existe base para autorizar migração do `release.yml` produtivo.

## Decisão
`F0.28 deve investigar e corrigir apps/cli build antes de qualquer migração do release.yml produtivo`

Justificativa:
- o bloqueio atual está no build de `apps/cli`;
- a falha combina problema de fronteira de programa TypeScript (`rootDir`) com drift de tipos gerados usados pelo CLI;
- sem resolver esse bloco, o `ReleaseNode22Readiness` continua sem evidência verde real.

## Segurança observada
- sem alteração em `.github/workflows/release-node22-readiness.yml`
- sem alteração em `.github/workflows/release.yml`
- sem alteração em `apps/cli`
- sem alteração em `packages/core`
- sem alteração em `packages/db`
- sem `NPM_TOKEN`
- sem `REGISTRY_PAT`
- sem `NODE_AUTH_TOKEN`
- sem `pnpm publish`
- sem Docker push
- sem GHCR push
- sem `docker/login-action`
- sem alteração em IMOB/front door
- sem alteração em `ChatAgentLauncher`

## Prova de isolamento
- `.github/workflows/release-node22-readiness.yml` sem alteração nesta etapa
- `.github/workflows/release.yml` sem alteração
- `apps/cli` sem alteração
- `packages/core` sem alteração
- `packages/db` sem alteração
- `package.json` sem alteração
- `pnpm-lock.yaml` sem alteração
- scripts globais sem alteração
- IMOB/front door sem alteração
- `ChatAgentLauncher` sem alteração

## Checks executados

| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm check:orphan-tests` | pass | `orphanCount=50`, `allowlistedOrphanCount=50`, `blockingOrphanCount=0`, `staleAllowlistEntries=[]` |
| `pnpm check:evidence-index` | pass | índice consistente após F0.27 |
| `pnpm check:docs-link-integrity` | pass | links documentais consistentes |
| `git diff -- .github/workflows/release-node22-readiness.yml .github/workflows/release.yml apps/cli packages/core packages/db` | vazio | sem alteração fora do escopo desta etapa |
| `git diff --check` | pass | sem saída |

## Limites desta etapa
- esta etapa não corrige o build de `apps/cli`;
- esta etapa não altera workflows;
- esta etapa não autoriza migração do `release.yml`;
- esta etapa não declara readiness aprovado.

## Próximo passo
- F0.28 deve investigar `apps/cli` em duas frentes:
  - enquadramento TypeScript do programa e `rootDir`;
  - compatibilidade entre os tipos gerados usados pelo CLI e os campos `GuardrailLedger`/Prisma esperados pelo código.

## Status
Status: parcial/evidenciado
