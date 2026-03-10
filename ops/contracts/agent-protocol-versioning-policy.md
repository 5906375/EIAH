# Agent Protocol Versioning Policy

## Objetivo
Definir regra de compatibilidade para o contrato `agent-protocol.vN`.

## Regra
- `major` (`agent-protocol.vN`): obrigatório para breaking changes.
- `minor/patch`: somente mudanças aditivas e backward-compatible.

## Breaking change
- Remover/renomear campo existente.
- Adicionar campo obrigatório em payload publicado.
- Restringir enum/tipo já publicado.

## Aditivo
- Novo campo opcional.
- Ampliação de enum sem remover valores existentes.
- Metadados extras sem quebrar parsing existente.

## Gate de CI
- Script: `scripts/checkAgentProtocolVersioning.ts`
- Comando: `pnpm check:agent-protocol-compat`
- O gate falha quando:
  - baseline obrigatório diverge do schema atual sem bump de major;
  - exemplo não adere ao schema;
  - changelog/política ausentes.
