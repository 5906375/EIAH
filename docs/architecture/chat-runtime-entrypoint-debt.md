# Chat Runtime Entrypoint Debt (F-08)

## Objetivo

Formalizar a dívida residual do runtime de chat: o `ChatAgentLauncher` já opera majoritariamente em modo `render-first`, mas ainda não consome um único entrypoint engine-side para decisão, snapshot e preparação de execução.

## Estado Atual do Launcher

No estado inspecionado em `2026-07-02`, o `ChatAgentLauncher`:

- não importa resolvers verticais profundos (`IMOB`, `LEGAL`, proposal, specialist) diretamente;
- concentra UI, sessão local, SSE/polling, upload e renderização;
- delega a maior parte das regras de decisão para `chatLauncherEngine.ts`;
- ainda chama múltiplos helpers engine-side em vez de um entrypoint único.

Conclusão conservadora:

- o launcher não é mais o centro primário das regras comportamentais;
- a dívida F-08 permanece aberta porque a fronteira `Launcher -> engine` ainda é fragmentada.

## Mapa Launcher -> Engine

Chamadas diretas relevantes encontradas no `ChatAgentLauncher`:

### Decisão e preparação

- `detectLauncherRouteIntent(...)`
- `resolveLauncherEiahUnifiedMode(...)`
- `resolveLauncherAgentProfile(...)`
- `resolveAttachmentIntake(...)`
- `resolveQuickReplyUsed(...)`
- `resolveLauncherTurnDecision(...)`
- `prepareLauncherRunExecution(...)`

### Snapshot e compatibilidade de apresentação

- `createLauncherPresentationSnapshot(...)`
- `createLauncherExecutionSnapshot(...)`
- `resolveLauncherRunSummarySnapshot(...)`
- `resolveSnapshotCompatibleRouteIntent(...)`
- `resolveSnapshotInputPlaceholder(...)`
- `resolveSnapshotQuickReplies(...)`

### Persistência e telemetria auxiliar

- `buildLauncherHelpdeskSessionPayload(...)`
- `buildLauncherPersistenceTelemetry(...)`
- `normalizeLauncherPersistedIntentResult(...)`

## O Que Já Está Evidenciado

- decisão local de help/proposal/handoff/fallback/clarificação concentrada em `chatLauncherEngine.ts`;
- runtime de quick replies governadas protegido por `chatPresentationSnapshot.ts`;
- launcher sem import direto de módulos de regra vertical como `imobContextResolver`, `legalContextResolver` ou `specialistDecisionResolver`;
- gate existente `check:chat-launcher-render-only` já bloqueando alguns desvios estruturais.

## Dívida Residual

Ainda existem resíduos que impedem declarar entrypoint único:

- o launcher resolve intenção de rota antes do entrypoint principal (`detectLauncherRouteIntent`);
- o launcher monta snapshots localmente via helpers múltiplos;
- o launcher ainda chama helpers separados para telemetria, persistência e preparação de run;
- existe greeting de `proposalMode` construído no próprio launcher;
- existe fallback local de placeholder/composer quando não há snapshot resolvido.

Esses pontos não caracterizam nova lógica vertical profunda, mas mantêm acoplamento operacional acima do alvo.

## Arquitetura Alvo

O alvo para fechar F-08 é um entrypoint único engine-side, com forma equivalente a:

- `resolveLauncherTurn(...)` para turnos locais e decisões sem run;
- `resolveLauncherRunPlan(...)` ou campo equivalente retornado pelo mesmo entrypoint para execução remota;
- `presentationSnapshot` sempre retornado pelo engine;
- `persistenceTelemetry` e `sessionPayload` sempre derivados no engine;
- o launcher apenas envia input, repassa contexto operacional e renderiza o resultado.

## Critérios Para Fechar F-08

F-08 só pode ser tratado como fechado quando:

- o launcher consumir um entrypoint engine-side único para decisão do turno;
- snapshots de apresentação não forem mais montados por combinação manual de helpers no launcher;
- greeting/fallback/quick replies/vertical handoff não nascerem localmente no launcher;
- existir gate de CI protegendo a fronteira contra reimport de resolvers profundos;
- a documentação apontar claramente o contrato real desse entrypoint.

## Proibições Normativas

- não adicionar regra nova de specialist/handoff no `ChatAgentLauncher`;
- não adicionar regra vertical profunda no `ChatAgentLauncher`;
- não hardcodar `defaultNextStep` no launcher;
- não injetar `quickReplies` genéricas locais por array hardcoded;
- não importar resolvers de domínio diretamente no launcher quando já existir mediação no engine.

## Guardrails Atuais

- `pnpm check:chat-launcher-render-only`
- `pnpm check:chat-runtime-entrypoint-debt`
- `pnpm check:presentation-snapshot-contract`

## Status

- documentação da dívida: `evidenciado`
- guardrail anti-drift leve: `evidenciado`
- entrypoint único engine-side real: `parcial`
- fechamento completo de F-08: `proposta`
