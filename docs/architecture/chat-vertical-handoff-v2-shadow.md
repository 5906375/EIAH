# Chat Vertical Handoff v2 shadow snapshot

Status: draft/preflight parcial. Este fluxo nao habilita produtor operacional, runtime, frontend ou rollout.

## Fluxo permitido

1. um objeto sintetico conforme `chat.vertical_handoff.v2` entra diretamente no adapter de teste;
2. o adapter aceita somente `source=fixture|shadow`, `mode=read_only` e `outcome=preview_only|blocked`;
3. `fixture` preserva a invariante mais restrita `outcome=preview_only`;
4. o snapshot `chat.vertical_handoff_shadow_snapshot.v1` copia apenas identidade canonica da vertical, capability, presentation, outcome e reasonCode;
5. nenhum produtor, rota, worker, engine, launcher ou surface operacional consome o snapshot nesta fase.

## Redacao

O snapshot nao contem `tenantId`, `workspaceId`, governance, refs, prompt, resposta ou documento bruto. O schema usa `additionalProperties: false`, e payloads v2 com campos livres inesperados sao rejeitados antes da projecao.

O adapter nao chama provider, API, banco, queue, run, ledger, audit, receipt, bundle ou proof. O resultado declara `sideEffects: 0`.

## Bloqueios

- `ChatAgentLauncher` permanece render-only e sem integracao com v2;
- resolver e produtores operacionais permanecem no contrato atual;
- Knowledge Search real e redirect continuam bloqueados;
- snapshots shadow nao constituem evidencia operacional nem autorizam paridade;
- qualquer conexao runtime exige fase e autorizacao posteriores.

## Artefatos

- [Chat Vertical Handoff v2](../../contracts/chat/chat.vertical_handoff.v2.schema.json)
- [Shadow snapshot v1](../../contracts/chat/chat.vertical_handoff_shadow_snapshot.v1.schema.json)
- [Contrato v2](./chat-vertical-handoff-v2.md)
- [Agent Chat Runtime](./agent-chat-runtime.md)
