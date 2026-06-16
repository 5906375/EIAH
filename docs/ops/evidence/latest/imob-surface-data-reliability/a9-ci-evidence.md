# A9 — Evidence Record
# IMOB Surface Data Reliability — properties.tsx nunca saia do modo demo

Data de execucao: 2026-06-15
Checklist de referencia: docs/ops/imob-surface-data-reliability-checklist.md (item 14, 34)
Status: `evidenciado`

---

## Descricao do alerta

`properties.tsx` inicializava estado com `syntheticProperties` (array de 5 imóveis
hardcoded com IDs sintéticos como `"prop-001"`, `"prop-002"`) e nunca chamava
`apiListImobProperties()`. A secao "Imoveis" do dashboard exibia sempre dados de
demonstração independente do workspace real do tenant.

IDs sintéticos (prop-001 a prop-005) nao sao reconciliaveis com nenhuma entidade
real na API — um workspace operacional exibia contadores de demonstracao como reais.

---

## Patch aplicado

### `apps/web/src/pages/app/imob/properties.tsx`

- `syntheticProperties` removido completamente
- Estado inicial: `properties = []`
- Pagina chama `apiListImobProperties()` com estados loading e erro
- Badge de fonte adicionado ao KPI strip: `"backend"` quando dados reais, `"sem dados"` quando vazio
- Empty state semantico: "Nenhum imóvel cadastrado no workspace." (sem sintético)
- "Com parceiro" renomeado para "Com proprietário" (campo real `owner?.name`)

---

## Comandos executados

```
cd apps/web
node --import tsx/esm --test src/pages/app/imob/properties.test.ts
```

---

## Output dos testes (5/5)

```
TAP version 13
ok 1 - properties.tsx does not contain syntheticProperties
ok 2 - properties.tsx does not use synthetic property IDs (prop-001 to prop-005)
ok 3 - properties.tsx calls apiListImobProperties
ok 4 - properties.tsx shows source badge in KPI strip
ok 5 - properties.tsx does not use 'Com parceiro' label
1..5
# tests 5 | pass 5 | fail 0
```

---

## Arquivos cobertos

| Arquivo | Papel |
|---------|-------|
| `apps/web/src/pages/app/imob/properties.tsx` | Remocao de sintetico, chamada real de API, badge de fonte |
| `apps/web/src/pages/app/imob/properties.test.ts` | Suite de verificacao A8+A9 (5 testes) |

---

## Criterio de aceitacao — verificado

- [x] `syntheticProperties` ausente do modulo
- [x] IDs sinteticos `prop-001..prop-005` ausentes
- [x] `apiListImobProperties()` chamada na montagem
- [x] Badge de fonte presente no KPI strip
- [x] Label `"Com parceiro"` substituido por `"Com proprietário"`
- [x] `properties.test.ts` 5/5 pass
