# IMOB Visit Slot Collection — Smoke Evidence 2026-06-24

## Escopo

Evidenciar o patch de coleta estruturada de slots da missão `visit.schedule` no IMOB chat.

Problema resolvido: quando o fluxo de visita ficava pendente, o engine emitia texto simples
forçando o usuário a preencher todos os campos em linguagem natural, gerando loop de parsing.

## Arquivos alterados

- `apps/api/src/services/imob/imobConversationContract.ts` — campo `propertyTextCandidate` no tipo `ImobVisitDraft`
- `apps/api/src/services/imob/imobConversationState.ts` — extração de `propertyTextCandidate` em `buildVisitDraft()`
- `apps/api/src/services/imob/crm/imobCrmTurnContinuity.ts` — lookup DB por texto candidato; auto-vínculo se único hit; `propertyCandidates` se múltiplos
- `apps/api/src/services/imob/crm/imobCrmTurnEngine.ts` — `buildWorkflowBlockedResolution()` emite `slotCollection` payload schema-driven para `visit_missing_property`
- `apps/web/src/lib/api.ts` — `slotCollection` adicionado ao tipo `ImobOperationalPresentation`
- `apps/web/src/features/workbench/vertical-chat/ImobSlotCollectionCard.tsx` — prop `prefilled` para valores já conhecidos
- `apps/web/src/pages/app/imob/chat.tsx` — campo `slotCollection` no tipo `ChatMessage`; render do card no turn blocked
- `apps/api/src/tests/imob-visit-slot-collection.test.ts` — 7 testes novos

## Comportamento implementado

### Engine (agente define, engine executa)

Quando `visit_missing_property` é detectado, `buildWorkflowBlockedResolution()` emite:

```json
{
  "mode": "blocked",
  "presentation": {
    "text": "Posso preparar o agendamento da visita. Preencha os dados abaixo para continuar.",
    "pendingFieldLabels": ["propertyId", "visitorName", "visitorPhone", "preferredDate"],
    "slotCollection": {
      "mission": "visit.schedule",
      "title": "Agendar visita",
      "description": "Preencha os dados abaixo para preparar o agendamento.",
      "fields": ["propertyId", "visitorName", "visitorPhone", "preferredDate"],
      "prefilled": { "visitorName": "...", "visitorPhone": "..." }
    }
  }
}
```

### Continuidade (lookup de imóvel por texto)

Quando `propertyTextCandidate` está presente e `propertyId` é null:
- 1 hit no DB → auto-vincula `propertyId`; visita pode ser agendada
- 2–3 hits → emite `propertyCandidates` para CTAs no engine
- 0 hits → preserva candidato textual; mantém `propertyId` null; agendamento bloqueado

### Frontend (launcher renderiza, sem lógica cognitiva)

Turn `mode=blocked` com `slotCollection` → renderiza `ImobSlotCollectionCard` com
campos pré-preenchidos a partir do payload emitido pelo engine.

## Execução real dos testes

### Novos testes

Comando:
```bash
node --import tsx --test apps/api/src/tests/imob-visit-slot-collection.test.ts
```

Resultado:
```text
1..7
# tests 7
# suites 0
# pass 7
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1961.743202
```

### Suite imob-lead-continuity (regressão)

Comando:
```bash
pnpm test:imob-lead-continuity
```

Resultado:
```text
1..134
# tests 134
# suites 0
# pass 134
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2665.652755
```

## O que esta evidência prova

- Engine emite payload `slotCollection` estruturado (schema-driven) para `visit_missing_property`
- Os quatro campos mínimos (`propertyId`, `visitorName`, `visitorPhone`, `preferredDate`) são requeridos
- Campos já conhecidos são pré-preenchidos pelo engine antes de chegar ao frontend
- Texto livre no imóvel vira `propertyTextCandidate`, não `propertyId` falso
- Sem `propertyId` resolvido, `status = "collecting"` → agendamento bloqueado
- Único hit DB no texto candidato → auto-vínculo → `status = "ready_for_review"`
- Regressão de 134 testes do suite `imob-lead-continuity` sem falhas
- Nenhuma lógica cognitiva foi adicionada ao `ChatAgentLauncher`
- Nenhum check/gate foi alterado

## Limites desta evidência

- Evidência local (não CI remoto)
- Frontend não testado via Playwright (UI render-only; lógica no engine)
- Múltiplos candidatos DB (`propertyCandidates`) cobertos em comportamento de continuidade mas sem teste de renderização das CTAs no engine — coberto em smoke manual
- Auto-vínculo não executa agendamento automaticamente; exige confirmação governada

## Status

parcial — implementação evidenciada por testes unitários de engine/continuidade; validação E2E e de renderização pendente de staging
