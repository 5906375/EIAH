# A2 — Evidence Record
# IMOB Surface Data Reliability — syntheticThreads silenciosos no dashboard

Data de execucao: 2026-06-15
Checklist de referencia: docs/ops/imob-surface-data-reliability-checklist.md (item 10)
Status promovido para: `evidenciado`

---

## Descricao do alerta

`dashboard.tsx` definia `syntheticThreads` (3 threads com IDs `th-captacao`, `th-contrato`,
`th-comissao`) e os usava como:

1. **Estado inicial** — `useState(syntheticThreads)` tornava o estado sujo desde o mount
2. **Fallback sem conversationId** — `setThreads(syntheticThreads)` silencioso (linha 519)
3. **Fallback em lista vazia** — quando API retornava zero threads (linha 536)
4. **Fallback em erro de API** — quando `apiListImobChatThreads` lancava excecao (linha 541)

Adicionalmente, `requestedThreadId` (param `?threadId=` da URL) era aplicado a
`selectedThreadId` por um `useEffect` de sync cego — sem verificar se o ID existia
em threads reais. IDs sinteticos ou stale podiam:

- Acionar a heuristica de `contextCase` (linhas 900–921) contra casos reais,
  vinculando caso real a thread inexistente
- Entrar em deeplinks de chat com `threadId=th-captacao` (ID inexistente no backend)
- Persistir na URL como estado de selecao invalido

O disclaimer existente ("Timeline em modo simulado...") era `text-muted-foreground`
e nao impedia selecao nem cascata de efeitos.

---

## Patch aplicado

Arquivo: `apps/web/src/pages/app/imob/dashboard.tsx`

Mudancas:
- `syntheticThreads` (linhas 73–98) removido completamente
- Estado inicial: `threads = []`, `threadSource = "no_conversation"`, `selectedThreadId = null`
- `useEffect` de sync cego (`setSelectedThreadId(requestedThreadId)`) removido
- `useEffect` de carregamento reescrito com 4 estados limpos:
  - sem `conversationId`: `threads = []`, `threadSource = "no_conversation"`, `selectedThreadId = null`
  - API retorna threads: `threadSource = "real"`, `requestedThreadId` honrado somente se `confirmed` na lista real
  - API retorna lista vazia: `threads = []`, `threadSource = "empty"`, `selectedThreadId = null`
  - API com erro: `threads = []`, `threadSource = "error"`, `selectedThreadId = null`
- Disclaimer sintetico substituido por empty states semanticos:
  - `threadSource === "no_conversation"`: "Abra uma conversa no chat para ver os threads desta jornada."
  - `threadSource === "error"`: mensagem em `text-rose-300/80`
- `ThreadPanel` recebe `emptyText` variavel por estado

---

## Comportamento de requestedThreadId apos o patch

| Cenario | Comportamento anterior | Comportamento atual |
|---------|----------------------|---------------------|
| Sem `conversationId` | `selectedThreadId = requestedThreadId` (aceito cego) | `selectedThreadId = null` |
| API retorna threads reais | Mantinha se na lista; limpava se ausente | Honrado somente se `confirmed` |
| API retorna lista vazia | `selectedThreadId = requestedThreadId` (stale ativo) | `selectedThreadId = null` |
| API com erro | `selectedThreadId = requestedThreadId` (stale ativo) | `selectedThreadId = null` |
| Interacao de usuario | Funciona normalmente | Funciona normalmente (nao afetado) |

---

## Comandos executados

```
node --import tsx/esm --test \
  apps/web/src/pages/app/imob/dashboard.threads.test.ts
```

---

## Output dos testes (9/9)

```
TAP version 13
ok 1 - dashboard.tsx does not define syntheticThreads
ok 2 - dashboard.tsx does not use synthetic thread IDs
ok 3 - dashboard.tsx threadSource type does not include 'synthetic'
ok 4 - dashboard.tsx selectedThreadId initializes to null (not requestedThreadId)
ok 5 - dashboard.tsx threads state initializes to empty array
ok 6 - dashboard.tsx does not blindly sync requestedThreadId to selectedThreadId
ok 7 - dashboard.tsx honors requestedThreadId only when confirmed in real threads
ok 8 - dashboard.tsx uses no_conversation empty state (not synthetic fallback) when conversationId is absent
ok 9 - dashboard.tsx shows semantic empty state messages in ThreadPanel section
1..9
# tests 9 | pass 9 | fail 0
```

---

## Arquivos cobertos

| Arquivo | Papel |
|---------|-------|
| `apps/web/src/pages/app/imob/dashboard.tsx` | Arquivo corrigido (patch) |
| `apps/web/src/pages/app/imob/dashboard.threads.test.ts` | Suite de verificacao A2 |

---

## Criterio de aceitacao — verificado

- [x] `syntheticThreads` ausente de `dashboard.tsx`
- [x] IDs sinteticos (`th-captacao`, `th-contrato`, `th-comissao`) ausentes
- [x] `threadSource` nunca assume o valor `"synthetic"`
- [x] `selectedThreadId` inicia `null` (nao `requestedThreadId`)
- [x] `threads` inicia `[]` (nao `syntheticThreads`)
- [x] `useEffect` de sync cego removido
- [x] `requestedThreadId` honrado somente quando confirmado em thread real
- [x] Empty state semantico presente para `"no_conversation"`
- [x] `dashboard.threads.test.ts` 9/9 pass

---

## Conclusao

O alerta A2 esta evidenciado. `syntheticThreads` foi removido completamente.
`requestedThreadId` da URL so e aplicado a `selectedThreadId` apos confirmacao
contra a lista de threads reais retornada pela API — ID stale, sintetico ou
inexistente nunca aciona `contextCase` nem entra em deeplinks operacionais.

Alertas A1/A3/A5/A7 permanecem abertos — nao foram alterados nesta etapa.
