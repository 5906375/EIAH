# Receipt Canon v1 — Guia Externo de Consumo e Verificação

## Escopo
Guia para consumidores externos validarem a cadeia:

`txId -> runId -> bundleHash -> receiptCanon`

em `GET /api/ledger/:txId`.

## Pré-requisitos
- Token com permissão `ledger.view`.
- `tenantId`/`workspaceId` válidos no contexto de autenticação.
- `txId` no formato `^[A-Za-z0-9-]{16,}$`.

## Respostas esperadas
- `200`: cadeia válida e `receiptCanon` disponível.
- `400 INVALID_TXID`: formato inválido (`invalid_txid_format`).
- `404 NOT_FOUND`: tx não encontrado (`txid_not_found`).
- `409 RECEIPT_CANON_INCONSISTENT`: fail-closed com `reasonCodes` oficiais.

## Limites operacionais (v1)
- Endpoint retorna até `20` PoU receipts por run (`receiptsByRun`).
- `receiptCanon.specVersion` deve ser `receipt.canon.v1`.
- `reasonCodes` devem ser `string[]` e vir do catálogo oficial.

## Fluxo de verificação (manual)
1. Chamar `GET /api/ledger/:txId`.
2. Confirmar `ok=true`.
3. Confirmar `run.id` e `run.bundleHash`.
4. Confirmar `receiptCanon.specVersion=receipt.canon.v1`.
5. Confirmar `TxLinkReceipt` com mesmo `txId/runId/bundleHash`.
6. Quando existir `PoUReceipt`, confirmar `compositeTxId` e `link(txId/runId/bundleHash)`.
7. (Opcional) baixar `/api/runs/:runId/bundle` e validar `bundleHash`.

## Verificador CLI (repo)
Script: `scripts/verifyReceiptCanon.ts`

### Uso
```bash
pnpm verify:receipt-canon --ledger ops/evidence/s2-ledger-txid-receipt-canon-2026-02-24.json --strict
```

Com bundle:
```bash
pnpm verify:receipt-canon --ledger <ledger.json> --bundle <bundle.json> --strict
```

### Resultado
- Exit `0`: verificação passou.
- Exit `1`: inconsistência detectada (lista de falhas no stdout/stderr).
