# ARCH-IMPL-1 — Read-Only Handoff Snapshot Producer

Status: parcial/evidenciado localmente; aguardando PR/CI remoto.

## Escopo

ARCH-IMPL-1 cria um producer read-only para snapshots `chat.vertical_handoff.v1`, validado contra o contrato físico `contracts/chat/chat.vertical_handoff.v1.schema.json` criado em ARCH-IMPL-0.

## Producer

O producer está em `apps/api/src/services/chatVerticalHandoffSnapshot.ts` e expõe:

- `buildChatVerticalHandoffSnapshot(input)`
- `validateChatVerticalHandoffSnapshotAgainstSchema(snapshot)`

Ele recebe input explícito, monta `version: "chat.vertical_handoff.v1"`, gera `handoffId` determinístico quando não fornecido, valida campos obrigatórios, valida contra o schema físico e retorna `sideEffects: 0`.

## Fail-closed

O producer retorna `{ ok: false }` sem side effects quando faltam campos mínimos:

- `tenantId`
- `workspaceId`
- `scope`
- `userId`
- `verticalId`
- `intentId`
- `handoffMessage`
- `reasonCode`
- `riskLevel`

Também bloqueia `riskLevel: "critical"` quando `hitlRequired !== true`.

## Validação

O teste `apps/api/src/tests/chat-vertical-handoff-snapshot.test.ts` cobre:

- happy path IMOB read-only;
- campos obrigatórios ausentes;
- critical risk sem HITL;
- validação contra schema físico;
- bloqueio de enum inválido pelo schema;
- `sideEffects=0` e ausência de chamadas externas/mutacionais.

## Boundaries

- Sem frontend.
- Sem alteração em `ChatAgentLauncher`.
- Sem render surface.
- Sem endpoint público novo.
- Sem provider externo.
- Sem secret produtivo.
- Sem webhook produtivo.
- Sem DB write.
- Sem ledger/audit write.
- Sem receipt/bundle gerado.
- Sem shadow, pilot ou small.

## Relação com ARCH-CHAT-8

ARCH-CHAT-8 apontou o producer físico de handoff como P1 ausente. ARCH-IMPL-1 reduz esse gap criando apenas o producer read-only e testado. Não cria renderização universal, não inicia rollout e não fecha Receipt Canon.

## Próximo passo

ARCH-IMPL-2 pode consumir snapshots validados para uma render surface universal read-only, mantendo `ChatAgentLauncher` como render-only. Essa etapa futura continua bloqueada até PR próprio, evidência própria e checks próprios.
