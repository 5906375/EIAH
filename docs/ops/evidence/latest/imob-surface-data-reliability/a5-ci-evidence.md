# A5 — Evidence Record
# IMOB Surface Data Reliability — delegateeId como proxy de ownerId e fallback sintético em partners.tsx

Data de execucao: 2026-06-15
Checklist de referencia: docs/ops/imob-surface-data-reliability-checklist.md (item 33)
Status: `evidenciado`

---

## Descricao do alerta

`partners.tsx` apresentava duas violacoes de superficie:

**V1 — Fallback sintetico silencioso**: `syntheticPartners` (3 parceiros hardcoded:
"Prime Imoveis", "Litoral Brokers", "Atlantica Realty") eram usados como estado inicial
e como fallback quando `apiListDelegations` retornava lista vazia ou lancava erro.
Um workspace operacional sem delegacoes ativas via parceiros ficticios como se fossem reais.

**V2 — `delegateeId` como display name**: a cadeia de fallback de `partnerName` era:
`item.publisherName || item.marketplaceName || item.delegateeId || "Parceiro da rede"`
Quando `publisherName` e `marketplaceName` eram `null`, o UUID bruto de `delegateeId`
(identificador de workspace no sistema de marketplace) aparecia como nome do parceiro
na UI — dado tecnico sem significado para o usuario.

---

## Patch aplicado

Mudancas exclusivamente em `partners.tsx`. Sem alteracao de endpoints, tipos globais,
queries, `apiListDelegations` ou `mapDelegationsToPartners`.

### Estado inicial

```ts
// antes:
const [partners, setPartners] = React.useState<PartnerRow[]>(syntheticPartners);
const [source, setSource] = React.useState<"real" | "fallback">("fallback");

// depois:
const [partners, setPartners] = React.useState<PartnerRow[]>([]);
const [source, setSource] = React.useState<"real" | "empty" | "error">("empty");
```

### Ramo de API vazia

```ts
// antes:
setPartners(syntheticPartners); setSource("fallback");

// depois:
setPartners([]); setSource("empty");
```

### Ramo de erro de API

```ts
// antes:
setPartners(syntheticPartners); setSource("fallback");

// depois:
setPartners([]); setSource("error");
```

### Display name de parceiro

```ts
// antes:
item.publisherName || item.marketplaceName || item.delegateeId || "Parceiro da rede"

// depois:
item.publisherName || item.marketplaceName || "Parceiro sem nome cadastrado"
```

`delegateeId` continua sendo usado como `partnerKey` (chave de agrupamento) — apenas
removido da cadeia de fallback de nome visivel ao usuario.

### Badge de fonte

```tsx
// antes:
{loading ? "loading" : source === "real" ? "backend" : "fallback"}

// depois:
{loading ? "carregando" : source === "real" ? "delegações marketplace" : source === "error" ? "indisponível" : "sem delegações"}
```

---

## Confirmacao de invariantes

- `apiListDelegations({ role: "all", workspaceScoped: true })` — inalterado
- `mapDelegationsToPartners()` — logica de agrupamento por `delegateeId`/`delegatorId` inalterada
- `DelegationPolicy` type — inalterado
- `PartnerRow` type — inalterado
- Nenhum endpoint, query ou tipo global alterado
- `dashboard.tsx` — nao tocado

---

## Comandos executados

```
cd apps/web
node --import tsx/esm --test src/pages/app/imob/partners.test.ts
```

---

## Output dos testes (14/14)

```
TAP version 13
ok 1 - partners.tsx does not contain 'Casos em parceria'
ok 2 - partners.tsx uses 'Políticas delegadas' as KPI label
ok 3 - partners.tsx does not use activeCases field name
ok 4 - partners.tsx uses delegationPoliciesCount field name
ok 5 - partners.tsx não declara syntheticPartners
ok 6 - partners.tsx não usa IDs sintéticos de parceiro
ok 7 - partners.tsx inicializa partners como array vazio
ok 8 - partners.tsx usa source 'empty' para API vazia (não fallback)
ok 9 - partners.tsx usa source 'error' para falha de API (não fallback)
ok 10 - partners.tsx não usa 'fallback' como valor de source
ok 11 - partners.tsx não usa delegateeId como fallback de nome de parceiro
ok 12 - partners.tsx usa fallback de nome 'Parceiro sem nome cadastrado'
ok 13 - partners.tsx badge de fonte distingue 'delegações marketplace' de 'sem delegações'
ok 14 - partners.tsx não alterou apiListDelegations
1..14
# tests 14 | pass 14 | fail 0
```

Testes 1–4: cobertura de A10 (nao-regressao).
Testes 5–14: cobertura de A5.

---

## Arquivos cobertos

| Arquivo | Papel |
|---------|-------|
| `apps/web/src/pages/app/imob/partners.tsx` | Remocao de sintetico, source semantico, display name sem UUID |
| `apps/web/src/pages/app/imob/partners.test.ts` | Suite de verificacao A5+A10 (14 testes) |

---

## Criterio de aceitacao — verificado

- [x] `syntheticPartners` removido do modulo
- [x] Estado inicial `partners = []`
- [x] API vazia → `source = "empty"`, `partners = []` (sem sintetico)
- [x] Erro de API → `source = "error"`, `partners = []` (sem sintetico)
- [x] `delegateeId` ausente da cadeia de fallback de `partnerName`
- [x] Fallback de nome: `"Parceiro sem nome cadastrado"`
- [x] Badge: `"delegações marketplace"` / `"sem delegações"` / `"indisponível"`
- [x] `apiListDelegations` inalterado (confirmado por teste)
- [x] `partners.test.ts` 14/14 pass

---

## Conclusao

A5 evidenciado. Fallback sintetico removido de `partners.tsx`; `delegateeId` (UUID de
workspace) nao mais exposto como nome de parceiro; estados de fonte semanticamente
distintos (`real`/`empty`/`error`) substituem o antigo `"fallback"` generico.

Proximo alerta: A7 — `contextCase` resolvido por heuristica de texto/flow sem indicacao
ao usuario na aba Solucoes.
