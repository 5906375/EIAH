# A7 — Evidence Record
# IMOB Surface Data Reliability — contextCase por heurística sem indicação ao usuário

Data de execucao: 2026-06-15
Checklist de referencia: docs/ops/imob-surface-data-reliability-checklist.md (item 23)
Status: `evidenciado localmente`

---

## Descricao do alerta

`contextCase` no dashboard IMOB (aba Solucoes) era resolvido por um `useMemo` com
quatro ramos em cascata. O ramo de menor prioridade — heuristica de texto no label
da thread — disparava silenciosamente sem nenhuma indicacao ao usuario:

| Ramo | Tipo | Criterio |
|------|------|----------|
| 1. `requestedCaseId` | explícito | URL `?caseId=` |
| 2a. `selectedThreadId → case.threadId` | explícito | vinculo direto |
| 2b. `selectedThreadId → run.caseId` | explícito | via historico de runs |
| 3. `threadLabel` text-match | **heurística** | palavras no label da thread |

O ramo heurístico verificava se o label da thread continha "imóvel", "lead" ou
"document" e retornava o caso mais recente com `flow` correspondente — sem qualquer
indicacao visual de que o caso era estimado, nao confirmado.

Consequência: acoes de deeplink (Follow-up, Resolver no chat) transportavam
`?caseId=X` para o chat com um caso potencialmente incorreto, sem aviso ao usuario.

---

## Patch aplicado (Opcao A — contextCaseSource + badge)

Mudancas exclusivamente em `dashboard.tsx`. Logica de resolucao, valor de `contextCase`
e deeplinks inalterados.

### 1. `contextCase` useMemo refatorado para retornar objeto com fonte

Antes:
```ts
const contextCase = React.useMemo(() => {
  if (requestedCaseId) return cases.find(...) ?? null;
  // ...
  return null;
}, [...]);
```

Depois:
```ts
const { contextCase, contextCaseSource } = React.useMemo((): {
  contextCase: (typeof cases)[number] | null;
  contextCaseSource: "requested" | "thread" | "run" | "heuristic" | null;
} => {
  if (requestedCaseId) {
    const c = cases.find(...) ?? null;
    return { contextCase: c, contextCaseSource: c ? "requested" : null };
  }
  if (selectedThreadId) {
    // byThread -> { contextCase: byThread[0], contextCaseSource: "thread" }
    // byRun   -> { contextCase: fromRun,     contextCaseSource: "run" }
  }
  // ramos de text-match -> { contextCase: byFlow[0], contextCaseSource: "heuristic" }
  return { contextCase: null, contextCaseSource: null };
}, [...]);
```

### 2. Badge no card "Caso" quando heurística

```tsx
<article className="rounded-2xl ...">
  <p className="text-[10px] ...">Caso</p>
  <p className="mt-1 text-sm font-medium text-foreground">{contextCaseLabel}</p>
  {contextCaseSource === "heuristic" ? (
    <p className="mt-1 text-[10px] text-amber-100/70">estimado por contexto da thread</p>
  ) : null}
</article>
```

---

## Confirmacao de invariantes

- Logica de resolucao de `contextCase` inalterada (mesmos quatro ramos, mesma ordem)
- Valor de `contextCase` inalterado (mesmo objeto de caso, mesma selecao)
- Deeplinks `caseId: contextCase.id` inalterados
- Todos os tres ramos de heuristica (imovel, lead, document) mantidos
- Endpoints inalterados

---

## Comandos executados

```
cd apps/web
node --import tsx/esm --test src/pages/app/imob/dashboard.a7contextCase.test.ts
```

---

## Output dos testes (11/11)

```
TAP version 13
ok 1 - dashboard.tsx declara contextCaseSource no retorno do useMemo
ok 2 - dashboard.tsx define tipo de contextCaseSource com ramo 'heuristic'
ok 3 - dashboard.tsx retorna contextCaseSource 'requested' quando requestedCaseId resolve o caso
ok 4 - dashboard.tsx retorna contextCaseSource 'thread' quando threadId resolve o caso
ok 5 - dashboard.tsx retorna contextCaseSource 'run' quando run resolve o caso
ok 6 - dashboard.tsx retorna contextCaseSource 'heuristic' nos três ramos de label matching
ok 7 - dashboard.tsx exibe badge 'estimado por contexto da thread' quando contextCaseSource é heuristic
ok 8 - dashboard.tsx condiciona badge a contextCaseSource === 'heuristic'
ok 9 - dashboard.tsx mantém os três ramos de text-match (imóvel, lead, document)
ok 10 - dashboard.tsx mantém deeplinks com contextCase.id (lógica inalterada)
ok 11 - dashboard.tsx não alterou endpoint apiGetImobKpiFunnel
1..11
# tests 11 | pass 11 | fail 0
```

---

## Arquivos cobertos

| Arquivo | Papel |
|---------|-------|
| `apps/web/src/pages/app/imob/dashboard.tsx` | `contextCaseSource` derivado, badge condicional em card Caso |
| `apps/web/src/pages/app/imob/dashboard.a7contextCase.test.ts` | Suite de verificacao A7 (11 testes) |

---

## Criterio de aceitacao — verificado

- [x] `contextCaseSource` derivado no mesmo `useMemo` que `contextCase`
- [x] Tipo: `"requested" | "thread" | "run" | "heuristic" | null`
- [x] Ramo `requestedCaseId` → `"requested"`
- [x] Ramo `threadId → case.threadId` → `"thread"`
- [x] Ramo `run lookup` → `"run"`
- [x] Todos os tres ramos de text-match → `"heuristic"`
- [x] Card Caso exibe `"estimado por contexto da thread"` quando `contextCaseSource === "heuristic"`
- [x] Badge condicional a `contextCaseSource === "heuristic"` (nao visivel nos ramos explicitos)
- [x] Logica de resolucao e deeplinks inalterados (confirmados por teste)
- [x] `dashboard.a7contextCase.test.ts` 11/11 pass

---

## Status

`evidenciado localmente` — testes passam localmente; sem CI verificavel externo.

A heurística de resolucao por label de thread permanece ativa — util em workspaces
com threads bem nomeadas. O badge comunica ao usuario quando o caso foi estimado,
nao confirmado, sem remover a funcionalidade.
