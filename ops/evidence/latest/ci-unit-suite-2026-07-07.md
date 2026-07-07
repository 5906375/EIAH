# PR-CI-02 — job de suíte unit/mock em ci.yml (2026-07-07)

## Objetivo

Implementar a Opção 3 (híbrida) ratificada em D14: testes unit/mock puro (Grupo B) ganham job
próprio em `ci.yml`, sem `services:`. Base: `pr-ci-orphan-tests` (branch com `checkOrphanTests.ts`,
necessário para o antes/depois desta sessão).

## Verificação prévia — reclassificação Grupo A/B

Reexecutei o classificador usado na triagem D14 (mesma lógica: import de `supertest`, do app real
`apps/api/src/index.ts`, chamadas `prisma.x.create/findMany/...`, cliente Redis real, bootstrap
`testInfraEnv`) contra o estado atual de `pr-ci-orphan-tests`. Resultado idêntico ao de D14:

```
totalTestFiles: 288
blockingOrphanCount: 210
Grupo A (exige Postgres/Redis real): 33
Grupo B (unit/mock puro): 177
Grupo C (import quebrado): 0
```

A lista não mudou desde D14 (nenhum merge aconteceu no intervalo).

## Execução real dos 177 do Grupo B — o que falhou e por quê

Rodei os 177 arquivos, primeiro individualmente (sem nenhuma env var) para veredito limpo por
arquivo, depois revalidando falhas com hipóteses específicas. Resultado bruto: **148 passam sem
nenhuma configuração**, **29 falham**. Investigação de cada falha:

**Recuperados só com env var (não são falha real, 14 arquivos)** — todos os `apps/web/**` falhavam
com `ERR_MODULE_NOT_FOUND: Cannot find package '@/...'`; resolvido com
`TSX_TSCONFIG_PATH=apps/web/tsconfig.json` (mesmo padrão já usado em `test:imob-orchestrator-pr6`
para `chatLauncherEngine.test.ts`). Confirmado: todos os 14 passam limpo com essa env var.

**Excluídos do manifesto — falha real de asserção, pendente de triagem (11 arquivos)**:
- `apps/web/src/features/imob/ImobBottleneckHeatmap.test.tsx`
- `apps/web/src/features/imob/ImobWaitingOnBoard.test.tsx`
- `apps/api/src/tests/imob-assisted-integrations.test.ts` (pass:2/fail:3)
- `apps/api/src/tests/imob-copilot-conversation.test.ts` (pass:16/fail:2)
- `apps/api/src/tests/imob-crm-document-service.test.ts` (pass:2/fail:1)
- `apps/api/src/tests/imob-crm-kpi-service.test.ts` (pass:2/fail:7)
- `apps/api/src/tests/imob-crm-resolver.test.ts` (pass:25/fail:5)
- `apps/api/src/tests/imob-crm-workflow-machine.test.ts` (pass:17/fail:1)
- `apps/api/src/tests/imob-cross-surface-regression.test.ts` (pass:1/fail:2)
- `apps/api/src/tests/imob-lead-matching.e2e.test.ts` (pass:1/fail:1)
- `apps/api/src/tests/imob-owner-blocker-consult.test.ts` (pass:2/fail:2)

Nenhum destes foi corrigido nesta sessão (fora de escopo — "não corrigir testes quebrados nesta
fase"). Ficam fora do manifesto e, portanto, continuam órfãos até uma triagem dedicada.

**Excluídos — reclassificação para Grupo A (achado novo, gap na heurística D14, 2 arquivos)**:
`apps/api/src/tests/capability-execution.test.ts` e `apps/api/src/tests/imob-artifact-capabilities.test.ts`
falham com `Error: DATABASE_URL não definido`, mesmo sem importar `@repo/db` diretamente — o import
é transitivo (via `../services/capabilityExecution` e `../services/imob/imobArtifactCapabilities`,
que carregam `@repo/db` internamente). A heurística de D14 só inspeciona os imports diretos do
próprio arquivo de teste, não a cadeia transitiva — **subestima o Grupo A em ao menos 2 arquivos**.
Registrado aqui como achado, não corrigido na classificação (fora de escopo desta sessão alterar o
classificador).

**Excluído — estrutural, fora de qualquer workspace package (1 arquivo)**:
`tests/multitenant/tenant-isolation.test.ts` falha com `Cannot find package '@repo/db'` — este
arquivo vive em `tests/` na raiz do repo, fora de qualquer pacote do workspace pnpm, então a
resolução de node_modules do pnpm não alcança `@repo/db` a partir dali. Não é um problema do
Grupo B em si, é de localização do arquivo.

**Excluído — já coberto, falso positivo em `check:orphan-tests` (1 arquivo)**:
`apps/api/src/tests/provider-boundary-enforcement.test.ts` falha se rodado a partir da raiz do
repo (usa `fs.readdirSync` com caminhos relativos internos), mas **já está wired** via
`check:provider-boundary` (`ci.yml:260` → `pnpm --filter @eiah/api exec tsx --test
src/tests/provider-boundary-enforcement.test.ts`, com `cwd=apps/api`). Confirmado passando com
`cwd=apps/api`. A razão de aparecer como órfão em `check:orphan-tests` é um gap no próprio
scanner N-12: o valor do script usa o caminho relativo a `apps/api` (`src/tests/...`), enquanto o
inventário do scanner usa o caminho relativo ao repo (`apps/api/src/tests/...`) — os dois textos
nunca coincidem pela regex de substring. **Não corrigido nesta sessão** (alterar
`checkOrphanTests.ts` está fora do escopo desta PR, que é só wiring do Grupo B); registrado como
achado para uma frente futura de hardening do N-12.

**Excluído após a 1a execução real no GitHub Actions (1 arquivo)**:
`apps/workers/action-runner/src/index.test.ts` passou na validação local inicial, mas falhou no
runner limpo do Actions com `ERR_MODULE_NOT_FOUND:
apps/workers/action-runner/node_modules/@repo/db/dist/index.js`. O teste depende, na prática, de
um artefato buildado de `@repo/db` indisponível sem build amplo prévio. Como a missão desta PR é
manter o job como unit/mock puro, sem `services:` e sem transformar a suíte em integração, o
arquivo foi removido do manifesto em vez de alterar runtime, `apps/workers/action-runner/src/index.ts`
ou o pipeline de build.

## Atualização pós-1a execução real no GitHub Actions

Após o merge do wiring inicial desta PR, o job `ci_unit_suite` rodou de fato no GitHub Actions
e revelou **1 falha real que não aparecia na validação local anterior**:

- `apps/workers/action-runner/src/index.test.ts`
- erro: `ERR_MODULE_NOT_FOUND: apps/workers/action-runner/node_modules/@repo/db/dist/index.js`

O arquivo vive no workspace `apps/workers/action-runner` e, no runner limpo do GitHub, puxa um
artefato buildado de `@repo/db` que não existe sem build amplo prévio. Para preservar o contrato
da PR-CI-02 como **unit/mock puro, sem `services:` e sem build amplo**, a correção adotada aqui é
**excluir esse teste do manifesto**, não alterar runtime nem resolver `@repo/db` nesta PR.

## Manifesto final incluído: 161 de 177 (16 excluídos, listados acima)

`scripts/unit-tests-manifest.txt` — lista versionada, uma linha por arquivo, com cabeçalho
documentando os 16 excluídos e o comando de regeneração do script de `package.json`. Esta é a
fonte da verdade; o valor do script `test:ci-unit-suite` em `package.json` foi gerado a partir
dela (mesmo padrão de listas inline já usado em `test:imob-orchestrator-pr6` etc., sem hardcodar
os 161 caminhos em `ci.yml`).

```
"test:ci-unit-suite": "TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test --test-force-exit <161 caminhos>"
```

Histórico de execução real:

- validação local original antes do PR: `162` arquivos, `pass:711/fail:0`
- 1a execução real no GitHub Actions: `162` arquivos, `pass:710/fail:1`
- correção desta sessão: remover `apps/workers/action-runner/src/index.test.ts` do manifesto e do
  script `test:ci-unit-suite`

Validado após a correção: os 161 arquivos rodados juntos, com o único env var
`TSX_TSCONFIG_PATH`, sem
`DATABASE_URL`/`REDIS_URL`/nenhum outro:

```
# tests 710
# pass 710
# fail 0
# duration_ms 16702 (baseline anterior com 162) / ver reexecução desta sessão para o valor atual
```

## `ci.yml` — novo job

Job `ci_unit_suite` (`name: CiUnitSuite`), inserido logo após `imob_lead_continuity_scoped`, mesmo
padrão exato (checkout, setup pnpm, setup node 22, install, um único step de execução), **sem**
bloco `services:`. Step único: `Run unit test suite (Grupo B, sem services)` → `pnpm test:ci-unit-suite`.

## Verificação do gate de órfãos (N-12) — antes/depois, mesma branch

```
ANTES:  blockingOrphanCount = 210
DEPOIS: blockingOrphanCount = 50   (delta: -160)
```

O `check:orphan-tests` reexecutado nesta sessão também mostra `totalTestFiles = 289` no estado
atual da branch. O novo estado mantém `apps/workers/action-runner/src/index.test.ts` órfão por
design nesta PR, já que o arquivo foi retirado do manifesto sem ganhar outro wiring de CI. Assim,
os 161 arquivos do manifesto permanecem cobertos, mas o efeito líquido do branch atual contra o
baseline `210` é `-160`, chegando a `50` órfãos bloqueantes. `ok` permanece `false` (50 órfãos
remanescentes: os 16
excluídos aqui + o restante do Grupo A + F-06 + outros não tocados nesta sessão) — esperado, e sem
efeito de bloqueio de CI porque o step de `check:orphan-tests` em `ci.yml` continua `warn-only`
(`continue-on-error: true`, decisão do N-12, não alterada aqui).

## Evidência

Este arquivo + entrada em `docs/EVIDENCE_INDEX.md` + `check:evidence-index` (ver seção de
execução abaixo).

## O que ficou de fora

- Os 16 arquivos excluídos do manifesto (listados acima) — nenhum foi corrigido; ficam como
  pendência de triagem futura (parte do escopo de D15/PR-CI-04, ou de uma frente dedicada a esses
  12 casos de falha real/ambiente).
- Correção do gap de detecção transitiva de D14 (capability-execution/imob-artifact-capabilities).
- Correção do falso positivo de N-12 para `provider-boundary-enforcement.test.ts` (path mismatch
  no scanner).
- Migração dos 33 arquivos do Grupo A restantes para `imob-worker-e2e.yml` (D15, deferida).

## Status

- Reclassificação Grupo A/B: **evidenciado** (idêntica a D14, sem mudanças desde então).
- Execução real dos 177 e identificação dos 15 excluídos iniciais: **evidenciado** (rodado individualmente
  e revalidado, motivos confirmados por reprodução, não por suposição).
- 1a execução real no GitHub Actions do job `ci_unit_suite`: **evidenciado** (`pass:710/fail:1`,
  falha única em `apps/workers/action-runner/src/index.test.ts` por `ERR_MODULE_NOT_FOUND` de
  `@repo/db/dist/index.js` no runner limpo).
- Ajuste corretivo mínimo do manifesto/script para preservar o escopo unit/mock: **evidenciado**
  (161 arquivos, `blockingOrphanCount=50`, sem `services:` e sem build amplo).
- Correção dos 16 excluídos: **proposta** (não implementada, fora de escopo desta fase).
