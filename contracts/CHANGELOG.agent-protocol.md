# Agent Protocol Changelog

## agent-protocol.v1
- Initial public contract for:
  - `POST /api/agents/discovery`
  - `POST /api/agents/negotiate`
  - `POST /api/agents/execute`
- Baseline fields:
  - `action`
  - `version`
  - `tier`
  - `txIdRequired`
  - `inputSchema`
  - `receiptSchema`
  - `trustRequirements`
- Freeze hardening:
  - formalized `txIdRequired` in schema, baseline and official example;
  - CI now cross-checks schema/baseline/example with runtime contract, API contract doc and evidence index linkage.
