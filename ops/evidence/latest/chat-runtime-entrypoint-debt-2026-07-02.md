# Chat Runtime Entrypoint Debt — 2026-07-02

## Data

- 2026-07-02

## Arquivos inspecionados

- `CLAUDE.md`
- `CODEX.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/architecture/chat-runtime-entrypoint-debt.md`
- `apps/web/src/components/agents/ChatAgentLauncher.tsx`
- `apps/web/src/components/agents/chatLauncherEngine.ts`
- `apps/web/src/components/agents/chatPresentationSnapshot.ts`
- `apps/web/src/components/agents/chatLauncherEngine.test.ts`
- `apps/api/src/tests/agent-chat-runtime-readiness.test.ts`
- `package.json`
- `.github/workflows/ci.yml`

## Chamadas Launcher -> engine encontradas

Diretas no `ChatAgentLauncher`:

- `detectLauncherRouteIntent(...)`
- `resolveLauncherEiahUnifiedMode(...)`
- `resolveLauncherAgentProfile(...)`
- `resolveAttachmentIntake(...)`
- `resolveQuickReplyUsed(...)`
- `resolveLauncherTurnDecision(...)`
- `prepareLauncherRunExecution(...)`
- `createLauncherPresentationSnapshot(...)`
- `createLauncherExecutionSnapshot(...)`
- `resolveLauncherRunSummarySnapshot(...)`
- `resolveSnapshotCompatibleRouteIntent(...)`
- `resolveSnapshotInputPlaceholder(...)`
- `resolveSnapshotQuickReplies(...)`
- `buildLauncherHelpdeskSessionPayload(...)`
- `buildLauncherPersistenceTelemetry(...)`
- `normalizeLauncherPersistedIntentResult(...)`

## Conclusão sobre lógica comportamental

- Estado atual: majoritariamente `render-first`.
- Não foram encontrados imports diretos do launcher para resolvers verticais profundos como `imobContextResolver`, `legalContextResolver` ou `specialistDecisionResolver`.
- A maior parte das decisões de help/proposal/handoff/fallback/clarificação já passa por `chatLauncherEngine.ts`.
- A dívida F-08 continua aberta porque ainda não existe entrypoint único engine-side; o launcher chama múltiplos helpers para decisão, snapshot e preparação de execução.

## Check criado

- `scripts/checkChatRuntimeEntrypointDebt.ts`
- Script exposto como `pnpm check:chat-runtime-entrypoint-debt`
- Script conectado ao job `ChatEngineRegression` em `.github/workflows/ci.yml`

O guardrail novo bloqueia:

- import direto no launcher de resolvers comportamentais profundos;
- hardcode de `defaultNextStep`;
- injeção local de `quickReplies` por array literal;
- chamadas diretas de decisão de specialist/handoff/vertical fora do engine.

## Saídas reais dos checks

### `pnpm check:chat-runtime-entrypoint-debt`

```text
> eiah-builder@ check:chat-runtime-entrypoint-debt /home/jusall/projects/EIAH_BUILDER
> node --import tsx scripts/checkChatRuntimeEntrypointDebt.ts

{
  "ok": true,
  "check": "check:chat-runtime-entrypoint-debt",
  "checkedFile": "apps/web/src/components/agents/ChatAgentLauncher.tsx",
  "violations": [],
  "summary": {
    "deepImportsBlocked": [
      "imobContextResolver",
      "legalContextResolver",
      "proposalDomainResolver",
      "specialistDecisionResolver",
      "specialistExplainCatalog",
      "platformHelpResolver",
      "agentPresentationResolver",
      "helpDictionaryResolver",
      "eiahTutorContracts"
    ],
    "directDecisionCallsBlocked": [
      "resolveSpecialistAvailability",
      "canSuggestAgent",
      "canHandoffToAgent",
      "buildSuggestedAgentReply",
      "buildSpecialistExplainReply",
      "resolveSpecialistExplainTarget",
      "resolveImobJourneyStage",
      "resolveLegalJourneyStage",
      "resolveImobVerticalContext",
      "resolveLegalVerticalContext",
      "shouldRouteToImob",
      "isLegalRoutingQuestion"
    ],
    "literalPatternsBlocked": [
      "defaultNextStep",
      "quickReplies: [",
      "const ...quickReplies... = ["
    ]
  }
}
```

### `pnpm check:chat-launcher-render-only`

```text
> eiah-builder@ check:chat-launcher-render-only /home/jusall/projects/EIAH_BUILDER
> node --import tsx scripts/checkChatLauncherRenderOnly.ts

{
  "ok": true,
  "check": "check:chat-launcher-render-only",
  "checkedFile": "apps/web/src/components/agents/ChatAgentLauncher.tsx",
  "violations": []
}
```

### `pnpm check:docs-link-integrity`

```text
> eiah-builder@ check:docs-link-integrity /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkDocsLinkIntegrity.ts

{
  "ok": true,
  "check": "check:docs-link-integrity",
  "filesChecked": 11,
  "targets": [
    "AGENTS.md",
    "CLAUDE.md",
    "CODEX.md",
    "IA_EIAH.md",
    "docs/architecture/adr-imob-journey-governed-by-case.md",
    "docs/architecture/agent-chat-runtime.md",
    "docs/architecture/chat-runtime-entrypoint-debt.md",
    "docs/architecture/imob-crm-governed-runtime.md",
    "docs/architecture/p3-economy-hardening-closure.md",
    "docs/architecture/presentation-snapshot-v1.md",
    "docs/architecture/worker-topology.md"
  ]
}
(node:19) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
```

### `pnpm check:evidence-index` antes da evidência existir

```text
> eiah-builder@ check:evidence-index /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkEvidenceIndex.ts

{
  "ok": false,
  "check": "check:evidence-index",
  "message": "EVIDENCE_INDEX has missing file references",
  "details": {
    "missingCount": 1,
    "missingRefs": [
      "ops/evidence/latest/chat-runtime-entrypoint-debt-2026-07-02.md"
    ]
  }
}
```

### `pnpm check:evidence-index` após criar a evidência

```text
> eiah-builder@ check:evidence-index /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkEvidenceIndex.ts

{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 118961,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 349
}
(node:19) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
```

## Status conservador

- documentação/check do PR-7: `evidenciado`
- dívida F-08 de entrypoint único: `parcial`
- arquitetura alvo futura de entrypoint único: `proposta`
