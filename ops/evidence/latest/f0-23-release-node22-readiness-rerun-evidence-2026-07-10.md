# F0.23 — release Node 22 readiness rerun evidence

## Data
2026-07-10

## Objetivo
Registrar evidência operacional real da reexecução do workflow `ReleaseNode22Readiness` após a correção F0.22 de pnpm, antes de qualquer migração do `release.yml` produtivo para Node 22.

## Escopo
Este PR é audit-only/evidencial. Não altera `release.yml`, `release-node22-readiness.yml`, `ci.yml`, `lint.yml`, `critical-dod.yml`, `package.json`, lockfile, scripts, runtime funcional, IMOB/front door, `ChatAgentLauncher`, backend, policy, Prisma, WhatsApp, mobile ou economy.

## Contexto
- F0.21 observou `failure` real por mismatch de pnpm.
- F0.22 corrigiu `PNPM_VERSION` para `10.12.4`.
- F0.23 observa a reexecução real após a correção.

## Execução observada

Fonte da observação:
- rerun real do GitHub Actions reportado nesta etapa pelo usuário

| Item | Valor |
| --- | --- |
| Workflow | `ReleaseNode22Readiness` |
| Run URL | não informado na evidência recebida |
| Run ID | não informado na evidência recebida |
| Branch | `main` |
| Commit SHA | não informado na evidência recebida |
| Data/hora | não informada na evidência recebida |
| Trigger | `workflow_dispatch` |
| Status geral | `failure` |
| Node version | `22` |
| PNPM version | `10.12.4` |
| Publish real | não |
| Docker/GHCR push | não |
| Secrets de release | não |

## Job matrix

| Job | Status | Comandos observados | Observação |
| --- | --- | --- | --- |
| `prepare_readiness` | não informado na evidência recebida | geração determinística de `release_version` esperada pelo workflow | sem detalhe adicional reportado |
| `detect_readiness` | não informado na evidência recebida | detecção de `apps/cli`, `apps/api/Dockerfile.prod` e `apps/workers/action-runner/Dockerfile.prod` esperada pelo workflow | sem detalhe adicional reportado |
| `validate_release_readiness` | fail | `pnpm install --frozen-lockfile` seguido de `postinstall` que aciona `pnpm --filter @eiah/core build` | a falha de pnpm foi superada, mas o build de `@eiah/core` falhou por resolução de `@repo/db` |

## Falha observada

Resumo do comportamento real:
- o mismatch de pnpm documentado em F0.21 foi superado;
- o workflow avançou até `pnpm install --frozen-lockfile`;
- durante `install/postinstall`, houve build de `@eiah/core`;
- `@eiah/core` falhou porque não conseguiu resolver `@repo/db`.

Erro reportado:

```text
Run pnpm install --frozen-lockfile
...
. postinstall$ pnpm --filter @eiah/core build
...
Error: . postinstall: src/audit/guardrailLedger.ts(19,12): error TS2307: Cannot find module '@repo/db' or its corresponding type declarations.
Error: . postinstall: src/catalog/versionedActionRegistry.ts(1,30): error TS2307: Cannot find module '@repo/db' or its corresponding type declarations.
Error: . postinstall: src/integrations/legacyApiConnector.ts(2,30): error TS2307: Cannot find module '@repo/db' or its corresponding type declarations.
Error: . postinstall: src/memory/stores/postgresVectorStore.ts(1,24): error TS2307: Cannot find module '@repo/db' or its corresponding type declarations.
Error: . postinstall: src/policy/TenantPolicyStore.ts(39,41): error TS2307: Cannot find module '@repo/db' or its corresponding type declarations.
Error: . postinstall: src/security/rbac.fail-closed.test.ts(3,30): error TS2307: Cannot find module '@repo/db' or its corresponding type declarations.
Error: . postinstall: src/services/guardrailLedgerStore.ts(2,43): error TS2307: Cannot find module '@repo/db' or its corresponding type declarations.
Error: . postinstall: src/services/ledgerService.ts(2,49): error TS2307: Cannot find module '@repo/db' or its corresponding type declarations.
Error: . postinstall: src/services/planStepStore.ts(1,24): error TS2307: Cannot find module '@repo/db' or its corresponding type declarations.
Error: . postinstall: src/services/planStepStore.ts(2,35): error TS2307: Cannot find module '@repo/db' or its corresponding type declarations.
Error: . postinstall: src/services/reconcileLedgerService.ts(1,57): error TS2307: Cannot find module '@repo/db' or its corresponding type declarations.
Error: . postinstall: src/services/sclLedger.ts(2,57): error TS2307: Cannot find module '@repo/db' or its corresponding type declarations.
Error: . postinstall: src/services/tenantInvoiceService.ts(1,35): error TS2307: Cannot find module '@repo/db' or its corresponding type declarations.
. postinstall:  ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @eiah/core@0.1.0 build
. postinstall: Exit status 2
. postinstall: Failed
 ELIFECYCLE  Command failed with exit code 2.
```

Diagnóstico objetivo:
- a correção F0.22 removeu o erro `ERR_PNPM_BAD_PM_VERSION`;
- o readiness agora falha em uma lacuna posterior da cadeia de install/build;
- o bloqueio atual está em `@eiah/core` durante `postinstall`, por dependência `@repo/db` não resolvida;
- esta etapa não autoriza migração do `release.yml` produtivo.

## Segurança observada
- sem `NPM_TOKEN`
- sem `REGISTRY_PAT`
- sem `NODE_AUTH_TOKEN`
- sem `pnpm publish`
- sem Docker push
- sem GHCR push
- sem `docker/login-action`
- sem alteração em `release.yml`
- sem alteração em package/lockfile/scripts
- sem alteração em IMOB/front door
- sem alteração em `ChatAgentLauncher`

## Resultado e decisão
`readiness falhou; F0.24 deve corrigir nova lacuna antes da migração`

Justificativa:
- houve rerun real após F0.22;
- o problema de pnpm foi corrigido, mas surgiu um novo bloqueio real em `@eiah/core` / `@repo/db`;
- portanto, não existe base para autorizar migração do `release.yml` produtivo nesta etapa.

## Estratégia para F0.24
- F0.24 deve diagnosticar e corrigir a nova falha do readiness relacionada à resolução de `@repo/db` durante `postinstall` / build de `@eiah/core`;
- somente após um run real verde do `ReleaseNode22Readiness` será seguro propor migração controlada do `release.yml`;
- publish real continua restrito a tag/release controlado.

## Prova de isolamento
- `.github/workflows/release.yml` sem alteração
- `.github/workflows/release-node22-readiness.yml` sem alteração
- `.github/workflows/ci.yml` sem alteração
- `.github/workflows/lint.yml` sem alteração
- `.github/workflows/critical-dod.yml` sem alteração
- `package.json` sem alteração
- `pnpm-lock.yaml` sem alteração
- `.nvmrc` sem alteração
- `.node-version` sem alteração
- scripts sem alteração
- IMOB/front door sem alteração
- `ChatAgentLauncher` sem alteração

## Checks executados

| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm check:orphan-tests` | pass | `ok=true`, `orphanCount=50`, `allowlistedOrphanCount=50`, `blockingOrphanCount=0`, `staleAllowlistEntries=[]` |
| `pnpm check:evidence-index` | pass | `ok=true`, `refsChecked=428` |
| `pnpm check:docs-link-integrity` | pass | `ok=true`, `filesChecked=15` |
| `git diff -- .github/workflows/release.yml` | vazio | sem alteração |
| `git diff -- .github/workflows/release-node22-readiness.yml` | vazio | sem alteração |
| `git diff -- .github/workflows/ci.yml` | vazio | sem alteração |
| `git diff -- .github/workflows/lint.yml` | vazio | sem alteração |
| `git diff -- .github/workflows/critical-dod.yml` | vazio | sem alteração |
| `git diff -- package.json` | vazio | sem alteração |
| `git diff -- pnpm-lock.yaml` | vazio | sem alteração |
| `git diff -- .nvmrc` | vazio | sem alteração |
| `git diff -- .node-version` | vazio | sem alteração |
| `git diff -- scripts/checkOrphanTests.ts` | vazio | sem alteração |
| `git diff -- scripts/orphan-tests-allowlist.txt` | vazio | sem alteração |
| `git diff -- apps/web/src/components/agents/ChatAgentLauncher.tsx` | vazio | sem alteração |
| `git diff -- apps/web/src/pages/app/imob/chat.tsx` | vazio | sem alteração |
| `git diff -- apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts` | vazio | sem alteração |
| `git diff --check` | pass | sem saída |

## Lacunas remanescentes

### P0
- `release.yml` produtivo ainda não foi migrado para Node 22.

### P1
- o release path real continua dependente de readiness verde observado.

### P2
- publish NPM/GHCR/Docker continua fora desta etapa.

### P3
- fora do escopo.

### P4
- IMOB/front door fora do escopo e sem alteração.

## Status
Status: parcial/evidenciado
