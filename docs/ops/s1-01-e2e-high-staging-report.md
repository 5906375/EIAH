# S1-01 — E2E HIGH em Staging (Run -> SCL -> PoU -> txId -> bundle)

Status: `PENDING_EXECUTION_IN_STAGING`

## Escopo coberto
- Cadeia obrigatoria por acao HIGH:
  - `Run -> SCL -> PoU -> txId -> bundle`
- Endpoints de verificacao:
  - `GET /api/ledger/:txId`
  - `GET /api/runs/:runId/bundle`

## Matriz oficial de acoes HIGH (staging)
| Action | RunId | TxId | /api/ledger/:txId | /api/runs/:runId/bundle | Invariante | Resultado |
| --- | --- | --- | --- | --- | --- | --- |
| `realestate.apply_adjustment` | `<run_id>` | `<tx_id>` | PASS/FAIL | PASS/FAIL | OK/BROKEN | PASS/FAIL |
| `realestate.generate_charge` | `<run_id>` | `<tx_id>` | PASS/FAIL | PASS/FAIL | OK/BROKEN | PASS/FAIL |

## Invariantes obrigatorios por execucao
- `invariant.txIdToRunId = true`
- `invariant.runIdToBundleHash = true`
- `invariant.status = ok`
- `reconciliation.runSclAligned = true`
- `reconciliation.runHashAligned = true`

## Evidencias anexadas
- [ ] JSON real de `GET /api/ledger/:txId` (por acao HIGH).
- [ ] JSON real de `GET /api/runs/:runId/bundle` (por acao HIGH).
- [ ] Relatorio consolidado (pass/fail deterministico).
- [ ] Link cruzado no `docs/EVIDENCE_INDEX.md`.

## Resultado consolidado
- Total de acoes HIGH avaliadas: `<n>`
- Pass: `<n>`
- Fail: `<n>`
- Bypass detectado: `<sim/nao>`

## Observacoes operacionais
- Toda divergencia deve registrar reason code oficial no ledger/RunEvent.
- Falha de invariante bloqueia promocao para fechamento de F5.3.
