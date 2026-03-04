# Interop Runbook

## Objetivo
Garantir governanca de interoperabilidade externa (F5.4) com evidencia auditavel e gate de compatibilidade em CI.

## Checks obrigatorios
- `check:interop-contract-matrix`
- `check:interop-spec-governance`

## Procedimento semanal
1. Validar matriz de compatibilidade por versao/cenario.
2. Confirmar specVersion ativa e politica N/N-1.
3. Publicar evidencia em `ops/evidence/latest`.
4. Executar gates no CI antes de promover release.

## Falha comum
- `interop governance doc missing`:
  - Verificar existencia deste arquivo em `docs/ops/interop-runbook.md`.
  - Reexecutar workflow APE Weekly Cycle.

## Saida esperada
- Gate `check:interop-spec-governance` em PASS.
