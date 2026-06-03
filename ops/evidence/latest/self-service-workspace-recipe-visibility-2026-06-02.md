# Self-service Workspace Recipe Visibility — 2026-06-02

## Objetivo

Corrigir a vitrine `Receitas visíveis neste workspace` quando a recipe foi homologada com escopo `Workspace atual`, mas não aparecia no `self-service` do workspace ativo.

## Sintoma observado

- a recipe aparecia em `Gerenciar catálogo do tenant`
- status persistido: `homologated`
- escopo persistido: `selected_workspaces`
- `workspace_scope_ids` continha o `workspaceId` real do workspace `DEFAULT`
- a listagem `view=workspace` ainda não retornava a recipe

## Causa raiz

O backend da listagem de `tenant-recipes` filtrava sempre por `request.authContext.workspaceId`, isto é, o workspace vinculado ao token autenticado, sem considerar o `workspaceId` explicitamente pedido pelo cliente via headers de sessão.

Na prática, a recipe podia ser publicada para o workspace selecionado na UI e ainda assim sumir da vitrine se a sessão/token usado na listagem estivesse defasado em relação ao workspace ativo do frontend.

## Ajuste aplicado

- criação do utilitário `apps/api/src/routes/tenantRecipeWorkspaceSelection.ts`
- leitura de `x-eiah-workspace` / `x-workspace-id` na rota `GET /tenant-recipes`
- validação de que o workspace pedido pertence ao mesmo tenant autenticado
- uso do workspace efetivo validado apenas para a filtragem `view=workspace`
- manutenção do fallback para `authContext.workspaceId` quando não houver header válido

## Segurança / não regressão

- nenhum alargamento de tenant: override só vale quando o workspace pertence ao mesmo tenant
- sem mudança visual ou responsiva no frontend
- sem alteração do contrato de criação/edição de recipes

## Validação

- `TSX_TSCONFIG_PATH=apps/api/tsconfig.json node --import tsx --test apps/api/src/tests/tenant-recipe-workspace-selection.test.ts`

## Resultado esperado

Recipes homologadas com escopo `Workspace atual` voltam a aparecer no bloco de receitas visíveis do `self-service` quando o workspace ativo da sessão frontend corresponde ao workspace salvo na recipe.
