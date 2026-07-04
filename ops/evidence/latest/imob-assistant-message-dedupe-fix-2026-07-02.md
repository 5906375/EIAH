# IMOB assistant message dedupe fix — 2026-07-02

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
- `apps/web/src/pages/app/imob/chat.userEcho.test.ts`
- `apps/web/src/pages/app/imob/chat.formSubmission.test.ts`
- `apps/api/src/routes/imob.ts`
- `apps/api/src/services/imob/imobTurnResolver.ts`
- `apps/api/src/services/imob/imobConversationContract.ts`
- `apps/api/src/tests/imob.chat.persistence.contract.test.ts`

## Bug confirmado

Confirmado no frontend em `apps/web/src/pages/app/imob/chat.tsx`:

- o placeholder assistente `planMessage` era persistido antes da execução real;
- depois o mesmo estágio era persistido de novo no caminho `started` com `runId`;
- por fim o terminal do mesmo fluxo podia ser persistido outra vez;
- `dedupeRunMessages(...)` só cobria o caso consecutivo com `runId`, então o registro inicial sem `runId` escapava no reload/histórico.

Isso explicava duplicações como:

- `Preencha os campos abaixo para continuar o cadastro do imóvel.`
- `Atualizei o cadastro do imóvel. Continue pelos campos pendentes abaixo.`

## Causa raiz

Havia duas causas combinadas:

1. persistência antecipada do `planMessage` pré-run;
2. reconstrução de histórico dependente demais de `runId`, sem fingerprint estável para o caso legado/no-runId inicial.

## Arquivos alterados

- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts`
- `ops/evidence/latest/imob-assistant-message-dedupe-fix-2026-07-02.md`
- `docs/EVIDENCE_INDEX.md`

## Correção aplicada

- removida a persistência do `planMessage` pré-execução em `startPlanExecution(...)`;
- mantida a renderização live do placeholder no estado local, sem gravá-lo no histórico;
- mantida a persistência do caminho com `runId` (`started`) e do terminal;
- `dedupeRunMessages(...)` passou a aceitar fingerprint assistente estável além do fallback antigo por `runId`;
- `mapStoredMessageToChat(...)` agora deriva `assistantDedupeKey` do payload persistido para reconhecer equivalência sem depender de `runId`.

## Chave de dedupe adotada

Fingerprint determinístico `imob_assistant_message_v1`, serializado com ordem estável, composto por:

- `threadId`
- `caseId`
- `action`
- `presentationDedupeKey`
- `text`

Observações:

- não é filtro frágil por string pura;
- o fallback por `runId` permanece ativo para mensagens do mesmo run;
- mensagens semanticamente distintas continuam preservadas quando o fingerprint muda.

## Testes executados e saída real

### 1. Teste focado de dedupe + PR-A ainda verde

Comando:

```bash
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts apps/web/src/pages/app/imob/chat.userEcho.test.ts apps/web/src/pages/app/imob/chat.formSubmission.test.ts
```

Saída:

```text
TAP version 13
# Subtest: apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts
ok 1 - apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts
  ---
  duration_ms: 2908.279217
  type: 'test'
  ...
# Subtest: apps/web/src/pages/app/imob/chat.formSubmission.test.ts
ok 2 - apps/web/src/pages/app/imob/chat.formSubmission.test.ts
  ---
  duration_ms: 2808.038474
  type: 'test'
  ...
# Subtest: apps/web/src/pages/app/imob/chat.userEcho.test.ts
ok 3 - apps/web/src/pages/app/imob/chat.userEcho.test.ts
  ---
  duration_ms: 2788.742025
  type: 'test'
  ...
1..3
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2932.349763
```

Cobertura exercida:

- colapso do caso legado sem `runId` inicial;
- preservação de mensagens assistente semanticamente distintas;
- manutenção do fallback por `runId`;
- PR-A segue verde para CTA/form suprimidos.

### 2. Check de integridade da IMOB KB

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
  "entryCount": 5
}
```

### 3. Check shadow da IMOB KB

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
  }
}
```

### 4. Grep de não reintrodução do badge falso

Comando:

```bash
rg -n "PILOTO CONTROLADO|Piloto controlado" apps/web/src/components/agents/ChatAgentLauncher.tsx apps/web/src/pages/app/imob/chat.tsx apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx apps/web/src/features/imob/ImobWorkbenchShell.tsx || printf 'no matches\n'
```

Saída:

```text
no matches
```

## Confirmações operacionais

- o fluxo de captação/cadastro deixa de persistir o placeholder assistente duplicado;
- o reload/reconstrução agora reconhece equivalência assistente sem depender só de `runId`;
- mensagens assistente distintas continuam preservadas;
- PR-A continua verde;
- `ChatAgentLauncher` não foi alterado;
- `pilot` e `small` não foram ativados;
- o badge falso `Piloto controlado` não foi reintroduzido.

## Gaps pendentes

- este PR não persiste/restaura `slotCollection`;
- este PR não altera governança do CTA `Ver dossiê`;
- este PR não resolve outros tipos de drift visual fora do histórico assistente.

## Status conservador

`evidenciado` para o PR-B de dedupe/persistência de mensagens assistente no Chat IMOB.
