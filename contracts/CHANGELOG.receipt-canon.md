# Receipt Canon Changelog

## receipt.canon.v1 — 2026-07-23

- Extensão aditiva `ExecutionStateReceipt`.
- Estados verificáveis: `real`, `blocked` e `historical_simulated`.
- Reason codes de execução: `MCP_TOOL_CONTRACT_MISSING`,
  `SIMULATED_OUTPUT_IN_CRITICAL_CHAIN` e `AUDIT_WRITE_FAILED`.
- Campo aditivo `manifest.execution` em bundles `bundle.v2`.
- Compatibilidade preservada para envelopes v1 sem o novo receipt opcional.
- Evidence Index não alterado nesta rodada, conforme escopo MCP-1J; atualização
  depende de evidência de proveniência pós-merge.
