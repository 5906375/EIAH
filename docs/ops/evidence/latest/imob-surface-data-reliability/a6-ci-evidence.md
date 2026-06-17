# A6 — Evidence Record
# IMOB Surface Data Reliability — lógica de negócio em page component (viola AGENTS.md)

Data de execucao: 2026-06-15
Checklist de referencia: docs/ops/imob-surface-data-reliability-checklist.md (item 35)
Status: `evidenciado`

---

## Descricao do alerta

`buildCasePriority` e `buildCaseFallbackActions` estavam definidas diretamente em
`dashboard.tsx` (page component). Isso viola a regra canônica do AGENTS.md:

```
Agente define. Engine executa. Launcher renderiza.
```

Page components devem ser render-only. Lógica de negócio (prioridade de caso,
ações de fallback) pertence a helpers testáveis fora da UI.

---

## Patch aplicado

### `apps/web/src/features/imob/imobCommandCenterHelper.ts`

- `buildImobCasePriority` já existia — exportação confirmada
- `buildImobCaseFallbackActions` adicionada e exportada

### `apps/web/src/pages/app/imob/dashboard.tsx`

- Definições locais de `buildCasePriority` e `buildCaseFallbackActions` removidas
- Importações de `buildImobCasePriority` e `buildImobCaseFallbackActions` do helper

---

## Comandos executados

```
cd apps/web
node --import tsx/esm --test src/features/imob/imobCommandCenterHelper.test.ts
```

---

## Output dos testes (10/10)

```
TAP version 13
ok 1 - buildImobCasePriority is exported from imobCommandCenterHelper
ok 2 - buildImobCaseFallbackActions is exported from imobCommandCenterHelper
ok 3 - dashboard.tsx does not define buildCasePriority locally
ok 4 - dashboard.tsx does not define buildCaseFallbackActions locally
ok 5 - dashboard.tsx imports buildImobCasePriority from helper
ok 6 - dashboard.tsx imports buildImobCaseFallbackActions from helper
ok 7 - buildImobCasePriority returns expected priority for blocked case
ok 8 - buildImobCasePriority returns expected priority for pending case
ok 9 - buildImobCaseFallbackActions returns actions for case with flow
ok 10 - buildImobCaseFallbackActions returns default action for case without flow
1..10
# tests 10 | pass 10 | fail 0
```

---

## Arquivos cobertos

| Arquivo | Papel |
|---------|-------|
| `apps/web/src/features/imob/imobCommandCenterHelper.ts` | Helper com `buildImobCasePriority` e `buildImobCaseFallbackActions` |
| `apps/web/src/pages/app/imob/dashboard.tsx` | Removidas definicoes locais; importa do helper |
| `apps/web/src/features/imob/imobCommandCenterHelper.test.ts` | Suite de verificacao A6 (10 testes) |

---

## Criterio de aceitacao — verificado

- [x] `buildImobCasePriority` exportada do helper
- [x] `buildImobCaseFallbackActions` exportada do helper
- [x] `dashboard.tsx` nao define as funcoes localmente
- [x] `dashboard.tsx` importa as funcoes do helper
- [x] `imobCommandCenterHelper.test.ts` 10/10 pass
