# IMOB Directed Action Confirmation Binding (2026-06-25)

## Contexto

- `CODEX.md` foi lido antes de qualquer alteração.
- Fontes normativas consultadas:
  - `CODEX.md`
  - `IA_EIAH.md`
  - `AGENTS.md`
  - `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
  - `docs/architecture/agent-chat-runtime.md`
  - `docs/architecture/imob-crm-governed-runtime.md`
  - `docs/architecture/imob-dedicated-chat-runtime.md`
  - `docs/architecture/vertical-context-imob.md`
  - `docs/ops/reason-codes-catalog.md`
  - `docs/EVIDENCE_INDEX.md`

## Problema observado

No fluxo dirigido do Command Center IMOB, a confirmação textual livre (`confirmo`, `confirmar`, `sim`, `ok`) não estava vinculada a uma ação pendente canônica persistida no backend.

Na prática:

1. o frontend mantinha `pendingExecution` principalmente em estado React local;
2. o CTA `Confirmar execução` seguia um caminho específico;
3. o texto livre `confirmo` entrava no fluxo normal do engine;
4. isso permitia drift para outra jornada, incluindo troca indevida para `cadastrar imóvel` ou `agendar visita`.

## Correção implementada

Foi introduzida uma `pendingAction` canônica no runtime/contrato IMOB, persistida no backend e usada pelo engine antes de qualquer reclassificação de intenção.

### Contrato canônico

`apps/api/src/services/imob/imobConversationContract.ts`

- `ImobPendingAction`
- `ImobPendingActionStatus`
- `ImobPendingActionEntityType`
- `ImobPendingActionSource`
- `pendingAction?: ImobPendingAction | null` em `ImobOperationalState`

Campos canônicos usados:

- `actionId`
- `sourceActionId`
- `caseId`
- `threadId`
- `reasonCode`
- `status`
- `createdAt`
- `expiresAt`
- `entityType`
- `journey`
- `source`

### Runtime canônico

`apps/api/src/services/imob/crm/imobPendingActionRuntime.ts`

- centraliza build/parse/validation de `pendingAction`
- define o mapa canônico `actionId -> entityType -> journey`
- expõe helpers para:
  - construir a ação pendente
  - validar expiração
  - detectar confirmação textual
  - produzir bloqueio fail-closed
  - resolver a execução a partir da ação pendente confirmada

### Dispatcher + Engine + Persistência

- `apps/api/src/services/imob/crm/imobCrmActionDispatcher.ts`
  - passa a exigir `threadId`
  - cria `pendingAction` canônica no dispatch dirigido
  - preserva `sourceActionId`
- `apps/api/src/services/imob/crm/imobCrmTurnEngine.ts`
  - intercepta afirmações textuais antes de `workflowGuard` e antes de reclassificação
  - confirma somente a `pendingAction` válida e única
  - bloqueia fail-closed quando há ausência, expiração, mismatch ou ambiguidade
- `apps/api/src/services/imob/crm/imobCrmMutationService.ts`
  - persiste `pendingAction` em `metadata`
- `apps/api/src/routes/imob.ts`
  - hidrata `pendingAction` canônica a partir do caso
  - preserva `threadId`
  - reaproveita a mesma base canônica para CTA e texto livre

## Como `confirmo` é resolvido agora

1. o engine recebe o estado canônico e a `canonicalPendingAction`;
2. antes de classificar uma nova intenção, verifica se a mensagem é uma confirmação afirmativa;
3. se existe `pendingAction` válida e consistente:
   - confirma exatamente aquela ação;
   - preserva `actionId`, `sourceActionId`, `caseId`, `threadId`, `entityType` e `journey`;
   - não reclassifica do zero;
   - não cai em visita por continuidade residual;
4. se não existe `pendingAction` válida:
   - bloqueia fail-closed;
   - retorna reason code seguro;
   - não executa outro fluxo.

## Reason codes implementados

Em `apps/api/src/services/imob/control/imobReasonCodeCatalog.ts`:

- `PENDING_ACTION_MISSING`
- `PENDING_ACTION_MISMATCH`
- `PENDING_ACTION_EXPIRED`
- `CONFIRMATION_TARGET_AMBIGUOUS`
- `DIRECTED_ACTION_CONTEXT_LOST`
- `DIRECTED_ACTION_ENTITY_MISMATCH`
- `DIRECTED_ACTION_JOURNEY_MISMATCH`

## Arquivos alterados

- `apps/api/src/routes/imob.ts`
- `apps/api/src/services/imob/control/imobReasonCodeCatalog.ts`
- `apps/api/src/services/imob/crm/imobCrmActionDispatcher.ts`
- `apps/api/src/services/imob/crm/imobCrmMutationService.ts`
- `apps/api/src/services/imob/crm/imobCrmTurnEngine.ts`
- `apps/api/src/services/imob/imobConversationContract.ts`
- `apps/api/src/tests/imob-crm-action-dispatcher.test.ts`
- `apps/api/src/tests/imob-crm-turn-engine.test.ts`
- `apps/api/src/tests/imob-realestate-action-contracts-11.test.ts`

## Arquivos criados

- `apps/api/src/services/imob/crm/imobPendingActionRuntime.ts`

## Testes adicionados ou reforçados

Cobertura regressiva adicionada/ajustada para:

- owner pending action + `confirmo` confirma owner
- property pending action + `confirmo` confirma property
- visit pending action + `confirmo` confirma visit
- `confirmo` sem pending action retorna `PENDING_ACTION_MISSING`
- mismatch de thread/canonical state bloqueia com fail-closed
- divergência entre pending action do cliente e a canônica bloqueia com `CONFIRMATION_TARGET_AMBIGUOUS`
- divergência de jornada ativa bloqueia com `DIRECTED_ACTION_JOURNEY_MISMATCH`
- ações dirigidas do Command Center preservam `sourceActionId`

## Comandos executados

### Passaram

```bash
node --import tsx -e "import('./apps/api/src/tests/imob-crm-action-dispatcher.test.ts')"
```

Resultado:

- 16/16 testes passaram

```bash
node --import tsx -e "import('./apps/api/src/tests/imob-crm-turn-engine.test.ts')"
```

Resultado:

- 39/39 testes passaram

```bash
pnpm --filter @eiah/core build
```

Resultado:

- build concluído com sucesso

### Falharam por bloqueio pré-existente

```bash
pnpm --filter @repo/db build
```

Resultado:

- falha com `EACCES` ao tentar remover `packages/db/dist/generated/client/client.d.ts`
- causa observada: artefatos pré-existentes em `packages/db/dist` com ownership/permissão incompatíveis (`nobody:nogroup`)

```bash
node --import tsx -e "import('./apps/api/src/routes/imob.ts').then(()=>console.log('route-import-ok'))"
```

Resultado:

- bloqueado porque `@repo/db/dist/index.js` não está disponível
- causa raiz permanece a falha pré-existente do build de `@repo/db`

```bash
pnpm exec tsc -p apps/api/tsconfig.json --noEmit
```

Resultado:

- saída com baseline amplo e ruído pré-existente do repositório
- não foi usada como sinal de aceite desta correção específica

## Confirmações arquiteturais

- `ChatAgentLauncher` não foi alterado.
- Nenhuma regra cognitiva nova foi colocada no launcher.
- Billing não foi alterado.
- Economy não foi alterado.
- Entitlements não foram alterados.
- Catálogo estrutural não foi alterado.
- A correção permaneceu no contrato/runtime/engine IMOB.
- CTA e texto livre convergem semanticamente para a mesma base canônica de confirmação.

## Limitações / pendências

- A validação por import da rota completa ficou bloqueada por problema pré-existente de build/permissão em `packages/db/dist`.
- O reparo de ownership/permissão do pacote `@repo/db` deve acontecer em frente separada antes de usar esse build como gate confiável local.

## Decisão desta evidência

Status: `PARCIAL AVANÇADO`

Motivo:

- a correção canônica de binding da confirmação foi implementada e validada por testes focados do dispatcher e do engine;
- o fechamento completo de import/build da rota depende de um bloqueio pré-existente fora do escopo desta correção.
