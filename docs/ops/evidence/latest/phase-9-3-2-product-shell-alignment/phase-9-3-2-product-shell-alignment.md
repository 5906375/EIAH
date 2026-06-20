# IMOB Chat Workbench — Fase 9.3.2 IMOB Immersive Product Shell

Data: 2026-06-19  
Status: EVIDENCIADO  
Escopo: ajustar o chrome visual de `/app/imob/chat` para um shell mais imersivo e mais próximo de um SaaS dedicado IMOB, sem alterar backend, auth, entitlement, contratos, storage, draft, retention, observability ou `ChatAgentLauncher`.

## Arquivos modificados

| Arquivo | Mudança |
| --- | --- |
| `apps/web/src/App.tsx` | Oculta o header/topbar global apenas em `/app/imob/chat` e troca o fundo por um canvas claro dedicado ao shell IMOB. |
| `apps/web/src/features/workbench/VerticalWorkbenchShell.tsx` | Converte a faixa técnica em header de produto, adiciona retorno discreto ao Command Center e compacta o hero em mobile. |
| `apps/web/src/features/imob/ImobWorkbenchShell.tsx` | Configura copy e destino seguro do header de produto para IMOB. |
| `apps/web/src/pages/app/imob/chat.tsx` | Simplifica o header interno central para “Workspace atual / Chat ativo”, preservando chat e quick actions. |
| `apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx` | Atualiza asserts do shell imersivo. |
| `scripts/smoke-9-3-2.mjs` | Atualiza smoke Playwright para 4 viewports-alvo e novos marcadores do shell imersivo. |

## Validação executada

### Teste focado

```bash
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx
```

Resultado: `pass` — exit `0`

### Check de evidência

```bash
pnpm check:evidence-index
```

Resultado: `ok: true`

### Browser smoke real

```bash
node scripts/smoke-9-3-2.mjs
```

Execução real com Playwright Chromium headless, fora do sandbox do host, contra `http://localhost:5173/app/imob/chat`.

Resultado: **26/26 checks OK**

## O que foi validado

- `/app/imob/chat` responde com shell IMOB dedicado e header global corporativo oculto.
- O header do produto mostra:
  - `IMOB Product Shell`
  - `Document Intake / IMOB v2.1`
  - `Voltar ao Command Center`
  - badge `Piloto controlado`
- A faixa técnica antiga `IMOB Conversation Workbench` não aparece.
- O header central do chat foi reduzido para contexto leve:
  - `Workspace atual`
  - `Chat ativo`
- O painel contextual continua render-only com `Resumo do intake`.
- O layout preserva:
  - sidebar escura;
  - área central clara;
  - painel direito claro;
  - toggle de `Painel contextual` fora de `xl`;
  - quick actions/input visíveis inclusive em mobile.

## Viewports validados

| Viewport | Resultado |
| --- | --- |
| `1440×900` | shell imersivo ativo, input visível |
| `1280×800` | shell imersivo ativo, input visível |
| `768×1024` | shell imersivo ativo, input visível |
| `390×844` | shell imersivo ativo, input visível |

## Screenshots geradas

Arquivos em `docs/ops/evidence/latest/phase-9-3-2-product-shell-alignment/`:

- `after-1440x900.png`
- `after-1280x800.png`
- `after-768x1024.png`
- `after-390x844.png`
- `smoke-results-9-3-2.json`

## Anti-hardcode

Verificação focada nos arquivos do shell IMOB desta fase:

```bash
rg -n "João|Maria|850\.000|matricula_imovel_12345|contrato_compra_venda\.pdf|apartamento 101" \
  apps/web/src/App.tsx \
  apps/web/src/pages/app/imob/chat.tsx \
  apps/web/src/features/imob/ImobWorkbenchShell.tsx \
  apps/web/src/features/workbench/VerticalWorkbenchShell.tsx \
  apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx
```

Resultado: **0 ocorrências** nos arquivos do shell IMOB validados.

## Invariantes preservadas

- `VerticalWorkbenchShell` preservado como base.
- `WorkbenchPanelCard` preservado.
- `ChatAgentLauncher` sem nova lógica de negócio.
- Backend, worker, storage, draft, retention e observability não alterados.
- Nenhuma rota nova criada.
- Nenhum dado do mock foi hardcoded como dado real.
- Nenhum `stage`, `status` ou `journeyType` novo.
- PII não aparece nas capturas nem no shell.
- Status operacional permanece **PILOTO CONTROLADO**.

## Conclusão

A Fase 9.3.2 ficou evidenciada com runtime real e screenshots nas 4 resoluções pedidas. A rota `/app/imob/chat` agora comunica um produto IMOB dedicado, com chrome corporativo reduzido, retorno seguro ao Command Center e responsividade preservada, sem alterar lógica de backend ou fluxo do chat.
