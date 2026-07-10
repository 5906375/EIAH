# F0.15 — core_tests DATABASE_URL requirement

## Data
2026-07-09

## Objetivo
Classificar e corrigir ou isolar a falha estrutural de `core_tests` causada por `DATABASE_URL` ausente.

## Contexto
- F0.13 provou que a falha ocorria igualmente em Node 20 e Node 22.
- F0.14 migrou `build_validate` para Node 22.
- A falha remanescente era estrutural de teste/ambiente, não regressão de runtime Node.

## Escopo
Arquivos alterados nesta etapa:
- `.github/workflows/ci.yml`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f0-15-core-tests-database-url-requirement-2026-07-09.md`

Fora do escopo:
- workflows residuais (`lint.yml`, `release.yml`, `critical-dod.yml`)
- runtime Node
- `.nvmrc`
- `.node-version`
- `package.json`
- `pnpm-lock.yaml`
- IMOB/front door
- `ChatAgentLauncher`

## Investigação

| Item investigado | Resultado | Evidência |
| --- | --- | --- |
| Onde `core_tests` é chamado | No job `build_validate`, step `Run Tests`, via `find packages/core/src -name '*.test.ts' -type f \| xargs -0 node --test --import tsx` | `.github/workflows/ci.yml` |
| Como `highGlobalCoverage.e2e.test.ts` entra na suíte | O `find ... -name '*.test.ts'` inclui `packages/core/src/actions/__tests__/highGlobalCoverage.e2e.test.ts` | `.github/workflows/ci.yml`, `find packages/core/src -name '*.test.ts'` |
| Dependência de `DATABASE_URL` | A falha sem `TSX_TSCONFIG_PATH` vem do import real de `@repo/db` para `packages/db/dist/client.js`, que exige `DATABASE_URL` | execução real `node --test --import tsx packages/core/src/actions/__tests__/highGlobalCoverage.e2e.test.ts` |
| Dependência de Prisma/PrismaPg/pg | O código de produção usa `@repo/db`, mas `packages/core/tsconfig.test.json` já redireciona `@repo/db` para `src/__mocks__/repo-db.ts` | `packages/core/tsconfig.test.json`, `packages/core/src/__mocks__/repo-db.ts` |
| Outros testes DB na suíte | Sem o alias de teste, também falharam `packages/core/src/memory/__tests__/memory.jobs.test.ts`, `packages/core/src/memory/__tests__/postgresVectorStore.test.ts` e `packages/core/src/security/rbac.fail-closed.test.ts` | execução real da suíte `packages/core` sem `TSX_TSCONFIG_PATH` |
| Tipo do teste | `highGlobalCoverage.e2e.test.ts`: `e2e-db` no nome, mas o requisito de DB real no `core_tests` atual era acidental, por ausência do alias de mock já previsto para testes de `packages/core` | arquivo de teste + resultado com/sem `TSX_TSCONFIG_PATH` |

## Classificação
Classificação: `teste deve permanecer em core_tests com ambiente de teste correto, sem provisionar DB real`

Justificativa:
- `packages/core/tsconfig.test.json` já define o contrato de teste de `packages/core`, mapeando `@repo/db` para `src/__mocks__/repo-db.ts`.
- O problema não era ausência legítima de Postgres para um teste que exigia DB real; o problema era que o step de CI ignorava a configuração de teste do pacote.
- Com `TSX_TSCONFIG_PATH=packages/core/tsconfig.test.json`, a suíte inteira de `packages/core` fecha em verde, incluindo:
  - `highGlobalCoverage.e2e.test.ts`
  - `memory.jobs.test.ts`
  - `postgresVectorStore.test.ts`
  - `rbac.fail-closed.test.ts`
- Portanto, não foi necessário:
  - fake `DATABASE_URL`;
  - skip silencioso;
  - remoção de teste;
  - Postgres service no `build_validate`.

## Patch aplicado
Patch mínimo aplicado em `.github/workflows/ci.yml`:
- no step `Run Tests` do `build_validate`, foi adicionado:

```yaml
TSX_TSCONFIG_PATH: packages/core/tsconfig.test.json
```

Efeito:
- `tsx` passa a resolver `@repo/db` para `packages/core/src/__mocks__/repo-db.ts` durante a suíte `packages/core`;
- `core_tests` deixa de tentar inicializar `packages/db/dist/client.js`;
- a suíte continua rodando os mesmos arquivos, sem reduzir cobertura.

## Tratamento de segurança
Confirmado:
- sem `DATABASE_URL` fake
- sem skip silencioso
- sem remoção de teste crítico sem evidência
- sem alteração de runtime Node
- sem alteração de workflows residuais
- sem alteração de IMOB/front door
- sem alteração de `ChatAgentLauncher`

## Checks executados

| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm check:orphan-tests` | pass | `ok=true`, `orphanCount=50`, `allowlistedOrphanCount=50`, `blockingOrphanCount=0`, `staleAllowlistEntries=[]` |
| `pnpm check:evidence-index` | pass | `ok=true`, `refsChecked=415` |
| `pnpm check:docs-link-integrity` | pass | `ok=true`, `filesChecked=15` |
| `node --test --import tsx packages/core/src/actions/__tests__/highGlobalCoverage.e2e.test.ts` | fail | falha real por `DATABASE_URL` ausente sem `TSX_TSCONFIG_PATH` |
| `TSX_TSCONFIG_PATH=packages/core/tsconfig.test.json node --test --import tsx packages/core/src/actions/__tests__/highGlobalCoverage.e2e.test.ts` | pass | prova de que o contrato de teste correto elimina a dependência acidental de DB real |
| `TSX_TSCONFIG_PATH=packages/core/tsconfig.test.json ... find packages/core/src -name '*.test.ts' ... xargs -0 node --test --import tsx` | pass | `19 pass / 0 fail` para a suíte `packages/core` |
| `git diff -- .github/workflows/lint.yml` | vazio | sem alteração |
| `git diff -- .github/workflows/release.yml` | vazio | sem alteração |
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
- O problema estrutural específico de `core_tests` por `DATABASE_URL` ausente fica classificado e corrigido no `build_validate`.

### P1
- Nenhuma mudança de execução crítica/HIGH fora da correção de ambiente de teste.

### P2
- `highGlobalCoverage.e2e.test.ts` permanece classificado como E2E do core, mas no contexto desta suíte ele usa o mock oficial de `@repo/db` já previsto pelo pacote.
- Se houver necessidade futura de um E2E com Postgres real para o core, isso deve nascer em suíte DB explícita separada, não por quebra acidental do alias de testes.

### P3
- Fora do escopo.

### P4
- IMOB/front door fora do escopo e sem alteração.

## Status
Status: parcial/evidenciado
