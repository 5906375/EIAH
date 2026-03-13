# Reason Codes Catalog (Fonte Oficial)

## Fonte da verdade
- Catálogo oficial: `packages/core/src/reasons/reasonCatalog.ts`
- Tipagem oficial: `ReasonCode`
- Normalização oficial: `normalizeReason()`

## Regra de uso
- `reasonCodes` de receipts/erros/eventos devem usar apenas valores do catálogo oficial.
- Strings ad-hoc em `reasonCodes` são proibidas.
- Valores dinâmicos devem passar por normalização (`normalizeReasonCode`/`normalizeReason`) antes de sair na API.

## Cobertura de ledger/receipt (F5.1/F5.3)
- `invalid_txid_format`
- `txid_not_found`
- `pou_txid_mismatch`
- `missing_trust_snapshot_for_pou`
- `missing_run_for_txid`
- `missing_bundle_hash_for_run`
- `run_txid_mismatch`
- `run_critical_hash_mismatch`
- `missing_scl_for_txid`
- `missing_scl_signature`
- `scl_critical_hash_mismatch`
- `delegation_pending_approval`

## Compatibilidade
- Novos reason codes: mudança aditiva.
- Remoção/renomeação: breaking change.
