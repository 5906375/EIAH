# IMOB Chat Workbench — Fase 9.4 Multi-Vertical SaaS Product Visual Convergence

Data: 2026-06-19  
Status: EVIDENCIADO  
Escopo: convergência visual final do `/app/imob/chat` para um SaaS comercial claro, preservando a fundação multi-vertical criada nas fases 9.0–9.3.3.

## Arquivos modificados

| Arquivo | Mudança |
| --- | --- |
| `apps/web/src/features/workbench/VerticalWorkbenchShell.tsx` | Consolida copy/config visual por props (`heroHighlights`, `panelToggleLabel`) e refina hero/shell genérico. |
| `apps/web/src/features/workbench/WorkbenchPanelCard.tsx` | Refina card base e adiciona `bodyClassName` para maior flexibilidade sem criar outro componente. |
| `apps/web/src/features/imob/ImobWorkbenchShell.tsx` | Centraliza copy/config visual do IMOB em wrapper semântico. |
| `apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx` | Refina header e hierarquia do painel direito, mantendo render-only. |
| `apps/web/src/features/imob/ImobIntakeSummaryPanel.tsx` | Refina blocos internos do resumo do intake com hierarquia mais SaaS. |
| `apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx` | Atualiza assert do label mobile para o painel contextual configurado por vertical. |
| `scripts/smoke-9-4.mjs` | Smoke Playwright dedicado da fase 9.4. |
| `docs/ops/evidence/latest/phase-9-4-multivertical-saas-product-convergence/phase-9-4-multivertical-saas-product-convergence.md` | Evidência desta fase. |
| `docs/EVIDENCE_INDEX.md` | Índice atualizado para a evidência criada. |

## Ajustes visuais finais aplicados

- Hero do shell ficou mais próximo de um produto SaaS:
  - radius maior;
  - sombras mais leves;
  - badges mais polidas;
  - melhor separação entre título, tagline e helper text.
- Sidebar IMOB da 9.3.3 foi preservada e continuou dominante só no eixo lateral.
- Área central clara permaneceu dominante, com mais respiro visual entre header, notice, quick actions e composer.
- Painel direito recebeu header mais claro e cards internos com hierarquia melhor definida.
- `WorkbenchPanelCard` agora suporta customização de corpo sem forçar componentes paralelos.

## O que foi preservado da 9.3.2 e 9.3.3

Da 9.3.2:

- header global da aplicação continua oculto apenas em `/app/imob/chat`;
- `IMOB Product Shell`;
- retorno seguro `Voltar ao Command Center`;
- shell imersivo payload-driven;
- composer e quick actions preservados.

Da 9.3.3:

- sidebar escura limpa;
- `Conversas do intake`;
- ações `Nova conversa` / `Ver operações`;
- `Busca rápida`;
- lista de conversas mais leve;
- handlers e fluxo da sidebar intactos.

## O que foi consolidado como multi-vertical

### Mantido genérico

- `VerticalWorkbenchShell` continua sendo o shell base.
- `WorkbenchPanelCard` continua sendo o card base.
- slots `sidebar`, `main` e `contextPanel` permanecem.
- layout desktop/tablet/mobile permanece no shell genérico.

### Consolidado por props/config

- `panelToggleLabel` saiu de hardcode no shell genérico.
- `heroHighlights` saiu de hardcode no shell genérico.
- copy do hero (`eyebrow`, `title`, `description`, `helperText`, `productTagline`, `backLabel`) ficou concentrada em `ImobWorkbenchShell`.

### Mantido específico do IMOB

- textos `Document Intake / IMOB v2.1`, `IMOB`, `Piloto controlado`
- copy semântica do painel/contexto IMOB
- labels do resumo do intake e exportação

## Como outra vertical usaria a base

Uma futura vertical não precisa criar um shell novo. Ela pode:

1. criar um wrapper semântico como `LegalWorkbenchShell`;
2. passar ao `VerticalWorkbenchShell`:
   - `eyebrow`
   - `title`
   - `description`
   - `helperText`
   - `verticalLabel`
   - `statusLabel`
   - `panelToggleLabel`
   - `heroHighlights`
3. continuar usando os mesmos slots:
   - `sidebar`
   - `main`
   - `contextPanel`
4. usar `WorkbenchPanelCard` como base para os cards internos.

Isso preserva a fundação multi-vertical sem virar uma tela hardcoded só para IMOB.

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
node scripts/smoke-9-4.mjs
```

Resultado: **21/21 checks OK**

Checks centrais:

- `IMOB Product Shell` presente
- `Resumo do intake` presente
- `Resumo render-only` vindo de `heroHighlights`
- `Shell imersivo` vindo de `heroHighlights`
- nova sidebar presente
- helper do painel direito presente
- textarea visível em todas as resoluções
- desktop com 2 asides preservado
- sidebar continua oculta abaixo de `lg`, preservando a 9.3.1

## Screenshots por resolução

Arquivos em `docs/ops/evidence/latest/phase-9-4-multivertical-saas-product-convergence/`:

- `after-1440x900.png`
- `after-1280x800.png`
- `after-768x1024.png`
- `after-390x844.png`
- `smoke-results-9-4.json`

## Grep anti-hardcode

Comando bruto exigido:

```bash
rg -n "João|Maria|Mariana|850\.000|matricula_imovel_12345|contrato_compra_venda\.pdf|apartamento 101|12345" \
  apps/web/src/App.tsx apps/web/src/pages/app/imob/chat.tsx apps/web/src/features/imob apps/web/src/features/workbench
```

Leitura:

- o comando bruto continua retornando apenas fixtures de `*.test.tsx`;
- não houve ocorrência nos arquivos de produção alterados desta fase.

Verificação focada nos arquivos de produção alterados:

```bash
rg -n "João|Maria|Mariana|850\.000|matricula_imovel_12345|contrato_compra_venda\.pdf|apartamento 101|12345" \
  apps/web/src/App.tsx \
  apps/web/src/pages/app/imob/chat.tsx \
  apps/web/src/features/imob/ImobWorkbenchShell.tsx \
  apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx \
  apps/web/src/features/imob/ImobIntakeSummaryPanel.tsx \
  apps/web/src/features/workbench/VerticalWorkbenchShell.tsx \
  apps/web/src/features/workbench/WorkbenchPanelCard.tsx
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
- nenhuma arquitetura paralela criada
- Product Shell 9.3.2 preservado
- Sidebar 9.3.3 preservada/melhorada
- responsividade 9.3.1 preservada
- auth/entitlement 9.2 intocados
- backend não alterado
- worker não alterado
- storage/draft/retention/observability não alterados
- `ChatAgentLauncher` intocado
- nenhum dado do mock hardcoded como dado real
- PII não aparece
- status operacional permanece **PILOTO CONTROLADO**

## Conclusão

A Fase 9.4 ficou evidenciada. O IMOB se aproxima mais do visual SaaS final da referência, mas a solução permanece sustentada pela base multi-vertical existente: o shell genérico segue genérico, a copy/config específica foi empurrada para o wrapper IMOB, e outra vertical pode reutilizar a mesma estrutura apenas trocando props e conteúdo real.
