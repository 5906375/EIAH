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

Uma resposta `409` de execução bloqueada é evidência verificável quando contém
`ExecutionStateReceipt(state=blocked)` e o mesmo `reasonCode` na resposta e no
receipt. O CLI valida essa coerência sem converter o bloqueio em execução
bem-sucedida.

## Limites operacionais (v1)
- Endpoint retorna até `20` PoU receipts por run (`receiptsByRun`).
- `receiptCanon.specVersion` deve ser `receipt.canon.v1`.
- `reasonCodes` devem ser `string[]` e vir do catálogo oficial.
- `ExecutionStateReceipt`, quando presente, distingue `real`, `blocked` e
  `historical_simulated`.
- `historical_simulated` nunca valida como cadeia crítica real; o CLI falha com
  `SIMULATED_OUTPUT_IN_CRITICAL_CHAIN`.
- O manifest do bundle exportado contém `execution.state`,
  `execution.reasonCodes` e `execution.containsHistoricalSimulatedOutput`.

## Fluxo de verificação (manual)
1. Chamar `GET /api/ledger/:txId`.
2. Confirmar `ok=true` para execução real, ou `ok=false` com bloqueio governado.
3. Confirmar `run.id` e `run.bundleHash`.
4. Confirmar `receiptCanon.specVersion=receipt.canon.v1`.
5. Confirmar `TxLinkReceipt` com mesmo `txId/runId/bundleHash`.
6. Quando existir `PoUReceipt`, confirmar `compositeTxId` e `link(txId/runId/bundleHash)`.
7. (Opcional) baixar `/api/runs/:runId/bundle` e validar `bundleHash`.
8. Comparar o estado e os `reasonCodes` do `ExecutionStateReceipt` com
   `manifest.execution` do bundle.

## Verificador CLI (repo)
Script oficial: `scripts/verify-receipt-canon.ts`  
Compatibilidade legada: `scripts/verifyReceiptCanon.ts`

O launcher oficial usa `node --import tsx`; fonte TypeScript é validada
diretamente, sem depender de `.js` local ou de type stripping experimental.

### Uso
```bash
pnpm verify:receipt-canon --ledger ops/evidence/s2-ledger-txid-receipt-canon-2026-02-24.json --strict
```

Via endpoint:
```bash
pnpm verify:receipt-canon --url http://localhost:8080/api/ledger/<txId> --token <bearer> --strict
```

Com bundle:
```bash
pnpm verify:receipt-canon --ledger <ledger.json> --bundle <bundle.json> --strict
```

### Resultado
- Exit `0`: execução real coerente ou bloqueio governado coerente.
- Exit `1`: inconsistência detectada (lista de falhas no stdout/stderr).
- Output simulado histórico sempre produz exit `1`, embora continue legível.
