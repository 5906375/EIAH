# A3 — Evidence Record
# IMOB Surface Data Reliability — Janela de custo divergente: caseCostMap (30d fixo) vs costByJourney (kpiWindowDays)

Data de execucao: 2026-06-15
Checklist de referencia: docs/ops/imob-surface-data-reliability-checklist.md (item 15)
Status: `evidenciado localmente`

---

## Descricao do alerta

`caseCostMap` e construido a partir de `apiListImobCaseCosts({ windowDays: 30, ... })` — janela
fixa de 30 dias, nunca alterada pelo usuario. `costByJourney` e `totalImobRunCostCents` derivam
de `kpiFunnel`, que usa `kpiWindowDays` (7/15/30d, controlado pelo usuario).

Consequencia observada: ao selecionar janela de 7d, o chip do cabecalho CC exibe
`Custo: R$ X.XX (7d)` mas cada linha da tabela exibia custo cobrindo 30d sem qualquer indicacao
de janela — contexto enganoso para avaliacao de ROI por caso.

---

## Universos de custo

| Dado | Fonte | Janela | Superficie |
|------|-------|--------|-----------|
| `caseCostMap` | `apiListImobCaseCosts` | 30d fixo | Coluna "Evidencias" na tabela CC (por caso) |
| `totalImobRunCostCents` | `kpiFunnel.totalRunCostCents` | `kpiWindowDays` | Chip "Custo:" no cabecalho CC |
| `costByJourney` | `kpiFunnel.costByJourney` | `kpiWindowDays` | `ImobFunnelCostByJourneyChart` |

---

## Patch aplicado (Opcao A — rotulo, sem alteracao de dados)

Patch exclusivamente de rotulo. Nenhum endpoint, query, janela ou logica de calculo alterados.

### Arquivo 1: `apps/web/src/features/imob/ImobCommandCenter.tsx`

- Adicionado `caseCostWindowDays?: number` em `ImobCommandCenterProps`
- Adicionado `caseCostWindowDays = 30` no destructuring (default preserva comportamento atual)
- `costLabel`: de `formatCents(costCents)` para `` `${formatCents(costCents)} (${caseCostWindowDays}d)` ``

Cada linha da tabela CC agora exibe o custo com `(30d)` explícito, alinhando a leitura com
o cabecalho que ja indicava a janela do KPI total.

### Arquivo 2: `apps/web/src/pages/app/imob/dashboard.tsx`

- Adicionado `caseCostWindowDays={30}` na renderizacao de `ImobCommandCenter` (linha 1116)

Torna a janela fixa explicita no call site, sem alterar `apiListImobCaseCosts`.

---

## Confirmacao de invariantes

- `apiListImobCaseCosts` continua com `{ windowDays: 30, workspaceId: session.workspaceId }`
- `kpiWindowDays` nao foi adicionado como dependencia do useEffect de caseCostMap
- `apiGetImobKpiFunnel({ windowDays: kpiWindowDays })` inalterado
- `apiGetImobFunnelHealth({ workspaceId: session.workspaceId })` inalterado
- Nenhum re-fetch novo introduzido

---

## Comandos executados

```
cd apps/web
node --import tsx/esm --test src/features/imob/imobA3CostWindow.test.ts
```

---

## Output dos testes (8/8)

```
TAP version 13
ok 1 - ImobCommandCenter define prop caseCostWindowDays no tipo
ok 2 - ImobCommandCenter usa caseCostWindowDays com default 30
ok 3 - ImobCommandCenter inclui janela no costLabel por caso
ok 4 - ImobCommandCenter não exibe custo por caso sem indicação de janela
ok 5 - dashboard.tsx passa caseCostWindowDays={30} explicitamente para ImobCommandCenter
ok 6 - dashboard.tsx mantém apiListImobCaseCosts com windowDays: 30 fixo
ok 7 - dashboard.tsx não adicionou kpiWindowDays na chamada de apiListImobCaseCosts
ok 8 - dashboard.tsx mantém apiGetImobKpiFunnel com windowDays: kpiWindowDays
1..8
# tests 8 | pass 8 | fail 0
```

---

## Arquivos cobertos

| Arquivo | Papel |
|---------|-------|
| `apps/web/src/features/imob/ImobCommandCenter.tsx` | Prop `caseCostWindowDays`, default 30, `costLabel` com janela |
| `apps/web/src/pages/app/imob/dashboard.tsx` | Passa `caseCostWindowDays={30}` explicitamente |
| `apps/web/src/features/imob/imobA3CostWindow.test.ts` | Suite de verificacao A3 (8 testes) |

---

## Criterio de aceitacao — verificado

- [x] CC tabela mostra custo por caso com `(30d)` explícito
- [x] `caseCostWindowDays` prop adicionado ao CC com default 30
- [x] `dashboard.tsx` passa `caseCostWindowDays={30}` explicitamente
- [x] `apiListImobCaseCosts` continua com `windowDays: 30` fixo
- [x] `kpiWindowDays` nao afeta `caseCostMap` (sem nova dependencia)
- [x] `imobA3CostWindow.test.ts` 8/8 pass

---

## Status

`evidenciado localmente` — testes passam localmente; sem CI verificavel externo.

Divergencia estrutural entre as duas janelas (30d vs kpiWindowDays) e intencional e mantida.
O patch corrige apenas a ausencia de contexto visual no custo por caso.
