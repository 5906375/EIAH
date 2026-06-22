# IMOB Chat Workbench — Fase 9.4.2 Desktop Composition & Chat Lane Width

Data: 2026-06-19  
Status: EVIDENCIADO  
Escopo: controle da largura útil da faixa conversacional em desktop/ultra-wide, preservando shell imersivo, grid multi-vertical e a densidade mobile da Fase 9.4.1.

## Causa do excesso de largura

O shell multi-vertical já tinha boa estrutura visual, mas a coluna central ainda deixava `header`, timeline e composer ocuparem quase toda a largura do `main`. Em desktop largo isso gerava:

- chat visualmente disperso;
- composer largo demais em relação ao conteúdo;
- distância excessiva entre conversa e painel direito;
- sensação de canvas vazio mesmo sem reintroduzir um `max-w-6xl` global.

## Arquivos modificados

| Arquivo | Mudança |
| --- | --- |
| `apps/web/src/pages/app/imob/chat.tsx` | Introdução de `chatLaneClassName` e centralização da largura útil do header interno, access gate, banner de rascunho, timeline e composer. |
| `scripts/smoke-9-4-2.mjs` | Smoke Playwright da fase 9.4.2 com métricas objetivas de `laneWidth`, `composerWidth`, `articleWidth`, `devicePixelRatio` e screenshots em 6 resoluções. |
| `docs/ops/evidence/latest/phase-9-4-2-desktop-composition-chat-lane-width/phase-9-4-2-desktop-composition-chat-lane-width.md` | Evidência desta fase. |
| `docs/EVIDENCE_INDEX.md` | Índice atualizado para a evidência criada. |

## Ajustes aplicados

- a malha externa do `VerticalWorkbenchShell` foi preservada;
- a contenção foi aplicada apenas à faixa conversacional;
- `chatLaneClassName` passou a usar:
  - `mx-auto w-full xl:max-w-[82%]`
- o wrapper foi aplicado a:
  - header interno do chat;
  - `ImobAccessGateCard`;
  - faixa de rascunho de contrato;
  - lista/timeline de mensagens;
  - quick actions;
  - composer.

## Validação de runtime

### Runtime local-docker

```bash
curl -I http://127.0.0.1:5173/app/imob/chat
curl -I http://127.0.0.1:5173/src/pages/app/imob/chat.tsx
```

Resultado:

- `/app/imob/chat` respondeu `200 OK`
- `/src/pages/app/imob/chat.tsx` respondeu `200 OK`

### Browser smoke real

```bash
node scripts/smoke-9-4-2.mjs
```

Resultado: **38/38 checks OK**

Medições principais:

- `1440×900`
  - `articleWidth = 771`
  - `laneWidth = 599`
  - `composerWidth = 599`
  - `laneRatio = 0.7769`
  - `textareaY = 497`
- `1600×900`
  - `articleWidth = 931`
  - `laneWidth = 730`
  - `composerWidth = 730`
  - `laneRatio = 0.7841`
  - `textareaY = 497`
- `1920×1080`
  - `articleWidth = 1251`
  - `laneWidth = 992`
  - `composerWidth = 992`
  - `laneRatio = 0.7930`
- `2048×1152`
  - `articleWidth = 1379`
  - `laneWidth = 1097`
  - `composerWidth = 1097`
  - `laneRatio = 0.7955`
- `390×844`
  - `textareaY = 673`
  - `visibleAsides = 0`
- `375×667`
  - `textareaY = 550`
  - `visibleAsides = 0`

Leitura:

- o chat lane deixou de ocupar quase toda a largura da coluna central em desktop largo;
- o composer ficou alinhado à largura útil do conteúdo;
- o painel direito continuou visível e próximo;
- a densidade mobile da Fase 9.4.1 permaneceu intacta;
- o smoke rodou com `devicePixelRatio = 1`, equivalente a zoom 100% no contexto headless usado para a evidência.

## Screenshots por resolução

Arquivos em `docs/ops/evidence/latest/phase-9-4-2-desktop-composition-chat-lane-width/`:

- `after-1440x900.png`
- `after-1600x900.png`
- `after-1920x1080.png`
- `after-2048x1152.png`
- `after-390x844.png`
- `after-375x667.png`
- `smoke-results-9-4-2.json`

## Testes focados

```bash
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test \
  apps/web/src/features/imob/imobWorkbenchContext.test.ts \
  apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx \
  apps/web/src/features/imob/imobContractIntakeDraftCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeResultCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeApiClient.test.ts
```

Resultado: **5/5 arquivos pass**, exit `0`

## Grep anti-hardcode

Comando bruto exigido:

```bash
rg -n "João|Maria|Mariana|850\.000|matricula_imovel_12345|contrato_compra_venda\.pdf|apartamento 101|12345" \
  apps/web/src/App.tsx apps/web/src/pages/app/imob/chat.tsx apps/web/src/features/imob apps/web/src/features/workbench
```

Leitura:

- o comando bruto continua retornando apenas fixtures e ids artificiais de arquivos de teste;
- nenhuma evidência de hardcode do mock nos arquivos de produção alterados desta fase.

Verificação focada:

```bash
rg -n "João|Maria|Mariana|850\.000|matricula_imovel_12345|contrato_compra_venda\.pdf|apartamento 101|12345" \
  apps/web/src/App.tsx \
  apps/web/src/pages/app/imob/chat.tsx \
  apps/web/src/features/imob/ImobWorkbenchShell.tsx \
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

- backend não alterado
- auth/entitlement não alterados
- worker não alterado
- storage/draft/retention/observability não alterados
- `ChatAgentLauncher` intocado
- shell imersivo preservado
- `VerticalWorkbenchShell` preservado
- `WorkbenchPanelCard` preservado
- nenhuma rota nova
- nenhum dado do mock hardcoded
- nenhum `stage/status/journeyType` novo
- status operacional permanece **PILOTO CONTROLADO**
- object storage real permanece **NO-GO**
- multi-instância permanece **NO-GO**

## Conclusão

A Fase 9.4.2 ficou evidenciada. O IMOB Workbench preserva o shell SaaS imersivo e a base multi-vertical, mas agora controla a largura útil da conversa em desktop largo: chat e composer ficam visualmente coesos, o painel direito continua próximo e o mobile compacto da 9.4.1 permanece sem regressão.
