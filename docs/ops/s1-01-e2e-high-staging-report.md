# S1-01 — E2E HIGH em Staging (Run -> SCL -> PoU -> txId -> bundle)

Status: `AUTOMATED_VIA_GENERATE_E2E_HIGH_MANIFEST`

## Como executar

```bash
# Manual (local — requer secrets no .env)
pnpm generate:e2e-high-manifest

# Verificar manifesto gerado
pnpm check:e2e-recency

# CI: workflow_dispatch ou schedule toda segunda 09:00 UTC
# .github/workflows/e2e-high-staging.yml
```

Secrets necessários (CI ou `.env` local):
| Variável | Descrição |
|---|---|
| `STAGING_API_BASE_URL` | URL base da API em staging (sem trailing slash) |
| `STAGING_API_TOKEN` | Bearer token com permissão de execução |
| `E2E_TENANT_ID` | tenantId do tenant de teste dedicado |
| `E2E_WORKSPACE_ID` | workspaceId do workspace de teste dedicado |
| `E2E_AGENT_ID` | agentId (padrão: `imob`) |

## Escopo coberto

Cadeia obrigatória por ação HIGH:
- `Run -> SCL -> PoU -> txId -> bundle`

Endpoints de verificação:
- `GET /api/ledger/:txId` — invariant.status
- `GET /api/runs/:runId/bundle` — bundleHash

Saída: `ops/evidence/latest/high-e2e-manifest.json`

## Matriz oficial de ações HIGH (staging)

| Action | RunId | TxId | /api/ledger/:txId | /api/runs/:runId/bundle | Invariante | Resultado |
|---|---|---|---|---|---|---|
| `realestate.apply_adjustment` | derivado | derivado do ledger | PASS/FAIL | PASS/FAIL | OK/BROKEN | PASS/FAIL |
| `realestate.generate_charge` | derivado | derivado do ledger | PASS/FAIL | PASS/FAIL | OK/BROKEN | PASS/FAIL |

> `txId` é derivado assincronamente do ledger por `runId` (poll 30s). Não vem diretamente do endpoint de criação do run.

## Validações anti-sintéticas (check:e2e-recency)

O script `check_e2e_recency.ts` rejeita manifestos sintéticos:
- `commitSha: "recovery-local"` ou `"unknown"` → FAIL
- `runIds` contendo `"run-stg-*"` ou `"error"` → FAIL
- Campo `environment` ausente → FAIL
- Campo `generatedBy` ausente → FAIL
- Menos de 2 `scenarioResults` → FAIL
- Qualquer `scenarioResults[*].status !== "passed"` → FAIL
- Qualquer `scenarioResults[*].latencyMs <= 0` → FAIL
- Manifesto com mais de 7 dias → FAIL

## Invariantes obrigatórios por execução

- `invariant.txIdToRunId = true`
- `invariant.runIdToBundleHash = true`
- `invariant.status = ok`
- `reconciliation.runSclAligned = true`
- `reconciliation.runHashAligned = true`

## Evidências anexadas

- [x] Gerador automatizado: `scripts/generate_e2e_high_manifest.ts`
- [x] Validação anti-sintética: `scripts/check_e2e_recency.ts`
- [x] Workflow CI: `.github/workflows/e2e-high-staging.yml`
- [x] Schema contratual: `contracts/economy-receipt.v1.schema.json`
- [ ] Primeiro run real em staging com manifesto commitado.
- [ ] Link cruzado no `docs/EVIDENCE_INDEX.md` após primeira execução.

## Resultado consolidado (última execução)

- Manifesto: `ops/evidence/latest/high-e2e-manifest.json`
- Total de ações HIGH avaliadas: ver `scenariosTotal` no manifesto
- Pass: ver `scenariosPassed`
- Fail: ver `scenariosFailed`
- Bypass detectado: `não` (anti-sintético ativo)

## Observações operacionais

- Toda divergência deve registrar reason code oficial no ledger/RunEvent.
- Falha de invariante bloqueia promoção para fechamento de F5.3.
- Runs gerados recebem `metadata.source = "e2e-high-staging"` para policy de retenção.
- `txId` pode ser `null` no manifesto se SCL ainda não confirmou após 30s — aceitável em v1, será obrigatório em v1.1.
