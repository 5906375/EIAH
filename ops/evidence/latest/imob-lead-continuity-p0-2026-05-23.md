# IMOB Lead Continuity P0 — Fechamento Operacional (2026-05-23)

## Escopo

Fechamento operacional da frente `IMOB Lead Continuity P0` após implementação de:
- contrato canônico de `lead.qualify` com `leadStatus` e `nextAction`;
- idempotência por `case.leadId`;
- continuidade pós-pendência sem reabrir campo já resolvido;
- endurecimento da compat layer para evitar copy contraditória;
- `nextAction` única no backend com launcher `render-only`;
- evidência mínima por transição crítica do lead.

## Comandos executados

```bash
node --import tsx --test apps/api/src/tests/imob-crm-dedupe.test.ts apps/api/src/tests/imob-crm-turn-continuity.test.ts apps/api/src/tests/imob-crm-turn-engine.test.ts apps/api/src/tests/imob-turn-resolver.test.ts
```

Resultado: `4/4` arquivos de teste passando.

```bash
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/components/agents/chatLauncherEngine.test.ts
```

Resultado: `1/1` arquivo de teste passando.

## Evidência de comportamento

Cobertura validada:
- `apps/api/src/tests/imob-crm-dedupe.test.ts`
- `apps/api/src/tests/imob-crm-turn-continuity.test.ts`
- `apps/api/src/tests/imob-crm-turn-engine.test.ts`
- `apps/api/src/tests/imob-turn-resolver.test.ts`
- `apps/web/src/components/agents/chatLauncherEngine.test.ts`

Invariantes cobertas:
- `case.leadId` tem precedência sobre dedupe heurístico.
- O mesmo caso reaproveita o mesmo lead persistido.
- `leadName` resolvido não reaparece em `consultar caso` ou `retomar`.
- `qualified` só ocorre com `pendingFields = []`.
- `nextAction` principal sai única e coerente com `recommendedActions`, `nextStep`, `suggestedNextAction` e `quickReplies`.
- O launcher não inventa quick reply IMOB e não promove `defaultNextStep` a chip em runtime governado.
- A compat layer não afirma sucesso contraditório quando ainda existem pendências.
- O fluxo registra evidência mínima para `lead_draft_created`, `lead_missing_fields_detected`, `lead_updated`, `lead_qualified` e `lead_next_action_selected`.

## Gate operacional

Esta frente passa a ter gate scoped por suíte dedicada:
- `pnpm test:imob-lead-continuity`
- `pnpm test:web-chat-launcher`
- `pnpm check:evidence-index`

Uso esperado:
- branch/PRs que toquem a continuidade de lead no IMOB devem manter esse gate verde;
- esse gate não depende do `tsc` global do workspace enquanto o typecheck legado permanecer contaminado.

## Limite conhecido

O `tsc` global do workspace continua com passivos históricos fora desta frente.

Essa frente não deve ser bloqueada por esse passivo, desde que:
- o gate scoped permaneça verde;
- a evidência permaneça indexada;
- o saneamento do typecheck siga em frente separada.

Referência existente para passivos separados:
- `ops/evidence/latest/es2024-tsc-passivos-front-2026-04-15.md`
- `docs/architecture/es2024-tsc-passivos-front.md`
