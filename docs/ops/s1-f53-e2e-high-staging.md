# Sprint 1 — F5.3 E2E HIGH em Staging (Run -> SCL -> PoU -> txId -> bundle)

## Objetivo
Validar cadeia completa para ações `criticality=HIGH` em staging, sem bypass, com resultado determinístico (pass/fail).

## Escopo
- Rotas de evidência:
  - `GET /api/ledger/:txId`
  - `GET /api/runs/:runId/bundle`
- Invariante obrigatório:
  - `txId -> runId -> bundleHash -> bundle export`

## Matriz de execução (HIGH)

> Preencher com a matriz oficial da sprint.

| Action | RunId | TxId | Resultado | Invariante |
| --- | --- | --- | --- | --- |
| `realestate.apply_adjustment` | `<run_id>` | `<tx_id>` | PASS/FAIL | OK/BROKEN |

## Procedimento por caso
1. Executar ação HIGH em staging e capturar `runId`/`txId`.
2. Chamar `GET /api/ledger/:txId`.
3. Validar:
   - `invariant.status = ok`
   - `invariant.txIdToRunId = true`
   - `invariant.runIdToBundleHash = true`
4. Chamar `GET /api/runs/:runId/bundle`.
5. Confirmar `bundleHash` igual ao retorno de `/api/ledger/:txId`.
6. Registrar PASS/FAIL e reason code quando houver falha.

## Critérios de aceite S1-01
- 100% das ações HIGH da matriz executam com cadeia completa.
- Nenhum fluxo HIGH passa sem `txId` + reconciliação.
- Evidência anexada no `EVIDENCE_INDEX`.

## Evidências mínimas esperadas
- Captura JSON real de `/api/ledger/:txId`.
- Captura JSON real de `/api/runs/:runId/bundle`.
- Relatório consolidado da execução.
