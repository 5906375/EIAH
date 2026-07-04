# IMOB Pilot Badge Drift Fix - 2026-07-02

## Data

- 2026-07-02

## Arquivos lidos

- `AGENTS.md`
- `docs/ops/imob-knowledge-pilot-activation-gate.md`
- `ops/evidence/latest/imob-knowledge-pilot-activation-gate-2026-07-02.md`
- `ops/evidence/latest/imob-knowledge-shadow-run-2026-07-02.md`
- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx`
- `apps/web/src/features/imob/ImobWorkbenchShell.tsx`
- `apps/web/src/features/workbench/VerticalWorkbenchShell.tsx`
- `apps/web/src/components/agents/ChatAgentLauncher.tsx`
- `apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx`

## Arquivos alterados

- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx`
- `apps/web/src/features/imob/ImobWorkbenchShell.tsx`
- `apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx`

## Origem do drift

- o badge visivel `Piloto controlado` estava hardcoded em `apps/web/src/pages/app/imob/chat.tsx`
- o badge visivel `Piloto controlado` estava hardcoded em `apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx`
- `apps/web/src/features/imob/ImobWorkbenchShell.tsx` ainda carregava `statusLabel: "Piloto controlado"` como copy local morta
- `VerticalWorkbenchShell` aceita `statusLabel`, mas nao renderiza esse valor no DOM atual
- `docs/ops/imob-knowledge-pilot-activation-gate.md` e `ops/evidence/latest/imob-knowledge-pilot-activation-gate-2026-07-02.md` continuam com `PENDING_REAL_TENANT_SELECTION` e `PENDING_REAL_OWNER_ASSIGNMENT`
- `ops/evidence/latest/imob-knowledge-shadow-run-2026-07-02.md` confirma que nenhum `tenant/workspace` foi promovido para `pilot` ou `small`

## Correcao aplicada

- remocao da string literal local `Piloto controlado` dos dois pontos visiveis da UI IMOB
- rebaixamento do badge para rotulo neutro `Contexto IMOB`
- ajuste do `title` e `aria-label` do painel contextual para copy neutra baseada em payload seguro
- substituicao da copy morta `statusLabel` em `ImobWorkbenchShell` para `Contexto IMOB`
- ajuste do teste focado para validar o rotulo neutro

## Confirmacoes de escopo

- `pilot` nao foi ativado
- `small` nao foi ativado
- `ChatAgentLauncher` nao foi alterado
- backend nao foi alterado neste PR
- engine nao foi alterado neste PR
- nenhum `tenantId` real foi inventado
- nenhum `workspaceId` real foi inventado
- nenhum owner tecnico ou operacional foi inventado

## Saidas reais dos checks

### `TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx`

```text
TAP version 13
# Subtest: apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx
ok 1 - apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx
  ---
  duration_ms: 350.771896
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 360.13322
```

### `rg -n 'Piloto controlado|PILOTO CONTROLADO' apps/web/src/pages/app/imob/chat.tsx apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx apps/web/src/features/imob/ImobWorkbenchShell.tsx apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx`

```text
(sem saida; exit 1)
```

## Status conservador

- correcao do drift visual do badge: `evidenciado`
- pilot operacional: `parcial`
- `small`: `proposta`
