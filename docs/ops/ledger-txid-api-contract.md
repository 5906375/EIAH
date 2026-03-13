# API Contract — `GET /api/ledger/:txId`

## Objetivo
Consulta pública de auditoria por `txId` com reconciliação fechada:

`txId -> runId -> bundleHash -> /api/runs/:runId/bundle`

## Endpoint
- Método: `GET`
- Rota: `/api/ledger/:txId`
- Auth: token com permissão `ledger.view`
- Regra de formato: `txId` deve seguir `^[A-Za-z0-9-]{16,}$`

## Resposta 200 (resumo)
```json
{
  "ok": true,
  "txId": "tx_...",
  "run": {
    "id": "run_...",
    "workspaceId": "workspace-...",
    "status": "success",
    "txId": "tx_...",
    "sclTxId": "tx_...",
    "criticalHash": "hash_...",
    "bundleHash": "bundle_hash_..."
  },
  "scl": {
    "id": "scl_...",
    "runId": "run_...",
    "txId": "tx_...",
    "criticalHash": "hash_...",
    "signaturePresent": true
  },
  "pou": {
    "matchedByTxId": null,
    "receiptsByRun": []
  },
  "reconciliation": {
    "hasRun": true,
    "hasScl": true,
    "hasPoU": false,
    "runSclAligned": true,
    "runHashAligned": true,
    "matchedPoUByTxId": false,
    "runId": "run_...",
    "bundleHash": "bundle_hash_..."
  },
  "invariant": {
    "txIdToRunId": true,
    "runIdToBundleHash": true,
    "exportBundlePath": "/api/runs/run_.../bundle",
    "status": "ok",
    "reasons": []
  }
}
```

## Resposta 404
Quando `txId` não é encontrado em `runs`, `scl_ledger` e `proof_of_usage`.

```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "txId",
    "reasonCodes": ["txid_not_found"]
  }
}
```

## Resposta 400
Quando `txId` é inválido/vazio.

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_TXID",
    "message": "txId",
    "reasonCodes": ["invalid_txid_format"]
  }
}
```

## Resposta 409
Quando a cadeia canônica de receipt está inconsistente (fail-closed).

```json
{
  "ok": false,
  "error": {
    "code": "RECEIPT_CANON_INCONSISTENT",
    "message": "receiptCanon",
    "reasonCodes": [
      "missing_run_for_txid",
      "missing_bundle_hash_for_run",
      "pou_txid_mismatch",
      "missing_trust_snapshot_for_pou"
    ]
  }
}
```

## Invariante operacional
- `status=ok` somente quando:
  - `txId` resolve `runId`;
  - `runId` tem `bundleHash`;
  - `exportBundlePath` aponta para `/api/runs/:runId/bundle`.
- `status=broken` indica quebra de cadeia e exige reconciliação.

## Exemplo de fluxo externo
1. Cliente recebe `txId`.
2. Chama `GET /api/ledger/:txId`.
3. Obtém `run.id` e `bundleHash`.
4. Chama `GET /api/runs/:runId/bundle`.
5. Verifica `bundleHash` localmente (manifest/hashes).
