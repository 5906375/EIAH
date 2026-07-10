# F0.28 — fix apps/cli build rootDir and GuardrailLedger Prisma drift

## Data
2026-07-10

## Objetivo
Corrigir a falha real registrada em F0.27 no build de `apps/cli`, sem alterar workflows nem migrar `release.yml`.

## Escopo
Esta etapa altera somente `apps/cli/tsconfig.json` e `apps/cli/src/index.ts`, além de registrar a evidência correspondente. Não altera workflows, `release.yml`, `package.json`, lockfile, scripts globais, schema Prisma, artefatos gerados de Prisma, IMOB/front door, `ChatAgentLauncher`, mobile, WhatsApp, billing/economy fora do escopo ou policy fora do escopo.

## Contexto
- F0.27 registrou que o rerun real de `ReleaseNode22Readiness` superou a falha de masking em `apps/web`, mas passou a falhar no build de `apps/cli`.
- Os erros observados em F0.27 foram:
  - `TS6059` por `packages/db`, `packages/core` e `packages/contracts` entrarem no programa do CLI fora de `apps/cli/src`;
  - drift de tipos `GuardrailLedger` / Prisma, com uso de `tenantId_actionType_idempotencyKey`, `idempotencyKey` e `usageCount` que não existem no schema gerado atual.

## Investigação executada

Comandos inspecionados:
- `sed -n '1,240p' apps/cli/src/index.ts`
- `find apps/cli -maxdepth 3 -type f | sort`
- `sed -n '1,240p' apps/cli/package.json`
- `sed -n '1,240p' apps/cli/tsconfig.json`
- `sed -n '1,260p' packages/db/prisma/schema.prisma`
- `rg -n "tenantId_actionType_idempotencyKey|idempotencyKey|usageCount|GuardrailLedger" apps/cli packages/db packages/core packages/contracts`
- `rg -n '"@repo/db"|"@eiah/core"|"@repo/contracts"|from "@repo/db"|from "@eiah/core"|from "@repo/contracts"' apps/cli/src apps/cli`
- `sed -n '1,260p' tsconfig.base.json`
- `sed -n '1,240p' packages/db/package.json`
- `sed -n '1,260p' packages/core/package.json`
- `sed -n '546,620p' packages/db/prisma/schema.prisma`
- `pnpm --filter @eiah/cli build`
- `sed -n '1,240p' packages/core/src/services/guardrailLedgerStore.ts`
- `sed -n '1,220p' packages/core/src/audit/guardrailLedger.ts`

Achados objetivos:
- `tsconfig.base.json` mapeia `@repo/db`, `@eiah/core` e `@eiah/contracts` para `packages/*/src`;
- o `apps/cli/tsconfig.json` herdava esses `paths` e ainda fixava `rootDir: "src"`;
- por isso, o build do CLI puxava o grafo TypeScript inteiro de `packages/core/src`, `packages/db/src` e `packages/contracts/src`, disparando `TS6059`;
- o schema atual de `GuardrailLedger` não possui `idempotencyKey`, `usageCount` nem uma chave única `tenantId_actionType_idempotencyKey`;
- o helper canônico `packages/core/src/services/guardrailLedgerStore.ts` já encapsula o shape atual do schema e aceita `idempotencyKey` e `usageCount` apenas como insumos para hash/telemetria, sem escrever campos inexistentes no Prisma.

## Correção aplicada

Arquivos alterados:
- `apps/cli/tsconfig.json`
- `apps/cli/src/index.ts`

Mudanças efetivas:
- `apps/cli/tsconfig.json` agora sobrescreve `paths` para apontar o CLI para:
  - `../../packages/db/dist/*`
  - `../../packages/core/dist/*`
  - `../../packages/contracts/src/*.d.ts`
- `apps/cli/src/index.ts` deixou de importar o barrel amplo `@eiah/core` para os comandos de fila e passou a usar:
  - `@eiah/core/queue/maintenanceQueue`
- o bloco `billing:reconcile` deixou de usar `prisma.guardrailLedger.upsert` com shape obsoleto e passou a usar:
  - `@eiah/core/services/guardrailLedgerStore`
  - `recordGuardrailLedger(...)`
  - `recordGuardrailAudit(...)`
- o código do CLI calcula `criticalHash` localmente e delega ao helper canônico a persistência compatível com o schema atual.

## Justificativa técnica
- o problema de `rootDir` não exigia mexer em workflow; ele vinha da resolução de tipos para `src` dos workspaces no build do CLI;
- apontar o CLI para `dist`/declarações já construídas alinha o consumo local ao contrato de pacote usado no release path;
- usar o helper canônico de GuardrailLedger evita drift com o schema Prisma atual e reaproveita a regra já vigente no core;
- não foi necessário alterar `packages/db/prisma/schema.prisma`, porque a divergência estava no código do CLI, não no schema versionado atual.

## Validação real executada

Comando:
```bash
pnpm --filter @eiah/cli build
```

Resultado:
- `@eiah/cli build`: pass
- os erros `TS6059` deixaram de ocorrer
- os erros de tipos `GuardrailLedgerWhereUniqueInput`, `GuardrailLedgerCreateInput` e `GuardrailLedgerUpdateInput` deixaram de ocorrer

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
- `scripts/checkOrphanTests.ts` sem alteração
- `scripts/orphan-tests-allowlist.txt` sem alteração
- `packages/db/prisma/schema.prisma` sem alteração
- IMOB/front door sem alteração
- `ChatAgentLauncher` sem alteração

## Checks executados

| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm --filter @eiah/cli build` | pass | bloqueio de `rootDir` + drift de GuardrailLedger removido localmente |
| `pnpm check:orphan-tests` | pass | `orphanCount=50`, `allowlistedOrphanCount=50`, `blockingOrphanCount=0`, `staleAllowlistEntries=[]` |
| `pnpm check:evidence-index` | pass | índice consistente após F0.28 |
| `pnpm check:docs-link-integrity` | pass | links documentais consistentes |
| `git diff -- .github/workflows/release.yml .github/workflows/release-node22-readiness.yml .github/workflows/ci.yml .github/workflows/lint.yml .github/workflows/critical-dod.yml package.json pnpm-lock.yaml .nvmrc .node-version scripts/checkOrphanTests.ts scripts/orphan-tests-allowlist.txt apps/web/src/components/agents/ChatAgentLauncher.tsx apps/web/src/pages/app/imob/chat.tsx apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts` | vazio | sem alteração fora do escopo |
| `git diff --check` | pass | sem saída |

## Limites desta etapa
- esta etapa não reexecuta o workflow `ReleaseNode22Readiness` no GitHub Actions;
- portanto, ainda não existe evidência de run real verde do readiness após F0.28;
- esta etapa não autoriza migração do `release.yml`.

## Próximo passo
- reexecutar `ReleaseNode22Readiness` após esta correção;
- se surgir novo bloqueio real, registrar em evidência separada antes de qualquer migração do `release.yml`.

## Status
Status: parcial/evidenciado
