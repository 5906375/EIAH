# IMOB Chat Workbench — Fase 9.4.1 Mobile Product Shell Density

Data: 2026-06-19  
Status: EVIDENCIADO  
Escopo: compactação do Product Shell do IMOB em mobile/tablet pequeno, preservando a fundação multi-vertical e o desktop da Fase 9.4.

## Causa da densidade mobile

O hero do `VerticalWorkbenchShell` ainda ocupava espaço demais em viewports pequenos por três motivos:

- padding horizontal/vertical ainda alto no bloco superior;
- `description` longa visível em mobile;
- gap e radius do hero herdados do desktop.

O resultado era um shell bonito, mas com pouca densidade prática antes do chat em telas como `375×667`.

## Arquivos modificados

| Arquivo | Mudança |
| --- | --- |
| `apps/web/src/features/workbench/VerticalWorkbenchShell.tsx` | Compactação responsiva do hero abaixo de `sm`: menos padding, gaps e radius; descrição longa oculta em mobile; link de retorno e eyebrow menores. |
| `scripts/smoke-9-4-1.mjs` | Smoke Playwright da fase 9.4.1, incluindo `375×667`. |
| `docs/ops/evidence/latest/phase-9-4-1-mobile-product-shell-density/phase-9-4-1-mobile-product-shell-density.md` | Evidência desta fase. |
| `docs/EVIDENCE_INDEX.md` | Índice atualizado para a evidência criada. |

## Ajustes aplicados

- container externo do shell:
  - `px-3 py-3` → `px-2 py-2` no mobile
- hero:
  - `rounded-[32px]` → `rounded-[26px]` no mobile
  - `px-4 py-4` → `px-3.5 py-3.5` no mobile
  - `gap-5` → `gap-3` no mobile
- back link:
  - tipografia e espaçamento reduzidos no mobile
- eyebrow:
  - `text-[10px] tracking-[0.32em]` → `text-[9px] tracking-[0.28em]` no mobile
- título:
  - `text-[18px]` → `text-[16px]` no mobile
- descrição longa:
  - agora fica oculta abaixo de `sm`
- toggle mobile do painel:
  - `mt-3 rounded-[28px]` → `mt-2 rounded-[24px]` no mobile

## Validação executada

### Testes focados

```bash
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test \
  apps/web/src/features/imob/imobWorkbenchContext.test.ts \
  apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx \
  apps/web/src/features/imob/imobContractIntakeDraftCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeResultCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeApiClient.test.ts
```

Resultado: **5/5 arquivos pass**, exit `0`

### Browser smoke real

```bash
node scripts/smoke-9-4-1.mjs
```

Resultado: **19/19 checks OK**

Principais medições:

- `375×667`
  - `workspaceTop = 160`
  - `textareaY = 550`
  - `descriptionVisible = false`
- `390×844`
  - `textareaY = 673`
- `1440×900`
  - desktop preservado com `2 asides`
  - `textareaY = 497`

## Screenshots por resolução

Arquivos em `docs/ops/evidence/latest/phase-9-4-1-mobile-product-shell-density/`:

- `after-1440x900.png`
- `after-1280x800.png`
- `after-768x1024.png`
- `after-390x844.png`
- `after-375x667.png`
- `smoke-results-9-4-1.json`

## Grep anti-hardcode

Comando bruto exigido:

```bash
rg -n "João|Maria|Mariana|850\.000|matricula_imovel_12345|contrato_compra_venda\.pdf|apartamento 101|12345" \
  apps/web/src/App.tsx apps/web/src/pages/app/imob/chat.tsx apps/web/src/features/imob apps/web/src/features/workbench
```

Leitura:

- o comando bruto continua retornando apenas fixtures de `*.test.tsx`;
- nenhuma ocorrência nos arquivos de produção alterados desta fase.

Verificação focada nos arquivos alterados:

```bash
rg -n "João|Maria|Mariana|850\.000|matricula_imovel_12345|contrato_compra_venda\.pdf|apartamento 101|12345" \
  apps/web/src/App.tsx \
  apps/web/src/pages/app/imob/chat.tsx \
  apps/web/src/features/imob/ImobWorkbenchShell.tsx \
  apps/web/src/features/workbench/VerticalWorkbenchShell.tsx
```

Resultado: **0 ocorrências**

## Gate documental

```bash
pnpm check:evidence-index
```

Resultado: `ok: true`

## Invariantes preservadas

- `VerticalWorkbenchShell` preservado
- `WorkbenchPanelCard` preservado
- desktop da 9.4 preservado
- fundação multi-vertical preservada
- backend não alterado
- auth/entitlement não alterados
- worker não alterado
- storage/draft/retention/observability não alterados
- `ChatAgentLauncher` intocado
- nenhum dado do mock hardcoded
- status operacional permanece **PILOTO CONTROLADO**

## Conclusão

A Fase 9.4.1 ficou evidenciada. Em `375×667`, o Product Shell deixa de dominar o primeiro viewport: a descrição longa some, o hero encolhe e o chat/composer aparecem mais cedo, enquanto desktop e a base multi-vertical permanecem intactos.
