# IMOB Artifact Capabilities Governance — 2026-07-02

## Data

- 2026-07-02

## Objetivo

- Formalizar capacidades canônicas e fail-closed para separar explicitamente `openChat`, `viewCaseDossier`, `viewCaseReceipt` e `viewRunBundle`.
- Preservar a distinção entre bundle de execução (`run bundle`) e dossiê de caso (`case dossier`).

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `CLAUDE.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/EVIDENCE_INDEX.md`
- `apps/api/src/routes/agents.ts`
- `apps/api/src/routes/imob.ts`
- `apps/api/src/routes/imobCrmRouter.ts`
- `apps/api/src/routes/runs.ts`
- `apps/api/src/middlewares/requireScope.ts`
- `apps/api/src/services/imob/imobAccessGate.ts`
- `apps/api/src/services/imob/imobCaseSnapshotService.ts`
- `apps/api/src/services/imob/imobCaseExportService.ts`
- `apps/api/src/services/imob/imobCanonical.ts`
- `apps/api/src/services/workspaceResponsibility.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/features/imob/imobApiClient.ts`
- `apps/web/src/features/imob/imobArtifactExport.ts`
- `apps/web/src/features/imob/imobCommandCenterHelper.ts`
- `apps/web/src/features/imob/ImobCommandCenter.tsx`
- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/api/src/tests/imob.command-center.smoke.test.ts`
- `apps/api/src/tests/imob-crm-workspace-scope.test.ts`
- `apps/api/src/tests/imob.chat.persistence.contract.test.ts`
- `apps/api/src/tests/require-scope.fail-closed.test.ts`
- `apps/api/src/tests/runArchiveService.test.ts`

## Arquivos criados/alterados

- `apps/api/src/services/imob/imobArtifactCapabilities.ts`
- `apps/api/src/routes/agents.ts`
- `apps/api/src/routes/imob.ts`
- `apps/api/src/routes/imobCrmRouter.ts`
- `apps/api/src/tests/imob-artifact-capabilities.test.ts`
- `apps/api/src/tests/imob.command-center.smoke.test.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/features/imob/imobCommandCenterHelper.ts`
- `apps/web/src/features/imob/ImobCommandCenter.tsx`
- `apps/web/src/features/imob/ImobCommandCenter.test.tsx`
- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/pages/app/imob/chat.runBundleCapability.test.ts`

## Capacidades canônicas introduzidas

- `canOpenChat`
- `canViewCaseDossier`
- `canViewCaseReceipt`
- `canViewRunBundle`

### Regras

- `openChat`, `caseDossier` e `caseReceipt` exigem contexto IMOB/caso e permissão de estágio do workspace.
- `runBundle` permanece artefato distinto do caso e depende de `reports.view`.
- UI opera fail-closed: ausência da capability ou `allowed !== true` oculta CTA ou renderiza estado bloqueado.

## Separação dossier vs run bundle

- O CTA do chat IMOB deixou de tratar `/api/runs/:id/bundle` como “dossiê”.
- O rótulo local foi rebaixado para `Ver bundle da execução`.
- O Command Center mantém dossiê/receipt do caso separados dos comprovantes do run.

## Testes e checks executados

### 1. `pnpm check:imob-knowledge-base`

```text
{
  "ok": true,
  "check": "check:imob-knowledge-base",
  "entryCount": 5
}
Validated 5 category file(s).
```

### 2. `pnpm check:imob-knowledge-shadow`

```text
{
  "ok": true,
  "check": "check:imob-knowledge-shadow",
  "totalScenarios": 10,
  "matchedScenarios": 8,
  "metrics": {
    "provenanceCoverage": 1,
    "knowledgeContextErrorRate": 0,
    "auditGap": 0,
    "duplicateSideEffects": 0
  }
}
```

### 3. Frontend tests focados

Comando:

```text
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/features/imob/ImobCommandCenter.test.tsx apps/web/src/pages/app/imob/chat.userEcho.test.ts apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts apps/web/src/pages/app/imob/chat.slotCollectionHistory.test.ts apps/web/src/pages/app/imob/chat.runBundleCapability.test.ts
```

Saída resumida real:

```text
# tests 5
# pass 5
# fail 0
```

### 4. Backend unit test focado

Comando:

```text
DATABASE_URL='postgresql://postgres:senha@127.0.0.1:5433/eiah_builder?schema=public' node --import tsx --test --test-force-exit apps/api/src/tests/imob-artifact-capabilities.test.ts
```

Saída resumida real:

```text
# tests 4
# pass 4
# fail 0
```

## Limitação encontrada nos testes HTTP da API

Os testes HTTP que bootam `apps/api/src/index.ts` não ficaram verdes neste PR por bloqueio pré-existente de ambiente/build fora do escopo.

### Erro real 1 — artefato ausente no core buildado

```text
Cannot find module '/home/jusall/projects/EIAH_BUILDER/apps/api/node_modules/@eiah/core/dist/queue/workerTopology.js' imported from /home/jusall/projects/EIAH_BUILDER/apps/api/src/index.ts
```

Confirmação de origem:

- `apps/api/src/index.ts` importa `@eiah/core/queue/workerTopology`.
- `packages/core/dist/queue/` e `apps/api/node_modules/@eiah/core/dist/queue/` não contêm `workerTopology.js` no estado atual do workspace.

### Erro real 2 — acesso local ao Postgres no sandbox

```text
connect EPERM 127.0.0.1:5433
```

Consequência:

- `apps/api/src/tests/imob.command-center.smoke.test.ts`
- `apps/api/src/tests/imob-crm-workspace-scope.test.ts`
- `apps/api/src/tests/imob.chat.persistence.contract.test.ts`

ficaram sem evidência HTTP completa neste PR.

## Conclusão conservadora

- A governança canônica das capabilities foi implementada e coberta por teste unitário/backend e teste focado/frontend.
- A UI IMOB agora falha fechado para chat/dossiê/receipt quando a capability não vier permitida.
- O bundle de execução deixou de ser comunicado como dossiê de caso.
- A trilha HTTP integrada da API permaneceu parcial por bloqueio pré-existente de build/sandbox fora do escopo deste PR.

## Status

- `evidenciado` para a correção de governança/capabilities e fail-closed da UI.
- `parcial` para a validação HTTP integrada ponta a ponta.

