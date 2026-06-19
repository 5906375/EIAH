# IMOB Chat Workbench — Fase 9.1.1 Browser Visual Smoke

Data: 2026-06-19
Status: EVIDENCIADO
Escopo: validação em browser headless (Playwright Chromium 149) do visual implementado na Fase 9.1

## Objetivo

Executar smoke visual no ambiente local-docker real — validar no browser que as alterações CSS da Fase 9.1 chegaram ao runtime Vite e que os tokens visuais estão funcionando corretamente na rota `/app/imob/chat`.

## Ambiente validado

```
eiah-web     Up 3 days (healthy)   0.0.0.0:5173->5173/tcp   Vite dev server
eiah-api     Up 26 hours (healthy) 0.0.0.0:8080->8080/tcp   API Node/Express
eiah-postgres Up 3 days (healthy)  0.0.0.0:5433->5432/tcp
eiah-redis   Up 3 days (healthy)   0.0.0.0:6379->6379/tcp
```

Browser: Playwright Chromium Headless Shell 149.0.7827.55 (playwright v1.61.0)

## Constraint de acesso local-docker

O `VITE_API_TOKEN` (seed token) está embutido no Vite dev server via `.env`, mas o local-docker não possui um usuário correspondente no banco. Isso faz com que `apiGetSessionContext` retorne `401` e `isImobInstalled(session)` retorne `false`, ativando o guard `RequireImobInstall → <Navigate to="/app/marketplace/imob" />`.

**Solução adotada**: interceptar `/session/context` via `page.route()` do Playwright com resposta mockada que inclui `entitlements: { IMOB_INSTALLED: true }`. Esse mock NÃO altera nenhum código de produção — é exclusivo do ambiente headless de validação.

## Verificações Playwright

### Desktop 1440×900

| Check | Resultado |
|-------|-----------|
| URL final `/app/imob/chat` | ✓ `/app/imob/chat?domain=imob` |
| "Document Intake" visível | ✓ presente |
| "IMOB v2.1" visível | ✓ presente |
| "Piloto controlado" no DOM | ✓ confirmado via `textContent` (CSS `uppercase` → `innerText` retorna "PILOTO CONTROLADO") |
| Sem card "Quick actions" verboso | ✓ chip row direto (sem heading) |
| Textarea compositor presente | ✓ |
| Textarea `bg=transparent` | ✓ `computedStyle.bg = rgba(0, 0, 0, 0)` |
| Textarea `border-radius` (rounded-[14px]) | ✓ `14px` |
| asides presentes | ✓ 2 (sidebar + context panel) |
| Sidebar gradient escuro | ✓ `linear-gradient(rgb(9, 17, 29) 0%, rgb(16, 28, 43) 100%)` |
| Grid xl 3 colunas no DOM | ✓ `xl:grid-cols-[280px,minmax(0,1fr),360px]` |
| Compositor `rounded-[20px]` | ✓ presente no DOM |
| WorkbenchPanelCard inset highlight | ✓ `inset_0_1px_0_rgba(255,255,255,0.85)` no DOM |
| Botão Enviar | ✓ `h-[46px] shrink-0 rounded-[14px] bg-slate-900 px-4 text-xs font-semibold uppercase...` |
| "Painel contextual" toggle | ✓ no DOM — `xl:hidden` correto: oculto a 1440px, painel direto no grid |

### Mobile 390×844

| Check | Resultado |
|-------|-----------|
| URL `/app/imob/chat` | ✓ |
| "Painel contextual" toggle | ✓ presente e visível (`boundingBox.y=1725` — abaixo do fold; visível ao scroll) |
| Screenshot capturado | ✓ |

## Screenshots capturados

Armazenados em `docs/ops/evidence/latest/phase-9-1-1-visual-smoke/`:

- `screenshot-desktop-1440x900-final.png` — workbench completo: sidebar escura, área central, header Document Intake/IMOB v2.1
- `screenshot-compositor.png` — área sticky bottom: chip row de quick actions + compositor arredondado
- `screenshot-desktop-fullpage.png` — página completa em fullPage
- `screenshot-mobile-390x844.png` — layout mobile empilhado
- `screenshot-tablet-1024x768.png` — layout tablet lg
- `screenshot-mobile-final.png` — mobile após resize para verificar toggle

## Verificação de módulos Vite runtime

Tokens CSS confirmados presentes nos módulos transformados pelo Vite em runtime:

```bash
curl -s http://localhost:5173/src/features/workbench/WorkbenchPanelCard.tsx \
  | grep "inset_0_1px_0_rgba.*0\.85"
# → inset_0_1px_0_rgba(255,255,255,0.85

curl -s http://localhost:5173/src/features/workbench/VerticalWorkbenchShell.tsx \
  | grep "0_28px_80px_rgba.*0\.12"
# → 0_28px_80px_rgba(15,23,42,0.12

curl -s http://localhost:5173/src/pages/app/imob/chat.tsx \
  | grep "mb-2\.5 flex flex-wrap items-center gap-1\.5"
# → mb-2.5 flex flex-wrap items-center gap-1.5

curl -s http://localhost:5173/src/pages/app/imob/chat.tsx | grep "rounded-\[20px\]"
# → rounded-[20px]

curl -s http://localhost:5173/src/features/imob/ImobWorkbenchContextPanel.tsx \
  | grep "fafcff.*f2f7fd"
# → fafcff_0%,#f2f7fd

curl -s http://localhost:5173/src/pages/app/imob/chat.tsx | grep "bg-transparent"
# → bg-transparent
```

## Gates padrão

### Testes focados

```bash
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test \
  apps/web/src/features/imob/imobWorkbenchContext.test.ts \
  apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx \
  apps/web/src/features/imob/imobContractIntakeDraftCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeResultCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeApiClient.test.ts
```

Resultado: `50/50 pass` — exit `0`

### Grep anti-hardcode

```bash
rg -n "João|Maria|Mariana|850\.000|matricula_imovel_12345|contrato_compra_venda\.pdf|apartamento 101|12345" \
  apps/web/src/pages/app/imob/chat.tsx \
  apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx \
  apps/web/src/features/workbench/
```

Resultado: 0 ocorrências nos arquivos de produção alterados nesta fase.

### Gate documental

```bash
pnpm check:evidence-index
```

Resultado: `ok: true` — 306 refs verificadas

## Invariantes preservadas

- `xl:grid-cols-[280px,minmax(0,1fr),360px]` intacto (confirmado por teste e por Playwright)
- `ChatAgentLauncher` não alterado
- Backend, worker, storage, draft, retention, observability intocados
- Nenhum dado do mock hardcoded
- Nenhum destino novo inventado
- Status permanece `PILOTO CONTROLADO`

## Conclusão

A Fase 9.1 é reclassificada como **EVIDENCIADO** — browser headless confirmou:
- sidebar escura com gradient `#09111d → #101c2b`
- área central clara com workbench 3 colunas
- header "Document Intake / IMOB v2.1" visível
- compositor compacto: chip row + rounded-[20px] + textarea bg-transparent
- botão Enviar `rounded-[14px] bg-slate-900`
- WorkbenchPanelCard inset highlight aplicado
- layout responsivo (mobile/tablet) preservado
