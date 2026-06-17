# A1 — Evidence Record
# IMOB Surface Data Reliability — Funil vs Command Center: divergência de rótulo de contexto

Data de execucao: 2026-06-15
Checklist de referencia: docs/ops/imob-surface-data-reliability-checklist.md (item 1)
Status promovido para: `evidenciado` (A1-follow-up concluido em 2026-06-15)

---

## Descricao do alerta

Contadores de casos exibidos no Funil e no Command Center derivam de universos
semanticamente diferentes, sem qualquer indicacao visual ao usuario:

| Universo | Variavel | Endpoint | Campo temporal | Janela |
|----------|----------|----------|----------------|--------|
| U1 — Funil analitico | `kpiFunnel.totals.*` | `/imob/kpis/funnel` | `createdAt` | `kpiWindowDays` 7/15/30d (usuario controla) |
| U2 — Saude CC | `health.summary.blockedTotal` | `/imob/command-center/funnel-health` | `updatedAt` | 7d fixo (backend default) |
| U3 — Snapshot total | `blockedProcessCount` | `/imob/cases` | nenhum | sem janela |
| U4 — Lista CC | `imobCasesList` | `/imob/cases?status=X` | nenhum | sem janela |

Consequencias observadas:
- `blockedProcessCount` no Hero (U3, sem janela) diferia de `health.summary.blockedTotal` no CC
  (U2, 7d de `updatedAt`): caso bloqueado ha >7d sem atividade recente aparecia no Hero mas
  nao no CC chip, ambos com label "Bloqueios: X".
- `totalCostLabel` no CC exibia custo derivado de `kpiFunnel.totalRunCostCents`, que muda com
  `kpiWindowDays`, sem indicar ao usuario qual janela estava ativa.

A correcao nao unifica dados, endpoints ou queries — os universos sao semanticamente corretos.
O problema era ausencia de rotulo de contexto.

---

## Patch aplicado

Mudancas exclusivamente de rotulo — nenhum endpoint, query, calculo ou janela alterados.

### Arquivo 1: `apps/web/src/features/imob/ImobCommandCenter.tsx`

- Chip de cabecalho: `Bloqueios: X` → `Bloqueios recentes: X · 7d`
- Card label: `Bloqueios` → `Bloqueios (7d)`

Comunica explicitamente que `health.summary.blockedTotal` e um contador com janela de 7 dias
sobre `updatedAt`, diferente do snapshot total do Hero.

### Arquivo 2: `apps/web/src/pages/app/imob/dashboard.tsx`

- `totalCostLabel`: `currencyFromCents(totalImobRunCostCents)` →
  `` `${currencyFromCents(totalImobRunCostCents)} (${kpiWindowDays}d)` ``

O custo exibido no CC e derivado de `kpiFunnel` que usa `kpiWindowDays`. Agora o label
indica qual janela esta ativa, sem alterar o valor nem a fonte.

### Arquivo 3: `apps/web/src/features/imob/ImobDashboardHero.tsx`

- KpiDot: `label="bloqueados"` → `label="bloqueados atuais"`

Distingue o snapshot de todos os casos bloqueados (U3, sem janela) do CC chip
que mostra bloqueios recentes (U2, 7d).

---

## Risco remanescente registrado (A1-follow-up)

`health.summary.blockedTotal` e chamado sem passar `window` explicitamente pelo
frontend — o backend usa `"7d"` como default. O label `· 7d` e preciso hoje.

Tarefa futura: passar `window` explicitamente na chamada de `apiGetImobFunnelHealth`
ou fazer a API retornar `effectiveWindow` no payload. Isso eliminaria o risco de
drift entre label e default do backend caso o default seja alterado.

---

## Comandos executados

```
cd apps/web
node --import tsx/esm --test src/features/imob/imobA1Labels.test.ts
```

---

## Output dos testes (9/9)

```
TAP version 13
ok 1 - ImobCommandCenter chip de bloqueios inclui rótulo de janela '7d'
ok 2 - ImobCommandCenter chip de bloqueios não exibe número sem contexto de janela
ok 3 - ImobCommandCenter card de bloqueios inclui rótulo (7d)
ok 4 - dashboard.tsx totalCostLabel inclui kpiWindowDays na string
ok 5 - dashboard.tsx totalCostLabel não usa currencyFromCents sem indicar janela
ok 6 - ImobDashboardHero diferencia bloqueios snapshot como 'atuais'
ok 7 - ImobDashboardHero não usa label genérico 'bloqueados' sem qualificador
ok 8 - dashboard.tsx não alterou endpoint de kpiFunnel
ok 9 - dashboard.tsx não alterou endpoint de funnel-health
1..9
# tests 9 | pass 9 | fail 0
```

---

## Arquivos cobertos

| Arquivo | Papel |
|---------|-------|
| `apps/web/src/features/imob/ImobCommandCenter.tsx` | Rotulo de janela no chip e card de bloqueios |
| `apps/web/src/pages/app/imob/dashboard.tsx` | `totalCostLabel` com janela ativa |
| `apps/web/src/features/imob/ImobDashboardHero.tsx` | Qualificador "atuais" no snapshot de bloqueados |
| `apps/web/src/features/imob/imobA1Labels.test.ts` | Suite de verificacao A1 (9 testes) |

---

## Confirmacao de invariantes

- Nenhum endpoint alterado (`apiGetImobKpiFunnel`, `apiGetImobFunnelHealth`, `apiListImobCases`)
- Nenhuma query alterada
- `kpiWindowDays`, `totalImobRunCostCents`, `health.summary.blockedTotal`, `blockedProcessCount`
  com as mesmas fontes e calculos
- Janela padrao do Command Center (7d) nao alterada

---

## Criterio de aceitacao — verificado

- [x] CC chip de bloqueios exibe `7d` explicitamente
- [x] CC chip nao exibe numero sem contexto de janela
- [x] CC card de bloqueios inclui `(7d)`
- [x] `totalCostLabel` inclui `${kpiWindowDays}d`
- [x] Hero usa `bloqueados atuais` (qualificador de snapshot atual)
- [x] Endpoints inalterados confirmados por teste
- [x] `imobA1Labels.test.ts` 9/9 pass

---

## Conclusao

O alerta A1 esta evidenciado. A divergencia entre universos de dados (Funil analitico,
saude CC, snapshot total) nao foi corrigida por unificacao — era semanticamente correta.
O patch corrige a ausencia de contexto visual: cada contador agora indica sua janela
temporal ou natureza de snapshot.

Proximo alerta: A3 — janela de custo divergente entre `caseCostMap` (fixo 30d) e
`costByJourney` (usa `kpiWindowDays`). A3 permanece aberto ate analise dedicada.
