# F0.30 — ReleaseNode22Readiness apps/api IMOB build fix

## Data
2026-07-10

## Objetivo
Corrigir a nova falha real de `apps/api build` observada no rerun do `ReleaseNode22Readiness` após F0.29.

## Contexto
O run pós-F0.29 confirmou que `packages/contracts`, `packages/db`, `packages/core`, `apps/cli` e `apps/web` avançaram, mas `apps/api build` falhou.

## Falha observada
Registrar:
- `apps/api/src/routes/imob.ts`: `.filter` chamado sobre `Promise`;
- parâmetros `item` com `implicit any` derivados da cadeia sobre `Promise`;
- `apps/api/src/services/imob/imobArtifactCapabilities.ts`: `string | null` atribuído onde o tipo esperado era `string | undefined`.

## Causa raiz

### apps/api/src/routes/imob.ts
A cadeia aplicava `filter`/`slice` sobre resultado ainda tipado como `Promise`, porque `Promise.all` não havia sido materializado em variável resolvida antes dos filtros.

### apps/api/src/services/imob/imobArtifactCapabilities.ts
Campos opcionais usados por `checkScopePermission` esperavam `string | undefined`, mas a implementação retornava `null` via fallback `?? null`.

## Correção aplicada

| Arquivo | Alteração | Motivo |
| --- | --- | --- |
| `apps/api/src/routes/imob.ts` | separou `await Promise.all(...)` em `runItems` e aplicou filtros depois do `await` | remover `filter` sobre `Promise` e `implicit any` |
| `apps/api/src/services/imob/imobArtifactCapabilities.ts` | trocou fallback `?? null` por `?? undefined` em `userId` e `tokenId` | alinhar implementação ao tipo `string | undefined` |

## Validações executadas

| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm --filter @eiah/api build` | pass | build local da API passou com exit code `0` |
| `pnpm build` | fail | falhou em `packages/db build` com `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` em `@repo/db@1.0.0 build`; bloqueio fora do escopo de F0.30 |
| `pnpm check:orphan-tests` | pass | `blockingOrphanCount: 0`; `orphanCount: 50`; todos allowlisted |
| `pnpm check:evidence-index` | fail antes do ajuste do índice | falhou com `missingRefs: ["apps/api/src/services/imob/crm/*","docs/*"]` em `docs/EVIDENCE_INDEX.md`, referências inválidas pré-existentes no próprio arquivo em escopo |
| `pnpm check:docs-link-integrity` | pass | `ok: true`, `filesChecked: 15` |
| `git diff --check` | pass | sem saída; nenhum erro de whitespace/apply |

## Saída real resumida

### `pnpm --filter @eiah/api build`

```text
> @eiah/api@ prebuild /home/jusall/projects/EIAH_BUILDER/apps/api
> bash ../../scripts/prebuild-check.sh

> @eiah/api@ build /home/jusall/projects/EIAH_BUILDER/apps/api
> node ./node_modules/typescript/lib/tsc.js -p tsconfig.build.json
```

Resultado observado: processo encerrou com exit code `0`.

### `pnpm build`

```text
> eiah-builder@ build /home/jusall/projects/EIAH_BUILDER
> pnpm -r --filter "./packages/*" run --if-present build && pnpm -r --filter "./apps/*" run build

Scope: 5 of 12 workspace projects
packages/contracts prebuild$ bash ../../scripts/prebuild-check.sh
packages/db prebuild$ bash ../../scripts/prebuild-check.sh
packages/contracts prebuild: Done
packages/contracts build$ tsc -p tsconfig.json
packages/db prebuild: Done
packages/db build$ pnpm run generate && tsup --config tsup.config.ts && pnpm run build:dts
packages/contracts build: Done
packages/db build: Failed
/home/jusall/projects/EIAH_BUILDER/packages/db:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @repo/db@1.0.0 build: `pnpm run generate && tsup --config tsup.config.ts && pnpm run build:dts`
Exit status 1
 ELIFECYCLE  Command failed with exit code 1.
```

### `pnpm check:orphan-tests`

```json
{
  "ok": true,
  "check": "check:orphan-tests",
  "orphanCount": 50,
  "allowlistedOrphanCount": 50,
  "blockingOrphanCount": 0
}
```

### `pnpm check:evidence-index` antes do ajuste

```json
{
  "ok": false,
  "check": "check:evidence-index",
  "message": "EVIDENCE_INDEX has missing file references",
  "details": {
    "missingCount": 2,
    "missingRefs": [
      "apps/api/src/services/imob/crm/*",
      "docs/*"
    ]
  }
}
```

### `pnpm check:docs-link-integrity`

```json
{
  "ok": true,
  "check": "check:docs-link-integrity",
  "filesChecked": 15
}
```

## Prova de isolamento
Confirmado sem alteração em:
- `.github/workflows/release.yml`
- `.github/workflows/release-node22-readiness.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/lint.yml`
- `.github/workflows/critical-dod.yml`
- `package.json`
- `pnpm-lock.yaml`
- `.nvmrc`
- `.node-version`
- `scripts/checkOrphanTests.ts`
- `scripts/orphan-tests-allowlist.txt`
- `apps/cli`
- `packages/contracts`
- `packages/core`
- `packages/db`
- `apps/web/src/components/agents/ChatAgentLauncher.tsx`
- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts`

Todos os comandos `git diff -- <path>` acima retornaram saída vazia nesta sessão.

## Resultado e decisão
A falha local de build da API foi corrigida.

Ainda é obrigatório reexecutar `ReleaseNode22Readiness` em `main` após merge antes de qualquer migração do `release.yml`.

## Lacunas remanescentes

### P0
Readiness real pós-F0.30 pendente.

### P1
Release path protegido; sem publish real.

### P2
Build/release CI ainda precisa de run verde real.

### P3
Fora do escopo.

### P4
IMOB alterado apenas em type/build fix; front door UI e `ChatAgentLauncher` sem alteração.

## Status
Status: parcial/evidenciado
