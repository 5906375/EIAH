# IMOB slotCollection history fix — 2026-07-02

## Confirmação de leitura inicial de `CODEX.md`

`CODEX.md` foi lido antes de qualquer diff, seguido de `IA_EIAH.md`, `CLAUDE.md`, `AGENTS.md`, `docs/architecture/agent-chat-runtime.md`, `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md` e `docs/EVIDENCE_INDEX.md`.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `CLAUDE.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/EVIDENCE_INDEX.md`
- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts`
- `apps/web/src/pages/app/imob/chat.userEcho.test.ts`
- `apps/web/src/pages/app/imob/chat.formSubmission.test.ts`
- `apps/web/src/features/workbench/vertical-chat/ImobSlotCollectionCard.tsx`
- `apps/web/src/features/workbench/vertical-chat/imobChatPresentationGuards.ts`
- `apps/web/src/features/workbench/vertical-chat/ImobSlotCollectionCard.test.tsx`
- `apps/api/src/services/imob/imobConversationContract.ts`
- `apps/api/src/services/imob/imobTurnResolver.ts`

## Bug confirmado

Confirmado em `apps/web/src/pages/app/imob/chat.tsx`:

- o reply assistente live ja carregava `turn.presentation.slotCollection`;
- o renderer do historico ja sabia consumir `message.slotCollection`;
- `persistMessage(...)` nao serializava `slotCollection` em `metadata`;
- `mapStoredMessageToChat(...)` nao restaurava `slotCollection` na reconstrucao do historico.

Resultado: apos reload/rebuild, o card/form de coleta deixava de existir mesmo quando o turno live tinha `slotCollection`.

## Causa raiz

O bug era puramente de persistencia/reconstrucao no frontend:

1. `slotCollection` entrava no estado local live;
2. o payload persistido descartava esse campo;
3. o caminho de restore do historico nao tentava reidratá-lo.

## Arquivos alterados

- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/pages/app/imob/chat.slotCollectionHistory.test.ts`
- `ops/evidence/latest/imob-slotcollection-history-fix-2026-07-02.md`
- `docs/EVIDENCE_INDEX.md`

## Shape de `slotCollection` persistido/restaurado

Shape minimo e estavel mantido:

```json
{
  "mission": "property_intake",
  "title": "Completar captação",
  "description": "Preencha os campos pendentes.",
  "fields": ["propertyType", "goal", "city"],
  "prefilled": { "city": "Florianópolis" },
  "propertyCandidates": [{ "id": "prop-1", "label": "Apartamento Beira-Mar" }]
}
```

Regras aplicadas:

- `mission`, `title` e `fields` validos sao obrigatorios;
- `prefilled` e `propertyCandidates` so sao restaurados se tiverem shape valido;
- payload malformado degrada para `undefined`, sem throw;
- historico antigo sem `slotCollection` continua compativel.

## Correção aplicada

- criado `buildPersistedImobChatMessageMetadata(...)` para centralizar a serializacao do payload assistente;
- `persistMessage(...)` passou a incluir `slotCollection` no `metadata`;
- criado `normalizeStoredSlotCollection(...)` para validar e restaurar apenas o shape estavel;
- `mapStoredMessageToChat(...)` passou a reidratar `slotCollection` no reload;
- o renderer/guards existentes permanecem os mesmos; a correcao foi apenas no ciclo persistir -> restaurar.

## Testes executados e saída real

### 1. PR-C focado + regressao PR-A/PR-B

Comando:

```bash
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/pages/app/imob/chat.slotCollectionHistory.test.ts apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts apps/web/src/pages/app/imob/chat.userEcho.test.ts apps/web/src/pages/app/imob/chat.formSubmission.test.ts
```

Saída:

```text
TAP version 13
# Subtest: apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts
ok 1 - apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts
  ---
  duration_ms: 998.965696
  type: 'test'
  ...
# Subtest: apps/web/src/pages/app/imob/chat.formSubmission.test.ts
ok 2 - apps/web/src/pages/app/imob/chat.formSubmission.test.ts
  ---
  duration_ms: 1004.941806
  type: 'test'
  ...
# Subtest: apps/web/src/pages/app/imob/chat.slotCollectionHistory.test.ts
ok 3 - apps/web/src/pages/app/imob/chat.slotCollectionHistory.test.ts
  ---
  duration_ms: 994.891381
  type: 'test'
  ...
# Subtest: apps/web/src/pages/app/imob/chat.userEcho.test.ts
ok 4 - apps/web/src/pages/app/imob/chat.userEcho.test.ts
  ---
  duration_ms: 995.124484
  type: 'test'
  ...
1..4
# tests 4
# suites 0
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1020.368191
```

Cobertura confirmada:

- `slotCollection` e persistido no payload;
- `mapStoredMessageToChat(...)` restaura `slotCollection`;
- o historico restaurado continua apto a renderizar o card via guards ja existentes;
- registro antigo sem `slotCollection` continua compativel;
- PR-A e PR-B seguem verdes.

### 2. Check da IMOB Knowledge Base

Comando:

```bash
pnpm check:imob-knowledge-base
```

Saída:

```text
{
  "ok": true,
  "check": "check:imob-knowledge-base",
  "kbRoot": "knowledge/imob",
  "manifest": "knowledge/imob/manifest.v1.json",
  "entryCount": 5,
  "categories": [
    "playbooks",
    "policies",
    "templates",
    "glossary",
    "checklists"
  ],
  "filesValidated": [
    "knowledge/imob/categories/checklists/locacao-checklist.v1.json",
    "knowledge/imob/categories/glossary/termos-operacionais.v1.json",
    "knowledge/imob/categories/playbooks/captacao-basics.v1.json",
    "knowledge/imob/categories/policies/atendimento-inicial.v1.json",
    "knowledge/imob/categories/templates/briefing-visita.v1.json"
  ],
  "schemas": [
    "knowledge/imob/schema/imob-knowledge-entry.v1.schema.json",
    "knowledge/imob/schema/imob-knowledge-manifest.v1.schema.json"
  ]
}
```

### 3. Check shadow da IMOB Knowledge Base

Comando:

```bash
pnpm check:imob-knowledge-shadow
```

Saída resumida:

```text
{
  "ok": true,
  "check": "check:imob-knowledge-shadow",
  "generatedAt": "2026-07-02",
  "totalScenarios": 10,
  "matchedScenarios": 8,
  "noMatchScenarios": 1,
  "sensitiveScenarios": 3,
  "metrics": {
    "kbMatchRate": 0.8,
    "kbNoMatchRate": 0.1,
    "sensitiveBlockRate": 1,
    "humanReviewRequiredRate": 1,
    "provenanceCoverage": 1,
    "entitlementDeniedRate": 0.1,
    "knowledgeContextErrorRate": 0,
    "userFacingRegressionCount": 0,
    "auditGap": 0,
    "duplicateSideEffects": 0
  },
  "gates": {
    "provenanceCoverage100": true,
    "knowledgeContextErrorRateZero": true,
    "auditGapZero": true,
    "duplicateSideEffectsZero": true,
    "userFacingRegressionCountZero": true,
    "sensitiveNoAutomaticDecision": true,
    "chatAgentLauncherUntouched": true,
    "rollbackDocumented": true
  }
}
```

## Confirmações operacionais

- reload/rebuild preserva `slotCollection` via reidratacao do payload persistido;
- PR-A continua verde;
- PR-B continua verde;
- `ChatAgentLauncher` nao foi alterado;
- `pilot` e `small` nao foram ativados;
- o badge falso `Piloto controlado` nao foi reintroduzido.

## Gaps pendentes

- este PR nao trata governanca do CTA `Ver dossiê`;
- este PR nao muda pilot/small;
- este PR nao adiciona novo estado governado de rollout visual.

## Status conservador

`evidenciado` para a correcao de persistencia/restauracao de `slotCollection` no historico do Chat IMOB.
