# IMOB Chat Workbench — Fase 9.3 SaaS Visual Parity Final

Data: 2026-06-19
Status: EVIDENCIADO
Escopo: Correção da proporção visual real de `/app/imob/chat` para paridade com mock SaaS claro — ajustes de width, layout, header e grid

## Objetivo

Corrigir a compressão visual identificada nas fases anteriores: o Workbench estava estreito, o chat central comprimido, o painel direito sem presença e o header superior técnico demais. Esta fase é visual-only, sem alteração de backend, contratos, workers, storage ou entitlement.

## Diagnóstico — Causas da Compressão

| Causa | Localização | Impacto |
|-------|-------------|---------|
| `max-w-6xl` no `<main>` do App.tsx | `apps/web/src/App.tsx:128` | Limitava largura a 1152px em viewport 1440px → 288px desperdiçados |
| `px-4 py-10 sm:px-6` no `<main>` | `apps/web/src/App.tsx:128` | 80px vertical + 32px horizontal subtraídos do workbench |
| Header card grande em `VerticalWorkbenchShell` | `VerticalWorkbenchShell.tsx` | ~130px de altura com description + helperText longos — duplicava info já presente no `<header>` do main em chat.tsx |
| `lg:h-[78vh]` no grid calculado sobre espaço reduzido | `VerticalWorkbenchShell.tsx` | Grid com ~559px de altura útil em 900px viewport |
| Grid center com ~480px de largura | Combinação dos fatores acima | Chat central visivelmente comprimido |

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
| `apps/web/src/App.tsx` | Detectar rota IMOB chat; remover `max-w-6xl`, `px-4 py-10` do `<main>` nessa rota |
| `apps/web/src/features/workbench/VerticalWorkbenchShell.tsx` | Header compacto (1 linha); grid `flex-1 min-h-[600px]`; outer div `flex-1 flex-col` |
| `apps/web/src/features/imob/ImobWorkbenchShell.tsx` | Passar `description=""` e `helperText=""` para eliminar texto longo redundante |

## Ajustes aplicados

### App.tsx

```typescript
const isImobChatRoute = location.pathname === "/app/imob/chat";
// ...
<main className={isImobChatRoute
  ? "flex w-full flex-1 flex-col p-0"
  : "mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6"}>
```

Outras rotas: **inalteradas** — apenas IMOB chat recebe tratamento diferenciado.

### VerticalWorkbenchShell.tsx

Antes (outer div + header):
```
<div className="space-y-4">
  <div className="relative overflow-hidden rounded-[30px] ... px-5 py-4">
    <!-- eyebrow, title, description, helperText, badges — ~130px -->
  </div>
  <div className="overflow-hidden rounded-[32px] ...">
    <div className="grid min-h-[70vh] lg:h-[78vh] lg:max-h-[78vh] ...">
```

Depois (outer div + header compacto):
```
<div className="flex min-h-0 flex-1 flex-col">
  <div className="mb-1.5 overflow-hidden rounded-[20px] ... px-4 py-2.5">
    <!-- eyebrow · title (inline) + badges — ~40px -->
  </div>
  <div className="flex-1 min-h-[600px] overflow-hidden rounded-[32px] ...">
    <div className="grid min-h-[600px] h-full ...">
```

Mudanças:
- `space-y-4` → `flex min-h-0 flex-1 flex-col` (workbench preenche o espaço disponível)
- Header: grande card com gradient, blob, 4 elementos → compact bar com eyebrow + título inline + badges
- Padding: `py-4 px-5` → `py-2.5 px-4`
- Rounded: `rounded-[30px]` → `rounded-[20px]`
- Grid container: `rounded-[32px]` (mantido) com `flex-1 min-h-[600px]`
- Grid: `min-h-[70vh] lg:h-[78vh] lg:max-h-[78vh]` → `min-h-[600px] h-full`
- Asides: removidas constraints `min-h-[70vh] lg:min-h-0` (parent define altura via `h-full`)
- Mobile toggle: `mt-1.5` (spacing ajustado)
- **Grid columns intocadas**: `xl:grid-cols-[280px,minmax(0,1fr),360px]` inalterado (locked por teste)

### ImobWorkbenchShell.tsx

```typescript
description=""     // era: "Base visual clara para intake documental, conversas operacionais..."
helperText=""      // era: "Fundação visual preparada para múltiplas verticais..."
```

Texto removido era duplicação do conteúdo já presente no header da área main em chat.tsx.

## Comparação Antes/Depois

| Métrica | Antes | Depois | Delta |
|---------|-------|--------|-------|
| Largura do workbench a 1440px | ~1120px (max-w-6xl) | **1438px** (full viewport) | +318px (+28%) |
| Largura do workbench a 1280px | ~1120px (max-w-6xl) | **1278px** | +158px (+14%) |
| Espaço vertical para grid (900px viewport) | ~559px (78vh de espaço reduzido) | **~820px** (flex-1 fills ~900-73-40px) | +261px (+47%) |
| Altura do header do workbench | ~130px (card com description+helperText) | **~40px** (bar compacto) | -90px |
| Largura do chat central a 1440px | ~480px | **~800px** (1438-280-360-borders) | +320px (+67%) |

## Checks do Browser Smoke (Playwright)

### 1440×900

| Check | Resultado |
|-------|-----------|
| URL = /app/imob/chat | ✓ |
| Document Intake visível | ✓ |
| IMOB v2.1 visível | ✓ |
| Piloto controlado visível | ✓ |
| IMOB Conversation Workbench no header compacto | ✓ |
| `main` sem `max-w-6xl` | ✓ classes: `flex w-full flex-1 flex-col p-0` |
| `main` sem `py-10` | ✓ |
| grid xl 3 colunas presente | ✓ |
| sidebar gradient escuro `rgb(9,17,29)→rgb(16,28,43)` | ✓ |
| **grid width > 1152px** | ✓ **1438px** |
| sem texto longo "Base visual clara" | ✓ header compacto confirmado |
| sem helperText "Fundação visual" | ✓ |
| compositor `rounded-[20px]` presente | ✓ |
| textarea bg transparente | ✓ `rgba(0,0,0,0)` |
| sem 401/403 no console | ✓ |

### 1280×800

| Check | Resultado |
|-------|-----------|
| grid width > 1000px | ✓ **1278px** |
| main sem max-w-6xl | ✓ |

### Mobile 390×844

| Check | Resultado |
|-------|-----------|
| Painel contextual toggle visível | ✓ |

**Total: 18/18 pass**

## Screenshots capturados

Armazenados em `docs/ops/evidence/latest/phase-9-3-saas-visual-parity-final/`:

- `after-desktop-1440x900.png` — desktop full-width: header compacto, 3 colunas, centro amplo, painel direito com presença
- `after-desktop-fullpage.png` — fullPage 1440×900
- `after-desktop-1280x800.png` — 1280×800: mesmo layout, 1278px de largura
- `after-mobile-390x844.png` — mobile: toggle de painel contextual visível
- `smoke-results-9-3.json` — checks detalhados

Screenshot BEFORE disponível em: `docs/ops/evidence/latest/phase-9-2-auth-entitlement-smoke/pos-desktop-1440x900-v2.png`

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

Nota: o teste em `imobWorkbenchContextPanel.test.tsx:172-176` verifica `xl:grid-cols-[280px,minmax(0,1fr),360px]`, `Painel contextual`, `IMOB Conversation Workbench`, `Document Intake / IMOB v2.1` e `Piloto controlado` — todos presentes no header compacto e no mobile toggle.

### Grep anti-hardcode

```bash
rg -n "João|Maria|Mariana|850\.000|matricula_imovel_12345|contrato_compra_venda\.pdf|apartamento 101|12345" \
  apps/web/src/pages/app/imob/chat.tsx apps/web/src/features/imob apps/web/src/features/workbench
```

Resultado: 0 ocorrências nos arquivos de produção.

### Gate documental

```
pnpm check:evidence-index → ok: true
```

## Invariantes preservadas

- `VerticalWorkbenchShell` e `WorkbenchPanelCard` preservados como base multi-vertical (não substituídos)
- `ChatAgentLauncher` não recebeu lógica nova
- Grid columns `xl:grid-cols-[280px,minmax(0,1fr),360px]` intocado (locked por teste)
- Backend: nenhuma rota alterada
- Workers, storage, draft, retention, observability: intocados
- Auth/entitlement da Fase 9.2: intocados
- Dados continuam vindo do payload real — nenhum dado fictício hardcoded
- PII não aparece
- `stage/status/journeyType` não criados
- Status operacional permanece PILOTO CONTROLADO
- Outras rotas da aplicação (não-IMOB chat): App.tsx `<main>` com `max-w-6xl` inalterado

## Riscos remanescentes

1. **App header height hardcoded implicitamente**: a altura do grid é `flex-1 min-h-[600px]` usando flex — se o app header mudar de tamanho, o grid se ajusta automaticamente. Sem valor hardcoded.
2. **Outras verticais futuras**: se uma vertical futura usar `VerticalWorkbenchShell` e quiser o comportamento antigo (com description/helperText), poderá passar strings não-vazias — o componente renderiza condicionalmente. Sem breaking change.
3. **IMOB chat route detection**: `pathname === "/app/imob/chat"` — se a rota mudar, a App.tsx main voltaria para max-w-6xl. Baixo risco (rota estável).

## Conclusão

Fase 9.3 declarada **EVIDENCIADA**:

1. Largura do workbench aumentou de ~1120px para **1438px** a 1440px viewport (+28%)
2. Chat central aumentou de ~480px para **~800px** (+67%)
3. Header compacto: de ~130px para ~40px (-90px) → mais espaço vertical para o grid
4. Grid height aumentou de ~559px para ~820px em 900px viewport (+47%)
5. Visual final aproxima-se de SaaS comercial — não de shell técnico interno
6. Nenhum arquivo de backend, worker, storage, draft ou observability foi alterado
7. Auth/entitlement da Fase 9.2 completamente preservados
