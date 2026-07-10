# F0.11 — Node runtime baseline declaration

## Data
2026-07-09

## Objetivo
Declarar uma baseline explícita de runtime Node para o repositório, resolvendo a lacuna identificada em F0.10 sem padronizar ainda todos os workflows.

## Escopo
Este PR é pequeno e declarativo. Não altera workflows, lockfile, scripts, runtime de aplicação, IMOB/front door, `ChatAgentLauncher`, backend, policy, Prisma, WhatsApp, mobile ou economy.

## Decisão adotada
Baseline declarada: `Node 22`

Artefatos usados:
- `package.json`
  - `"engines": { "node": ">=22 <23" }`
- `.nvmrc`
  - `22`
- `.node-version`
  - `22`

## Justificativa
- F0.10 classificou o estado como `migração parcial`.
- No `CI Monorepo`, 24 de 25 jobs já usam Node 22.
- Os gates dedicados criados em F0.5/F0.8 e a maior parte dos gates P0/P1/P2/P3 do workflow principal já rodam em Node 22.
- Node 20 permaneceu como runtime residual em:
  - `build_validate` dentro de `.github/workflows/ci.yml`
  - `.github/workflows/lint.yml`
  - `.github/workflows/release.yml`
  - `.github/workflows/critical-dod.yml`
- F0.10 não encontrou baseline declarativa explícita que justificasse manter Node 20 como versão canônica do repositório.
- Há evidência documental de que Node 20 é tratado como backlog de migração, não como baseline estável formalizada.

## O que este PR resolve
- Fecha a lacuna P0 de baseline declarativa ausente em:
  - `package.json` `engines.node`
  - `.nvmrc`
  - `.node-version`
- Alinha a declaração versionada com o padrão dominante do `CI Monorepo`.

## O que este PR não resolve
- Não padroniza ainda os workflows residuais em Node 20.
- Não altera `build_validate`.
- Não prova compatibilidade total de todos os workflows legados com Node 22.
- Não fecha F0 global nem P0 global.

## Impacto esperado
- Ferramentas locais (`nvm`, asdf/mise compatíveis com `.node-version`, validações de `engines`) passam a ter uma fonte explícita de baseline.
- A ambiguidade sobre a versão alvo do repositório diminui.
- A divergência residual em workflows passa a ficar claramente classificada como dívida de migração, não como ausência de baseline.

## Próximo passo recomendado
PR separado:
- `F0.12 — Node runtime workflow convergence`

Escopo sugerido para a próxima etapa:
1. comparar `build_validate` em Node 20 vs Node 22;
2. migrar `build_validate` se não houver regressão;
3. revisar `lint.yml`, `release.yml` e `critical-dod.yml`;
4. validar os gates P0/P1 afetados após a convergência.

## Checks executados

| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm check:orphan-tests` | pass | `ok=true`, `orphanCount=50`, `allowlistedOrphanCount=50`, `blockingOrphanCount=0`, `staleAllowlistEntries=[]` |
| `pnpm check:evidence-index` | pass | `ok=true`, `refsChecked` atualizado após indexação F0.11 |
| `pnpm check:docs-link-integrity` | pass | `ok=true`, `filesChecked=15` |
| `git diff -- .github/workflows/ci.yml` | vazio | sem alteração F0.11 |
| `git diff -- .github/workflows/lint.yml` | vazio | sem alteração F0.11 |
| `git diff -- .github/workflows/release.yml` | vazio | sem alteração F0.11 |
| `git diff -- .github/workflows/critical-dod.yml` | vazio | sem alteração F0.11 |
| `git diff -- pnpm-lock.yaml` | vazio | sem alteração |
| `git diff -- scripts/checkOrphanTests.ts` | vazio | sem alteração |
| `git diff -- scripts/orphan-tests-allowlist.txt` | vazio | sem alteração |
| `git diff -- apps/web/src/components/agents/ChatAgentLauncher.tsx` | vazio | sem alteração |
| `git diff -- apps/web/src/pages/app/imob/chat.tsx` | vazio | sem alteração |
| `git diff -- apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts` | vazio | sem alteração |
| `git diff --check` | pass | sem saída |

## Lacunas remanescentes

### P0
- Workflows residuais ainda usam Node 20 apesar da baseline agora declarada como Node 22.
- `build_validate` permanece fora do baseline declarada e precisa de PR dedicado.

### P1
- Gates P1 ainda convivem com runtime residual diferente em parte do CI.

### P2
- Contratos/e2e podem seguir sujeitos a divergência enquanto a migração dos workflows não for concluída.

### P3
- Fora do escopo desta frente; apenas permanece o registro de que os jobs P3 do `CI Monorepo` já estão em Node 22.

### P4
- Fora do escopo IMOB/front door; os gates IMOB continuam intocados e já alinhados ao baseline Node 22.

## Status
Status: parcial/evidenciado
