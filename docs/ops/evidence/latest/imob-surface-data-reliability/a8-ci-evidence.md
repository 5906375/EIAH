# A8 — Evidence Record
# IMOB Surface Data Reliability — KPI strip sem badge de fonte em properties.tsx

Data de execucao: 2026-06-15
Checklist de referencia: docs/ops/imob-surface-data-reliability-checklist.md (itens 6 e 26)
Status promovido para: `evidenciado`

---

## Descricao do alerta

O KPI strip de `apps/web/src/pages/app/imob/properties.tsx` (cards "Imoveis ativos",
"Disponiveis", "Com parceiro") usava `syntheticProperties` diretamente. Um workspace
operacional exibia contadores demonstrativos sem qualquer indicacao de fonte,
violando a regra: *nenhum dado `synthetic` pode parecer `primary`*.

---

## Patch aplicado

Arquivo: `apps/web/src/pages/app/imob/properties.tsx`

Mudancas:
- `syntheticProperties` removido completamente
- Importacao de `apiListImobProperties` e `ImobProperty` de `@/lib/api`
- `useEffect` com chamada a `apiListImobProperties()`, estados de `loading` / `fetchError`
- Badge de fonte adicionado ao primeiro card do KPI strip: `backend` | `sem dados`
- Badge de secao atualizado: `backend` | `sem dados` (substituiu "modo demonstracao" fixo)
- KPI "Com parceiro" renomeado para "Com proprietario" (campo `owner?.name` de `ImobProperty`)
- Empty state semantico sem dado sintetico: "Nenhum imovel cadastrado no workspace."

---

## Comandos executados

```
cd apps/web
node --experimental-vm-modules --import tsx/esm \
  src/pages/app/imob/properties.test.ts
```

Suite de nao-regressao (imob):
```
node --experimental-vm-modules --import tsx/esm src/features/imob/imobCommandCenterHelper.test.ts
node --experimental-vm-modules --import tsx/esm src/features/imob/imobDashboardTabs.test.ts
node --experimental-vm-modules --import tsx/esm src/features/imob/imobApiClient.test.ts
node --experimental-vm-modules --import tsx/esm src/features/imob/kpiRefreshState.test.ts
```

---

## Output dos testes

### properties.test.ts — testes de A8/A9

```
TAP version 13
ok 1 - properties.tsx does not define syntheticProperties
ok 2 - properties.tsx calls apiListImobProperties
ok 3 - properties.tsx imports ImobProperty from api
ok 4 - properties.tsx has source badge on KPI strip
ok 5 - properties.tsx does not use hardcoded imob-82912 synthetic id
1..5
# tests 5 | pass 5 | fail 0
```

### Suite imob — nao-regressao

| Suite | Testes | Pass | Fail |
|-------|--------|------|------|
| imobCommandCenterHelper.test.ts | 10 | 10 | 0 |
| imobDashboardTabs.test.ts | 3 | 3 | 0 |
| imobApiClient.test.ts | 2 | 2 | 0 |
| kpiRefreshState.test.ts | 2 | 2 | 0 |
| **Total** | **17** | **17** | **0** |

---

## Arquivos cobertos

| Arquivo | Papel |
|---------|-------|
| `apps/web/src/pages/app/imob/properties.tsx` | Arquivo corrigido (patch) |
| `apps/web/src/pages/app/imob/properties.test.ts` | Suite de verificacao A8/A9 |
| `apps/web/src/features/imob/imobCommandCenterHelper.test.ts` | Nao-regressao A6 |
| `apps/web/src/features/imob/imobDashboardTabs.test.ts` | Nao-regressao imob |
| `apps/web/src/features/imob/imobApiClient.test.ts` | Nao-regressao imob |
| `apps/web/src/features/imob/kpiRefreshState.test.ts` | Nao-regressao imob |

---

## Criterio de aceitacao — verificado

- [x] `syntheticProperties` ausente de `properties.tsx`
- [x] `apiListImobProperties()` chamado no `useEffect`
- [x] Badge de fonte presente no KPI strip
- [x] Sem ID sintetico hardcoded (`imob-82912` etc.)
- [x] `properties.test.ts` 5/5 pass
- [x] Suite imob sem regressao (17/17 pass)

---

## Conclusao

O alerta A8 esta evidenciado. O patch remove a superfice sintetica silenciosa,
expoe a fonte de dados no KPI strip e os testes verificam estruturalmente que
a pagina nao pode regredir para `syntheticProperties` sem falhar na suite.

Alertas A1–A5 e A7 permanecem abertos — nao foram alterados nesta etapa.
