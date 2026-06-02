# Help Dictionary Unified Registry — 2026-06-02

## Objetivo

Introduzir a base do registry unificado de help do `EIAH` sem regressão de UX, mantendo o `ChatAgentLauncher` em modo render-first e sem alterar layout visual ou responsividade.

## Escopo implementado

### 1. Núcleo tipado do registry

Novo arquivo:

- `apps/web/src/components/agents/helpDictionary.ts`

Tipos adicionados:

- `HelpDictionaryEntry`
- `HelpDictionaryScope`
- `HelpDictionaryResponse`
- `ResolvedHelpSnapshot`
- `HelpFallbackType`
- `HelpDictionaryAccessContext`

Utilitários adicionados:

- `normalizeMatcherInput(...)`
- `validateHelpDictionaryEntry(...)`
- `entryMatchesInput(...)`
- `sanitizeHelpQuickReplies(...)`

### 2. Registries declarativos iniciais

Novos arquivos:

- `apps/web/src/components/agents/helpDictionary.global.ts`
- `apps/web/src/components/agents/helpDictionary.pages.ts`
- `apps/web/src/components/agents/helpDictionary.verticals.ts`

Cobertura inicial:

- globais:
  - `Explicar plataforma`
  - `plataforma como um todo`
  - `Me mostre o caminho mais rápido`
  - `Qual agente devo usar para meu objetivo?`
  - semântica global de billing/pricing
- páginas:
  - `billing`
  - `marketplace`
  - `economy`
  - `profile`
  - `agents`
  - `chat`
  - `self_service`
- vertical IMOB:
  - onboarding de workspace novo
  - navegação/contexto IMOB
  - pipeline e etapas
  - ativação no Marketplace IMOB

### 3. Resolvedor unificado

Novo arquivo:

- `apps/web/src/components/agents/helpDictionaryResolver.ts`

Ordem implementada:

1. `page`
2. `vertical`
3. `global`
4. fallback opcional

Validações implementadas:

- matcher normalizado
- estrutura mínima das entries
- quick replies sanitizadas/deduplicadas
- gate de entitlement/workspace para entries que exigem contexto

### 4. Integração conservadora no engine

Arquivo editado:

- `apps/web/src/components/agents/chatLauncherEngine.ts`

Comportamento:

- o `engine` consulta o registry unificado antes do fallback legado
- precedência de intent explícita do tutor foi preservada
- `self explain` continua fora do registry, pelo fluxo já existente
- respostas verticais IMOB continuam podendo cair no caminho legado quando isso preserva `kind`/roteamento esperado
- fallback `not_found` do registry não substitui o fallback estrutural já existente do engine

### 5. Cobertura adicionada

Novo teste:

- `apps/web/src/components/agents/helpDictionaryResolver.test.ts`

Casos cobertos:

- precedência `page > global`
- `clarify` para ajuda genérica ambígua
- vertical IMOB com entitlement
- bloqueio IMOB sem entitlement
- fallback global opcional

## Validação executada

Comandos executados com sucesso:

```bash
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/components/agents/helpDictionaryResolver.test.ts
pnpm test:chat-engine
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/components/agents/helpDictionaryResolver.test.ts apps/web/src/components/agents/chatLauncherEngine.test.ts
```

## Observação de rollout

Esta entrega materializa a fundação do registry unificado e já o conecta ao `engine` com fallback compatível.

Limpeza completa do catálogo textual legado em:

- `eiahTutorContracts.ts`
- `platformHelpResolver.ts`
- `imobContextResolver.ts`

permanece como etapa posterior de redução de compat layer, sem regressão funcional nesta frente.
