# Chat Launcher Help Priority — 2026-06-01

## Objetivo

Endurecer o front door `EIAH` no `Chat Launcher` sem adicionar regra nova no `ChatAgentLauncher`, mantendo o modelo `agent-driven`:

1. contrato do agente
2. execução no `engine`
3. launcher apenas renderiza

## Escopo implementado

### 1. Fechamento de quick replies quebradas

Casos que deixaram de cair em `needs_run`, `capabilities_summary` genérico ou fallback implícito:

- `Explicar plataforma`
- `plataforma como um todo`
- `Explicar agentes`
- `Explicar Billing`
- `Explicar Chat IMOB`
- `Me mostre o caminho mais rápido`
- `Quero ver agentes disponíveis`
- `Qual agente devo usar para meu objetivo?`

### 2. Precedência explícita do tutor

Intents exatas do tutor agora vencem heurísticas amplas do engine quando necessário, inclusive fora da rota `help`, evitando regressão para:

- `isEiahCapabilitiesQuestion()`
- handoff genérico
- captura indevida por contexto vertical

### 3. Tipos mínimos de resolução

Foram introduzidos contratos internos mínimos para o fluxo de help:

- `ResolvedIntent`
- `ResolvedHelpSnapshot`
- `ConversationState`
- `HelpFallbackType`
- `HelpResolutionType`

### 4. Fallback tipado

O engine agora distingue explicitamente:

- `clarify`
- `blocked`
- `not_found`

Esses estados ficam registrados em `conversationState.lastFallbackType`.

### 5. Validação de quick replies antes de renderizar

Quick replies do EIAH passam a ser filtradas no engine. Um chip só é emitido se tiver rota semântica válida via:

- `resolveEiahTutorContractResponse(...)`
- ou `buildDeterministicHelpReply(...)`

### 6. Prioridade explícita de resolução

O fluxo de help do EIAH passou a seguir ordem explícita:

1. `surface/page`
2. `global explícito do tutor`
3. `vertical`
4. `global`
5. `fallback`

Implementação atual:

- `surface/page`: `buildDeterministicHelpReply(...)`
- `vertical`: `resolveImobLauncherSurfaceDecision(...)`
- `global`: `resolveEiahTutorContractResponse(...)`

### 7. Respostas contextuais de acesso e agentes

Quando `tenantId` e `workspaceId` já estão presentes:

- `Verificar acesso` não repete `confirme o workspace`
- `Quero ver agentes disponíveis` foca em:
  - entitlement/acesso
  - módulo/vertical ativa
  - recarga da lista no chat

## Arquivos alterados nesta frente

- `apps/web/src/components/agents/chatLauncherEngine.ts`
- `apps/web/src/components/agents/eiahTutorContracts.ts`
- `apps/web/src/components/agents/platformHelpResolver.ts`
- `apps/web/src/components/agents/imobContextResolver.ts`
- `apps/web/src/components/agents/chatLauncherEngine.test.ts`

## Critérios observáveis fechados

- chips do EIAH agora resolvem para respostas reais
- perguntas amplas podem cair em `clarify`
- bloqueios por entitlement são classificados como `blocked`
- fallback genérico vira `not_found`
- quick reply inválida deixa de ser emitida
- surface/page pode vencer global quando aplicável
- intents explícitas do tutor podem vencer heurística ampla
- acesso/agentes usam melhor o contexto já conhecido

## Validação executada

Comandos executados com sucesso:

```bash
pnpm test:web-chat-launcher
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/components/agents/chatLauncherEngine.test.ts
```

## Observação de escopo

Este artefato cobre apenas a frente de hardening do `EIAH` no `Chat Launcher`.

O working tree local ainda contém outra trilha separada de UI/documentação:

- `apps/web/src/pages/app/runs/index.tsx`
- `apps/web/src/pages/app/runs/imobCommandCenter.ts`
- `apps/web/src/pages/app/runs/index.test.ts`
- `apps/web/src/pages/self-service/index.tsx`

Esses arquivos devem ser revisados e commitados separadamente da frente de help do EIAH.
