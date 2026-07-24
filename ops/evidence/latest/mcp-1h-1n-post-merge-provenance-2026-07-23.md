# MCP-1H..1N — Proveniência pós-merge

Versão: 3.0  
Data: 2026-07-23  
Status normativo: evidência documental; estado operacional parcial  
Escopo do run: MCP-1H, MCP-1I, MCP-1J, MCP-1L, MCP-1N e corte APE #47  
Ator: Codex (agente principal, sem subagentes)  
Modo: read-only, exceto `docs/EVIDENCE_INDEX.md`, `docs/architecture/mcp-contract-v1.md` e este snapshot

Preflight confirmado em 2026-07-24: worktree limpo; `HEAD` e `origin/main` em
`aee58604bfa8bf9afd9d17add4b7dbf45d9c9220`; branch `main`.

## Tabela principal

| MCP | PR | merge SHA | impl SHA | ancestralidade verificada | arquivos alterados | workflow runs (PRÉ-MERGE) | classificação | evidenceRef | gap remanescente |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MCP-1H | #379 | `676a788f85f0eb03b78a19341ced28e08a58ea89` | `bf12edae96092f7c4bb1f8b20812839de8ae7f14` | S — `git merge-base --is-ancestor 676a788f85f0eb03b78a19341ced28e08a58ea89 HEAD`; `git merge-base --is-ancestor bf12edae96092f7c4bb1f8b20812839de8ae7f14 HEAD` | `apps/api/src/tests/run-worker-action-resolution.test.ts`; `apps/api/src/workers/runWorker.ts`; `apps/api/src/workers/runWorkerActionResolution.ts`; `package.json`; `packages/mcp-runner/src/executor/MCPExecutor.test.ts`; `packages/mcp-runner/src/executor/MCPExecutor.ts`; `packages/mcp-runner/src/registry/ToolRegistry.test.ts`; `packages/mcp-runner/src/registry/ToolRegistry.ts`; `scripts/unit-tests-manifest.txt` | `29993671100`, `29993671007`, `29993671043` — head do PR `dd6d3f1072e0c40d957837845759307b15b62a3e` | confirmado | `MCP-1H-PR379-MERGE` | cobertura/caracterização; sem execução dedicada pós-merge em `main` |
| MCP-1I | #381 | `8f9852f75ec6830a34fa2ed14538032a7d03c847` | `b5bafa5d8f6482a77ffc4ce534d45e79abb82a15` | S — `git merge-base --is-ancestor 8f9852f75ec6830a34fa2ed14538032a7d03c847 HEAD`; `git merge-base --is-ancestor b5bafa5d8f6482a77ffc4ce534d45e79abb82a15 HEAD` | `apps/api/src/services/imob/imobCanonical.ts`; `apps/api/src/tests/imob-simulated-output-contract.test.ts`; `apps/api/src/tests/run-worker-action-resolution.test.ts`; `apps/api/src/workers/runWorker.ts`; `apps/api/src/workers/runWorkerActionResolution.ts`; `docs/architecture/mcp-contract-v1.md`; `scripts/checkMcpContractDrift.ts` | `29999904437`, `29999904415`, `29999904426` | confirmado | `MCP-1I-PR381-MERGE` | sem E2E implantado com Postgres/Redis reais |
| MCP-1J | #382 | `8bb81684a16f52cfb18a97b488ac0a2c1b6dd54c` | `c003772820bf914398e751ad53787462f8eca059` | S — `git merge-base --is-ancestor 8bb81684a16f52cfb18a97b488ac0a2c1b6dd54c HEAD`; `git merge-base --is-ancestor c003772820bf914398e751ad53787462f8eca059 HEAD` | `apps/api/src/routes/governance.ts`; `apps/api/src/services/evidenceBundle.ts`; `apps/api/src/services/executionEvidence.ts`; `apps/api/src/services/receiptCanonService.ts`; `apps/api/src/tests/receipt-canon-execution-evidence.test.ts`; `apps/api/src/tests/run-worker-action-resolution.test.ts`; `apps/api/src/workers/runWorker.ts`; `apps/api/src/workers/runWorkerActionResolution.ts`; `contracts/CHANGELOG.receipt-canon.md`; `contracts/examples/receipt-canon.v1.example.json`; `contracts/receipt-canon.v1.baseline.json`; `contracts/receipt-canon.v1.schema.json`; `docs/architecture/mcp-contract-v1.md`; `docs/ops/reason-codes-catalog.md`; `docs/ops/receipt-canon-external-verifier.md`; `docs/ops/receipt-canon-versioning-policy.md`; `package.json`; `scripts/checkReceiptCanonVersioning.ts`; `scripts/unit-tests-manifest.txt`; `scripts/verify-receipt-canon.ts` | `30001483563`, `30001483663`, `30001483661` | confirmado | `MCP-1J-PR382-MERGE` | sem E2E implantado com Postgres/Redis reais; idempotência/retry pós-side-effect permanece fora desta evidência |
| MCP-1L | #383 | `c99e6bb76fbeab2cd716cea3124e4fb7a39f5b08` | `d9ec52b4c43a0e7839d5595fa9d60ded0d1066bf` | S — `git merge-base --is-ancestor c99e6bb76fbeab2cd716cea3124e4fb7a39f5b08 HEAD`; `git merge-base --is-ancestor d9ec52b4c43a0e7839d5595fa9d60ded0d1066bf HEAD` | `apps/api/src/workers/runWorker.ts`; `apps/workers/action-runner/src/services/mcpAdapter.ts`; `docs/architecture/mcp-contract-v1.md`; `docs/ops/reason-codes-catalog.md`; `packages/mcp-runner/src/executor/MCPExecutor.test.ts`; `packages/mcp-runner/src/executor/MCPExecutor.ts`; `packages/mcp-runner/src/executor/dbAllowlist.ts`; `packages/mcp-runner/src/index.ts`; `packages/mcp-runner/src/registry/ToolRegistry.test.ts`; `packages/mcp-runner/src/registry/ToolRegistry.ts` | `30005516302`, `30005516250`, `30005516237` | confirmado | `MCP-1L-PR383-MERGE` | allowlist DB de produção vazia |
| MCP-1N | #384 | `aee58604bfa8bf9afd9d17add4b7dbf45d9c9220` | `9441c219af0b83862ec2fd55be2abb0849ea4799` | S — `git merge-base --is-ancestor aee58604bfa8bf9afd9d17add4b7dbf45d9c9220 HEAD`; `git merge-base --is-ancestor 9441c219af0b83862ec2fd55be2abb0849ea4799 HEAD` | `docs/architecture/mcp-contract-v1.md`; `packages/db/prisma/migrations/20260723120000_tool_contract_tenant_name_version_unique/migration.sql`; `packages/db/prisma/schema.prisma`; `packages/db/src/__tests__/toolContractUnique.integration.test.ts` | `30006675635`, `30006675609`, `30006675598` | confirmado | `MCP-1N-PR384-MERGE` | migration versionada, não comprovada como aplicada; teste real de unicidade fica em skip sem `MCP_1N_DATABASE_URL` |

Os 50 paths listados foram verificados em `HEAD` por `git ls-tree`; nenhum
path estava ausente. Os workflow runs foram consultados por commit e
correspondem ao head de cada PR antes do respectivo merge. Eles não constituem
execução dedicada pós-merge em `main`.

## evidenceRef

- `MCP-1H-PR379-MERGE`
  - location: `packages/mcp-runner/src/registry/ToolRegistry.test.ts@676a788f85f0eb03b78a19341ced28e08a58ea89`
  - hash: `fd4bf23daaab4f488c10a02ebbd5cf9ce11c066a`
  - comando: `git rev-parse 676a788f85f0eb03b78a19341ced28e08a58ea89:packages/mcp-runner/src/registry/ToolRegistry.test.ts`
- `MCP-1I-PR381-MERGE`
  - location: `apps/api/src/workers/runWorkerActionResolution.ts@8f9852f75ec6830a34fa2ed14538032a7d03c847`
  - hash: `834f47493be9d929387b20c100eb0d4e438059c9`
  - comando: `git rev-parse 8f9852f75ec6830a34fa2ed14538032a7d03c847:apps/api/src/workers/runWorkerActionResolution.ts`
- `MCP-1J-PR382-MERGE`
  - location: `apps/api/src/services/executionEvidence.ts@8bb81684a16f52cfb18a97b488ac0a2c1b6dd54c`
  - hash: `1d7996470002d8b7b207ceda244c039ccf508287`
  - comando: `git rev-parse 8bb81684a16f52cfb18a97b488ac0a2c1b6dd54c:apps/api/src/services/executionEvidence.ts`
- `MCP-1L-PR383-MERGE`
  - location: `packages/mcp-runner/src/executor/dbAllowlist.ts@c99e6bb76fbeab2cd716cea3124e4fb7a39f5b08`
  - hash: `2029c61ec38cfbd67a0579c708fa503088acbd89`
  - comando: `git rev-parse c99e6bb76fbeab2cd716cea3124e4fb7a39f5b08:packages/mcp-runner/src/executor/dbAllowlist.ts`
- `MCP-1N-PR384-MERGE`
  - location: `packages/db/prisma/migrations/20260723120000_tool_contract_tenant_name_version_unique/migration.sql@aee58604bfa8bf9afd9d17add4b7dbf45d9c9220`
  - hash: `7dca9b5bf56cbeb1f107a2bba3d3efd1d719a6f2`
  - comando: `git rev-parse aee58604bfa8bf9afd9d17add4b7dbf45d9c9220:packages/db/prisma/migrations/20260723120000_tool_contract_tenant_name_version_unique/migration.sql`
- `APE-47-RUN47`
  - location: `ops/evidence/latest/ape-weekly-cycle-run47-2026-07-23.md@db02d53335e500d99ffa55bbdad07c6aff32325c`
  - hash: `5c565566af1832febe00d83a0f769a55f1b0f7e0`
  - comando: `git rev-parse db02d53335e500d99ffa55bbdad07c6aff32325c:ops/evidence/latest/ape-weekly-cycle-run47-2026-07-23.md`
- `DOC-GATE-EVIDENCE-INDEX-GAP`
  - location: `scripts/checkEvidenceIndex.ts@aee58604bfa8bf9afd9d17add4b7dbf45d9c9220`
  - hash: `086618bff409ea3ea1b9808ed057d8a28bb8e43a`
  - comando: `git rev-parse aee58604bfa8bf9afd9d17add4b7dbf45d9c9220:scripts/checkEvidenceIndex.ts`

## O que este snapshot NÃO prova

- Não prova execução dedicada pós-merge em `main`.
- Não prova que a migration MCP-1N, embora versionada, tenha sido aplicada em
  qualquer ambiente.
- Não prova operação DB do MCP-1L: a allowlist de produção está vazia.
- Não prova unicidade no banco real: o teste fica em skip sem
  `MCP_1N_DATABASE_URL`.
- Não prova E2E implantado com Postgres/Redis reais.
- Não prova MCP fechado, P3 verde ou P4 verde.

## APE #47 — estado vigente

Classificação: confirmado. EvidenceRef: `APE-47-RUN47`.

APE #47 (2026-07-23) — estado vigente em 2026-07-24:

- `decision=NO_GO`
- `hardMetricsGo=false`
- `nonRegressionGo=false`
- `auditGap=0`
- `duplicateSideEffects=0`
- `check:e2e-recency=FAIL`: manifesto com `ageDays=29.93`, limite
  `maxAgeDays=7`, aferido em 2026-07-24.
- `check:backup-restore=FAIL`: drill com `ageDays=29.93`, limite
  `maxAgeDays=7`, aferido em 2026-07-24.

## Corte temporal

Os ciclos APE #38–#46 são históricos. APE #47 (2026-07-23) é o estado vigente
em 2026-07-24. Este snapshot não apaga, reescreve nem reinterpreta resultados
anteriores.

## Divergências resumo × repositório

- MCP-1H: o commit de implementação é
  `bf12edae96092f7c4bb1f8b20812839de8ae7f14`, mas o head final do PR #379 é
  `dd6d3f1072e0c40d957837845759307b15b62a3e`, após merge de sincronização com
  `main`. Por isso, os workflow runs pré-merge indexados são os do head final do
  PR. O merge e o commit de implementação continuam ancestrais de `HEAD`; o
  item permanece confirmado.
- O catálogo documental `docs/ops/reason-codes-catalog.md` declara como fonte
  da verdade `packages/core/src/reasons/reasonCatalog.ts`, mas esse path não
  existe em `HEAD`. Nenhum reason code foi inferido desse path ausente.
- Não foi encontrada divergência material que invalide um dos cinco itens MCP.

## assumptionRegister

Nenhuma estimativa foi usada para indexar MCP-1H, MCP-1I, MCP-1J, MCP-1L,
MCP-1N, APE #47 ou o gap do gate documental. Os valores de idade dos dois
checks APE são medições da execução de 2026-07-24, arredondadas para duas casas
decimais; não são usados para reescrever o artefato APE #47.

## Gaps remanescentes

- Classificação: confirmado. EvidenceRef:
  `DOC-GATE-EVIDENCE-INDEX-GAP`. `check:evidence-index` valida estrutura mínima
  e existência das referências que já estão no índice. Não valida completude
  por omissão de evidência nova, nem validade temporal ou semântica. Resultado
  verde não prova sincronização do índice com o estado de `main`.
- Não há, no catálogo oficial localizável, código aplicável a “gate documental
  com cobertura insuficiente”. Solicita-se decisão humana para criar um código
  documental em PR separado, fora deste run.
- `reasonCode: BLOCKED — reason-code-missing-for-doc-gate-gap`
- A correção do gate permanece aberta; nenhum script ou catálogo canônico foi
  alterado.
- A escada L1→L5 não está definida nas fontes normativas lidas. O nível atual e
  o alvo não são atribuídos para evitar fabricar uma taxonomia.

## Checks

Obrigatórios:

- `pnpm check:evidence-index`: PASS — estrutura e 617 referências existentes
  verificadas; não altera o gap semântico documentado.
- `pnpm check:docs-link-integrity`: PASS — 21 arquivos verificados.
- `pnpm check:mcp-contract-drift`: PASS — 696 fontes operacionais varridas.
- `git diff --check`: PASS.

Informativos:

- `pnpm check:p1-reconciliation-recurring`: PASS — APE #45, #46 e #47 dentro
  da janela de 14 dias, todos com `auditGap=0` e
  `duplicateSideEffects=0`.
- `pnpm check:e2e-recency`: FAIL esperado — o manifesto HIGH tem 29,93 dias
  contra limite de 7. Reversão: gerar e versionar manifestação baseada em E2E
  HIGH real com idade de até 7 dias.
- `pnpm check:backup-restore`: FAIL esperado — o restore drill tem 29,93 dias
  contra limite de 7. Reversão: executar restore drill real e publicar sua
  evidência com idade de até 7 dias.
- `pnpm check:p3-stability-recurring`: FAIL esperado —
  `economy_stability_not_recurring`; APE #45, #46 e #47 têm
  `hardMetricsGo=false`. Reversão: obter a quantidade requerida de ciclos
  dentro da janela do gate com `hardMetricsGo=true`, `auditGap=0`,
  `duplicateSideEffects=0` e `breakGlass=0`.
- `pnpm check:p4-trackp-rollout`: FAIL esperado — `ape_cycles_not_green`; APE
  #46 e #47 têm `hardMetricsGo=false`. Reversão: publicar os ciclos exigidos
  pelo gate com `hardMetricsGo=true`, preservando os demais critérios de
  rollout.

## Receipt

receipt:
  runId:            PR-DOC-MCP-PROVENANCE-v3-20260724
  timestamp:        2026-07-24T10:13:48Z
  actor:            Codex (agente principal, sem subagentes)
  scope:            docs-only — docs/EVIDENCE_INDEX.md; docs/architecture/mcp-contract-v1.md; ops/evidence/latest/mcp-1h-1n-post-merge-provenance-2026-07-23.md
  headSha:          aee58604bfa8bf9afd9d17add4b7dbf45d9c9220
  filesChanged:     docs/EVIDENCE_INDEX.md; docs/architecture/mcp-contract-v1.md; ops/evidence/latest/mcp-1h-1n-post-merge-provenance-2026-07-23.md
  checksExecuted:   obrigatórios PASS; P1 PASS; E2E recency, backup/restore, P3 e P4 FAIL esperado
  decision:         GO documental / NO_GO operacional
  reasonCode:       BLOCKED — reason-code-missing-for-doc-gate-gap
  maskingCheck:     PASS
  contentHash:      79a4e453bd685775ac839f5aa400c43ab4b7fb3a6e59f2ada129cc8ecec601bf
  contentHashCmd:   sed '/^## Receipt$/,$d' ops/evidence/latest/mcp-1h-1n-post-merge-provenance-2026-07-23.md \
                    | sha256sum
  snapshotBlobSha:  N/A — registrado externamente no relatório do agente (ver §14.10)
