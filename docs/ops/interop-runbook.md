# Interop Runbook

## Objetivo
Garantir governanca de interoperabilidade externa (F5.4) com evidencia auditavel e gate de compatibilidade em CI.

## Contrato publico canônico

- Schema: `contracts/agent-protocol.v1.schema.json`
- Baseline: `contracts/agent-protocol.v1.baseline.json`
- Baseline de fluxo: `contracts/interop-discovery.v1.baseline.json`
- Exemplo oficial: `contracts/examples/agent-protocol.v1.example.json`
- Politica de versao: `ops/contracts/agent-protocol-versioning-policy.md`
- Contrato de API: `docs/ops/agent-protocol-api-contract.md`

## Invariantes obrigatorios

- O fluxo publico precisa permanecer `discovery -> negotiate -> execute`.
- A compatibilidade minima publicada e `N,N-1`.
- Breaking change exige `major bump` no contrato publico.
- O baseline e o changelog devem permanecer sincronizados com schema, exemplo e runtime.

## Checks obrigatorios
- `check:agent-protocol-compat`
- `check:interop-contract-matrix`
- `check:interop-spec-governance`
- `check:p2-audit-interop`

## Procedimento semanal
1. Validar matriz de compatibilidade por versao/cenario.
2. Confirmar `specVersion` ativa, politica `N,N-1` e ausencia de breaking sem `major bump`.
3. Validar que o contrato publico continua cobrindo `discovery`, `negotiate` e `execute`.
4. Publicar evidencia em `ops/evidence/latest`.
5. Executar gates no CI antes de promover release.

## Falha comum
- `interop governance doc missing`:
  - Verificar existencia deste arquivo em `docs/ops/interop-runbook.md`.
  - Reexecutar workflow APE Weekly Cycle.
- `interop governance invariant missing`:
  - Verificar se o runbook ainda referencia `N,N-1`, `major bump` e o fluxo `discovery -> negotiate -> execute`.
- `interop matrix scenario missing`:
  - Verificar `contracts/interop-discovery.v1.baseline.json`.

## Saida esperada
- Gate `check:interop-spec-governance` em PASS.
- Gate `check:agent-protocol-compat` em PASS.
- Gate `check:p2-audit-interop` em PASS.
