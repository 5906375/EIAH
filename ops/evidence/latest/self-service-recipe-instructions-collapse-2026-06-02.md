# Self-service Recipe Instructions Collapse — 2026-06-02

## Objetivo

Reduzir ruído visual em cards de recipes homologadas no `self-service` quando o campo de instruções é longo, sem alterar layout responsivo, fluxo de publicação ou roteamento.

## Ajuste aplicado

- adicionado bloco local colapsável em `apps/web/src/pages/self-service/index.tsx`
- recipes visíveis no workspace passam a mostrar apenas as primeiras linhas das instruções
- textos longos exibem toggle explícito:
  - `mostrar mais >>>`
  - `mostrar menos >>`
- textos curtos continuam aparecendo por completo, sem botão extra

## Escopo

- somente cards de `Receitas visíveis neste workspace`
- nenhuma mudança no formulário de publicação
- nenhuma mudança na lógica de tenant/workspace

## Validação

- `pnpm check:self-service-runtime-graph`
- `pnpm check:frontend-duplication`

## Resultado

O card continua compacto e legível mesmo com instruções extensas, preservando a UI existente e a responsividade do grid.
