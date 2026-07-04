# IMOB suppressUserEcho fix — 2026-07-02

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
- `apps/web/src/features/workbench/vertical-chat/ImobSlotCollectionCard.tsx`
- `apps/web/src/features/workbench/vertical-chat/imobChatPresentationGuards.ts`
- `apps/web/src/features/imob/businessQuickActions.ts`
- `apps/api/src/routes/imob.ts`
- `apps/api/src/services/imob/imobTurnResolver.ts`
- `apps/web/src/pages/app/imob/chat.formSubmission.test.ts`

## Bug confirmado

Confirmado no frontend em `apps/web/src/pages/app/imob/chat.tsx`:

- `sendMessageText(...)` sempre fazia `appendMessage` da role `user`;
- o mesmo caminho também sempre persistia a mensagem user via `persistMessage(...)`;
- isso fazia CTA estruturada (`cadastrar imóvel`), submit de form (`Salvar cadastro`) e autoprompt estruturado aparecerem como fala natural do usuário, apesar de já existirem call sites com `suppressUserEcho: true`.

## Causa raiz

`sendMessageText(...)` recebia `suppressUserEcho`, mas não condicionava nem o append local nem a persistência. O path de `requestedAutoprompt` também enviava o prompt cru sem normalização para labels estruturadas conhecidas.

## Arquivos alterados

- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/pages/app/imob/chat.userEcho.test.ts`
- `ops/evidence/latest/imob-suppress-user-echo-fix-2026-07-02.md`
- `docs/EVIDENCE_INDEX.md`

## Correção aplicada

- `sendMessageText(...)` agora respeita `suppressUserEcho: true` tanto para `appendMessage` quanto para `persistMessage`.
- CTAs estruturadas enviadas pelo chat IMOB agora passam `displayText` + `suppressUserEcho: true`.
- actions de widget IMOB agora passam `displayText` + `suppressUserEcho: true`.
- `requestedAutoprompt` conhecido é normalizado por catálogo estruturado (`QUICK_PROMPTS` + `IMOB_BUSINESS_QUICK_ACTIONS`) e enviado com label curta + supressão de eco.
- o texto real continua sendo enviado ao backend/engine; a correção atua apenas sobre o eco artificial local/persistido.

## Testes executados e saída real

### 1. Teste focado do PR-A + teste IMOB existente

Comando:

```bash
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/pages/app/imob/chat.userEcho.test.ts apps/web/src/pages/app/imob/chat.formSubmission.test.ts
```

Saída:

```text
TAP version 13
# Subtest: apps/web/src/pages/app/imob/chat.formSubmission.test.ts
ok 1 - apps/web/src/pages/app/imob/chat.formSubmission.test.ts
  ---
  duration_ms: 549.927362
  type: 'test'
  ...
# Subtest: apps/web/src/pages/app/imob/chat.userEcho.test.ts
ok 2 - apps/web/src/pages/app/imob/chat.userEcho.test.ts
  ---
  duration_ms: 547.145994
  type: 'test'
  ...
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 559.711385
```

Cobertura exercida pelo teste focado:

- `suppressUserEcho=true` desliga o eco local;
- autoprompt estruturado de captação é normalizado para `Captar imóvel`;
- quick action estruturada conhecida é normalizada para label curta;
- prompt livre fora do catálogo não é forçado para supressão;
- `buildPresentationFormDisplayText(...)` preserva `Salvar cadastro` como label estruturada separada do payload.

### 2. Check de integridade da IMOB KB

Comando:

```bash
pnpm check:imob-knowledge-base
```

Saída:

```text
> eiah-builder@ check:imob-knowledge-base /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkImobKnowledgeBase.ts

(node:19) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
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

### 3. Check shadow da IMOB KB

Comando:

```bash
pnpm check:imob-knowledge-shadow
```

Saída resumida:

```text
> eiah-builder@ check:imob-knowledge-shadow /home/jusall/projects/EIAH_BUILDER
> node --import tsx scripts/runImobKnowledgeShadow.ts --out ops/evidence/latest/imob-knowledge-shadow-run-2026-07-02.json

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

### 4. Grep de não reintrodução do badge falso

Comando:

```bash
rg -n "PILOTO CONTROLADO|Piloto controlado" apps/web/src/pages/app/imob/chat.tsx apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx apps/web/src/features/imob/ImobWorkbenchShell.tsx || printf 'no matches\n'
```

Saída:

```text
no matches
```

## Confirmações operacionais

- CTA/form submit suprimidos não viram mais mensagem `user` no histórico/chat pelo path corrigido.
- O backend/engine continua recebendo o payload real porque `resolveImobTurn({ message: text, ... })` permaneceu intocado.
- A renderização da resposta assistente do engine permanece no mesmo path após `resolveImobTurn(...)`.
- `ChatAgentLauncher` não foi alterado.
- `pilot` e `small` não foram ativados.
- O badge falso `Piloto controlado` não foi reintroduzido.

## Gaps pendentes

- este PR não resolve dedupe/persistência duplicada de mensagens assistente;
- este PR não resolve persistência/restauração de `slotCollection`;
- este PR não mexe na governança do CTA `Ver dossiê`.

## Status conservador

`evidenciado` para o PR-A de supressão de eco artificial em CTA/form/autoprompt estruturado.
