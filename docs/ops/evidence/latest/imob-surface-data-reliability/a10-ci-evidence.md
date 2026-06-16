# A10 — Evidence Record
# IMOB Surface Data Reliability — "Casos em parceria" = contagem de delegacoes, nao de casos CRM

Data de execucao: 2026-06-15
Checklist de referencia: docs/ops/imob-surface-data-reliability-checklist.md (item 4)
Status: `evidenciado`

---

## Descricao do alerta

O KPI "Casos em parceria" em `partners.tsx` contava `PartnerRow.activeCases` — um
campo que acumulava políticas de delegação de marketplace, não casos CRM reais.
O label induzia o usuario a concluir que havia X "casos" ativos em parceria, quando
na verdade havia X políticas de delegação (conceito distinto no dominio IMOB).

Adicionalmente, o card de cada parceiro exibia "{X} processos ativos", reforçando a
leitura incorreta de que delegacoes eram processos CRM.

---

## Patch aplicado

### `apps/web/src/pages/app/imob/partners.tsx`

- KPI label: `"Casos em parceria"` → `"Políticas delegadas"`
- Campo `PartnerRow.activeCases` → `PartnerRow.delegationPoliciesCount`
- Card: `"{X} processos ativos"` → `"{X} políticas ativas"`

Nenhum endpoint, query ou tipo global alterado.

---

## Comandos executados

```
cd apps/web
node --import tsx/esm --test src/pages/app/imob/partners.test.ts
```

---

## Output dos testes (4 de A10; 14 total com A5)

```
TAP version 13
ok 1 - partners.tsx does not contain 'Casos em parceria'
ok 2 - partners.tsx uses 'Políticas delegadas' as KPI label
ok 3 - partners.tsx does not use activeCases field name
ok 4 - partners.tsx uses delegationPoliciesCount field name
[... + 10 testes de A5 ...]
1..14
# tests 14 | pass 14 | fail 0
```

---

## Arquivos cobertos

| Arquivo | Papel |
|---------|-------|
| `apps/web/src/pages/app/imob/partners.tsx` | Label e campo renomeados |
| `apps/web/src/pages/app/imob/partners.test.ts` | Suite de verificacao A10 (4 testes, parte do total de 14 com A5) |

---

## Criterio de aceitacao — verificado

- [x] `"Casos em parceria"` ausente do modulo
- [x] `"Políticas delegadas"` presente como label do KPI
- [x] `activeCases` ausente do modulo
- [x] `delegationPoliciesCount` presente
- [x] `partners.test.ts` 14/14 pass (4 de A10 + 10 de A5)
