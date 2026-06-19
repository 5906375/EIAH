# IMOB Chat Workbench — Fase 9.3.1 Responsive UX & Density Hardening

Data: 2026-06-19
Status: EVIDENCIADO
Escopo: Endurecer responsividade do IMOB Workbench em tablet/mobile após Fase 9.3 — visual-only, sem alteração de backend, contratos, workers, storage ou entitlement.

## Objetivo

A Fase 9.3 corrigiu a compressão desktop (1440px e 1280px). Esta fase resolve as quebras responsivas identificadas abaixo de `lg` (1024px): em tablet portrait (768×1024) e mobile (390×844), a sidebar escura do IMOB Workspace empilhava acima do chat e empurrava o composer para fora do viewport.

## Diagnóstico — Causas das Quebras Responsivas

| Viewport | Problema | Textarea Y | Viewport H | Status antes |
|----------|----------|-----------|------------|--------------|
| 1440×900 | Nenhum | 363px | 900px | OK |
| 1280×800 | Nenhum | 363px | 800px | OK |
| 1024×768 | Nenhum (lg breakpoint ativo) | 363px | 768px | OK |
| 768×1024 | Sidebar 766px empilhada acima do chat | 1520px | 1024px | **QUEBRADO** |
| 390×844  | Sidebar 388px empilhada acima do chat | 1346px | 844px | **QUEBRADO** |

**Causa raiz:** `VerticalWorkbenchShell.tsx` aplica `lg:grid-cols-[280px,minmax(0,1fr)]` somente a partir de 1024px. Abaixo de `lg`, o grid é 1 coluna e a sidebar (primeiro `<aside>`) empilha sobre o centro. O sidebar prop em `chat.tsx` tem `min-h-[70vh]` (≈70% do viewport), garantindo que a sidebar ocupe 600-720px sozinha — o composer fica completamente fora do viewport.

## Ambiente validado

```
eiah-web   Up (healthy)  0.0.0.0:5173→5173   Vite dev server
eiah-api   Up (healthy)  0.0.0.0:8080→8080   API Node/Express
eiah-pg    Up (healthy)  0.0.0.0:5433→5432
eiah-redis Up (healthy)  0.0.0.0:6379→6379
```

Browser: Playwright Chromium Headless Shell 149.0.7827.55 (playwright v1.61.0)

## Arquivos modificados

| Arquivo | Natureza da mudança |
|---------|---------------------|
| `apps/web/src/features/workbench/VerticalWorkbenchShell.tsx` | Sidebar aside: `flex` → `hidden lg:flex`; `min-h-[600px]` → `min-h-[520px]` (grid container + grid div) |

Nenhum outro arquivo alterado.

## Ajustes aplicados

### VerticalWorkbenchShell.tsx

**Sidebar aside — antes:**
```
<aside className="flex h-full flex-col border-b border-slate-200 bg-[...] lg:border-b-0 lg:border-r">
```

**Sidebar aside — depois:**
```
<aside className="hidden h-full flex-col border-b border-slate-200 bg-[...] lg:flex lg:border-b-0 lg:border-r">
```

Resultado: sidebar oculta (`display:none`) em viewports < `lg` (1024px). O centro (chat) assume 100% da largura do grid em mobile/tablet.

**Grid container e grid div — antes:**
```
min-h-[600px]  (em dois lugares)
```

**Grid container e grid div — depois:**
```
min-h-[520px]  (em dois lugares)
```

Redução de 80px elimina micro-overflow em viewports apertados (ex: 1024×768 em que o espaço flex disponível era 595px < 600px).

## Comparação Antes/Depois

| Viewport | Sidebar antes | Textarea Y antes | Sidebar depois | Textarea Y depois | Status |
|----------|---------------|-----------------|----------------|-------------------|--------|
| 1440×900 | 280px (flex) | 363px (OK) | 280px (flex) | 363px | ✓ |
| 1280×800 | 280px (flex) | 363px (OK) | 280px (flex) | 363px | ✓ |
| 1024×768 | 280px (flex) | 363px (OK) | 280px (flex) | 363px | ✓ |
| 768×1024 | 766px (esmagando) | 1520px **FORA** | 0px (none) | 803px **dentro** | ✓ **CORRIGIDO** |
| 390×844  | 388px (esmagando) | 1346px **FORA** | 0px (none) | 754px **dentro** | ✓ **CORRIGIDO** |

## Checks do Browser Smoke (Playwright) — 30/30 pass

### Resultados por resolução

| Check | 1440×900 | 1280×800 | 1024×768 | 768×1024 | 390×844 |
|-------|----------|----------|----------|----------|---------|
| URL = /app/imob/chat | ✓ | ✓ | ✓ | ✓ | ✓ |
| grid width ≥ viewport | ✓ 1438px | ✓ 1278px | ✓ 1022px | ✓ 766px | ✓ 388px |
| sidebar não esmagando chat | ✓ 280px flex | ✓ 280px flex | ✓ 280px flex | ✓ none | ✓ none |
| textarea visível no viewport | ✓ y=363 | ✓ y=363 | ✓ y=363 | ✓ y=803 | ✓ y=754 |
| context panel toggle presente | — | — | ✓ y=730 | ✓ y=986 | ✓ y=825 |

### Checks de HTML (conteúdo)

| Check | Resultado |
|-------|-----------|
| `xl:grid-cols-[280px,minmax(0,1fr),360px]` preservado | ✓ locked by test |
| `hidden lg:flex` no sidebar | ✓ |
| Painel contextual toggle presente | ✓ |
| IMOB Conversation Workbench no header | ✓ |
| Document Intake / IMOB v2.1 | ✓ |
| Piloto controlado | ✓ |
| sem `max-w-6xl` no main (herdado da 9.3) | ✓ |

## Testes unitários focados

```bash
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test \
  apps/web/src/features/imob/imobWorkbenchContext.test.ts \
  apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx \
  apps/web/src/features/imob/imobContractIntakeDraftCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeResultCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeApiClient.test.ts
```

Resultado: **50/50 pass** — exit `0`

O teste em `imobWorkbenchContextPanel.test.tsx:172-176` valida:
- `xl:grid-cols-[280px,minmax(0,1fr),360px]` ✓ (intocado)
- `Painel contextual` ✓ (mobile toggle preservado)
- `IMOB Conversation Workbench` ✓ (eyebrow preservado)
- `Document Intake / IMOB v2.1` ✓ (título preservado)
- `Piloto controlado` ✓ (status label preservado)

## Grep anti-hardcode

```bash
rg -n "João|Maria|Mariana|850\.000|matricula_imovel_12345|contrato_compra_venda\.pdf|apartamento 101|12345" \
  apps/web/src/pages/app/imob/chat.tsx apps/web/src/features/imob apps/web/src/features/workbench
```

Resultado: 0 ocorrências em arquivos de produção (ocorrências em `.test.tsx` são fixtures de teste, fora do escopo).

## Screenshots capturados

Armazenados em `docs/ops/evidence/latest/phase-9-3-1-responsive-hardening/`:

| Arquivo | Descrição |
|---------|-----------|
| `before-768x1024.png` | Sidebar esmagando chat — ocupa tela inteira |
| `before-390x844.png` | Mobile: sidebar full-screen, chat inacessível |
| `after-768x1024.png` | **Fix**: chat central full-width, composer visível, toggle no rodapé |
| `after-390x844.png` | **Fix**: mobile com chat, quick actions e textarea visíveis |
| `after-1024x768.png` | Desktop/tablet landscape: sidebar + chat + toggle contextual |
| `after-1440x900.png` | Desktop: preservado — sidebar 280px + centro 798px |
| `after-1280x800.png` | Desktop médio: preservado |
| `responsive-audit.json` | Métricas brutas do diagnóstico inicial |
| `smoke-results-9-3-1.json` | 30 checks detalhados do smoke final |

## Invariantes preservadas

- `VerticalWorkbenchShell` e `ImobWorkbenchShell` preservados — sem nova arquitetura paralela
- `ChatAgentLauncher` não recebeu lógica nova
- Grid columns `xl:grid-cols-[280px,minmax(0,1fr),360px]` intocado (locked por teste)
- Backend: nenhuma rota alterada
- Workers, storage, draft, retention, observability: intocados
- Auth/entitlement da Fase 9.2: intocados
- Dados continuam vindo de payload real — nenhum dado fictício hardcoded
- `stage/status/journeyType` não criados
- Status operacional permanece **PILOTO CONTROLADO**
- Object storage real: **NO-GO**
- Multi-instância: **NO-GO**

## Limitação documentada

Em viewports < `lg` (< 1024px), a sidebar (lista de conversas, botão "+ Nova conversa") fica oculta. O usuário acessa apenas o chat central em mobile/tablet. Esta limitação é aceitável para o PILOTO CONTROLADO. A sidebar toggle em mobile pode ser endereçada em fase futura se necessário.

## Conclusão

Fase 9.3.1 declarada **EVIDENCIADA**:

1. Tablet portrait 768×1024: textarea Y moveu de **1520px → 803px** (viewport 1024px) — compositor agora visível sem scroll
2. Mobile 390×844: textarea Y moveu de **1346px → 754px** (viewport 844px) — compositor visível
3. Todas resoluções desktop (1440, 1280, 1024): comportamento preservado com sidebar 280px lateral
4. Context panel toggle (Painel contextual) visível em todas as resoluções < xl
5. 50/50 testes unitários pass — nenhuma regressão
6. 30/30 checks do smoke Playwright — 0 falhas
7. Nenhum arquivo de backend, worker, storage, draft ou observability foi alterado
