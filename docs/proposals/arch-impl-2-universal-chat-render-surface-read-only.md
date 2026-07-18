# ARCH-IMPL-2 — Universal Chat Render Surface Read-only

Status: parcial/evidenciado localmente; aguardando PR/CI remoto.

## Escopo

ARCH-IMPL-2 cria uma superfície universal de renderização read-only para snapshots validados `chat.vertical_handoff.v1`.

Esta entrega não integra a superfície ao `ChatAgentLauncher`, não altera regra cognitiva, não decide policy no frontend, não chama API/provider, não cria mutação e não inicia shadow, pilot ou small.

## Pré-condição ARCH-IMPL-1a

Pré-condição registrada para esta execução:

- ARCH-IMPL-1a mergeado em `dad03f626dffc88a24a1a7d991e48a6fccf4d734`.
- CI Monorepo run `29613536568`: `completed success`.
- IMOB Worker Mutation E2E run `29613536591`: `completed success`.
- Job `ChatEngineRegression`: `completed success`.
- Step `Run ARCH chat physical contracts gate`: `completed success`.
- Step `Run chat vertical handoff snapshot test`: `completed success`.

## Estado atual observado

- `/app/chat` roteia para `AgentsPage` dentro de `RequireAuth`, preservando o chat universal como superfície autenticada em `apps/web/src/App.tsx:299`.
- `ChatAgentLauncher` é o componente de launcher atual e mantém mensagens com `presentationSnapshot` em `apps/web/src/components/agents/ChatAgentLauncher.tsx:64`.
- O launcher renderiza markdown da resposta já resolvida em `apps/web/src/components/agents/ChatAgentLauncher.tsx:1867`, e quick replies já vindas do snapshot em `apps/web/src/components/agents/ChatAgentLauncher.tsx:1913`.
- O contrato físico `chat.vertical_handoff.v1` exige `verticalId`, `handoffMessage`, `reasonCode`, `riskLevel` e `hitlRequired` em `contracts/chat/chat.vertical_handoff.v1.schema.json:5`.
- O producer read-only expõe `buildChatVerticalHandoffSnapshot` e retorna `sideEffects: 0` em `apps/api/src/services/chatVerticalHandoffSnapshot.ts:60`.
- O teste do producer cobre ausência de chamadas externas/mutacionais em `apps/api/src/tests/chat-vertical-handoff-snapshot.test.ts:130`.
- O CI Monorepo agora executa `Run chat vertical handoff snapshot test` no job `ChatEngineRegression` em `.github/workflows/ci.yml:292`.

## Render surface

Componente criado:

- `apps/web/src/components/chat/ChatVerticalHandoffSurface.tsx`

Responsabilidade:

- receber snapshot validado como prop;
- renderizar apenas `verticalId`, `handoffMessage`, `reasonCode`, `riskLevel`, `hitlRequired` e `renderHints`;
- renderizar estado neutro quando o snapshot estiver ausente;
- exibir `critical + hitlRequired` como aviso visual sem aprovação;
- exibir `renderHints` apenas como apresentação;
- manter acessibilidade básica por `section` e `aria-label`.

## Boundaries

- Não cria ou altera `handoffId`.
- Não infere vertical por texto.
- Não decide policy, entitlement ou RBAC.
- Não expõe botão mutacional.
- Não chama API.
- Não chama provider externo.
- Não gera receipt/bundle.
- Não escreve ledger/audit.
- Não inicia shadow.
- Não altera `ChatAgentLauncher`.
- Não altera runtime ou engine.

## Testes

Teste criado:

- `apps/web/src/components/chat/ChatVerticalHandoffSurface.test.tsx`

Cobertura:

- snapshot IMOB válido renderiza contexto read-only;
- snapshot ausente renderiza estado neutro;
- `critical + hitlRequired` renderiza aviso visual sem approval;
- `renderHints` aparecem como apresentação, não policy;
- ausência de botão/handler mutacional;
- ausência de chamada API/provider durante render;
- acessibilidade básica.

O script `test:chat-vertical-handoff-surface` foi registrado em `package.json` para tornar o teste canônico e evitar orphan test sem alterar allowlist.

## Não-autorização

ARCH-IMPL-2 não declara WhatsApp operacional, não declara IMOB operacionalmente fechado, não inicia rollout, não inicia shadow/pilot/small e não declara Receipt Canon fechado.
