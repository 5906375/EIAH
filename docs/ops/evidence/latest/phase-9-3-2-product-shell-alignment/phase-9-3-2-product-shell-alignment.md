# IMOB Chat Workbench — Fase 9.3.2 IMOB Product Shell Alignment

Data: 2026-06-19
Status: EVIDENCIADO
Escopo: Reduzir aparência de Command Center técnico na rota `/app/imob/chat` — visual-only, sem alteração de backend, contratos, workers, storage, auth ou entitlement.

## Objetivo

Aproximar `/app/imob/chat` do mock SaaS final removendo textos explicativos e chips técnicos internos. A rota é funcional e operacional; esta fase remove ruído visual que comunica implementação interna ao invés de valor ao usuário.

## Arquivos modificados

| Arquivo | Natureza da mudança |
|---------|---------------------|
| `apps/web/src/App.tsx` | Header compacto: `py-4`→`py-2`, logo `h-10/w-10/rounded-2xl`→`h-8/w-8/rounded-xl`, subtitle e workspaceLabel ocultos em `/app/imob/chat` |
| `apps/web/src/pages/app/imob/chat.tsx` | Sidebar: removida descrição técnica ("Acompanhe threads..."); main header: removida descrição técnica ("Área central clara..."), removido chip "Chat central preservado", `workspaceLabel` reduziu de `text-[17px] font-semibold` para `text-[12px] text-slate-500` |
| `apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx` | Header: título simplificado de "Resumo operacional do intake ativo no chat." para "Resumo do intake", removida descrição técnica ("Esta lateral apenas projeta..."); empty state simplificado para "Sem intake ativo" + linha curta |
| `apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx` | Asserções atualizadas para espelhar novo texto do empty state e do header do painel |

Nenhum outro arquivo alterado.

## Ajustes aplicados

### App.tsx — Header compacto em `/app/imob/chat`

A rota IMOB chat agora usa `isImobChatRoute` (já calculado desde a Fase 9.3) para reduzir o peso visual do header global:

```tsx
// Antes
<div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
  <div className="flex h-10 w-10 ... rounded-2xl ...">...</div>
  <p>{subtitle}</p>
  <p>{workspaceLabel}</p>

// Depois
<div className={`... ${isImobChatRoute ? "py-2" : "py-4"}`}>
  <div className={`... ${isImobChatRoute ? "h-8 w-8 rounded-xl" : "h-10 w-10 rounded-2xl"}`}>...</div>
  {!isImobChatRoute ? <p>{subtitle}</p> ... : null}
```

Medição: `pt=6.8px pb=6.8px` em todas as 5 resoluções (antes seria `pt=13.6px pb=13.6px`).

### chat.tsx — Sidebar

Removido parágrafo de descrição técnica abaixo do título "Conversas e operações". O espaçamento `mt-2` no título foi reduzido para `mt-1`.

### chat.tsx — Main area header

- `text-[17px] font-semibold leading-tight text-slate-950` → `text-[12px] text-slate-500` no `workspaceLabel`
- `mt-1.5` → `mt-0.5`
- Removido parágrafo "Área central clara para intake documental..."
- Removido div chip "Chat central preservado"

### ImobWorkbenchContextPanel.tsx — Header

- Título: "Resumo operacional do intake ativo no chat." → "Resumo do intake"
- Removido `<p>` de descrição interna ("Esta lateral apenas projeta dados reais...")

### ImobWorkbenchContextPanel.tsx — Empty state

**Antes:**
```
Nenhum payload de intake no contexto atual.
[parágrafo 1 sobre modo de observação]
[parágrafo 2 sobre fluxo de intake]
```

**Depois:**
```
Sem intake ativo
Inicie uma conversa no chat para ver o resumo do intake aqui.
```

## Ambiente validado

```
eiah-web   Up (healthy)  0.0.0.0:5173→5173   Vite dev server
eiah-api   Up (healthy)  0.0.0.0:8080→8080   API Node/Express
eiah-pg    Up (healthy)  0.0.0.0:5433→5432
eiah-redis Up (healthy)  0.0.0.0:6379→6379
```

Browser: Playwright Chromium Headless Shell (playwright v1.61.0)

## Testes unitários focados — 50/50 pass

```bash
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test \
  apps/web/src/features/imob/imobWorkbenchContext.test.ts \
  apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx \
  apps/web/src/features/imob/imobContractIntakeDraftCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeResultCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeApiClient.test.ts
```

Resultado: **50/50 pass** — exit `0`

O teste crítico em `imobWorkbenchContextPanel.test.tsx:172-176` valida:
- `xl:grid-cols-[280px,minmax(0,1fr),360px]` ✓ (intocado)
- `Painel contextual` ✓ (mobile toggle preservado)
- `IMOB Conversation Workbench` ✓ (eyebrow preservado)
- `Document Intake / IMOB v2.1` ✓ (título preservado)
- `Piloto controlado` ✓ (status label preservado)

## Checks do Browser Smoke (Playwright) — 29/29 pass

### Resultados de conteúdo HTML

| Check | Resultado |
|-------|-----------|
| `xl:grid-cols-[280px,minmax(0,1fr),360px]` preservada | ✓ |
| sidebar `hidden` + `lg:flex` preservados | ✓ |
| Painel contextual toggle preservado | ✓ |
| Piloto controlado preservado | ✓ |
| Document Intake / IMOB v2.1 preservado | ✓ |
| IMOB Conversation Workbench preservado | ✓ |
| Descrição técnica da sidebar REMOVIDA | ✓ absent |
| Descrição técnica do main REMOVIDA | ✓ absent |
| Chip "Chat central preservado" REMOVIDO | ✓ absent |
| Descrição técnica do painel contextual REMOVIDA | ✓ absent |
| Empty state "Sem intake ativo" presente | ✓ |
| Context panel "Resumo do intake" presente | ✓ |
| Header compacto: `py-2` aplicado | ✓ |
| Sem dados hardcoded | ✓ clean |

### Resultados por resolução

| Check | 1440×900 | 1280×800 | 1024×768 | 768×1024 | 390×844 |
|-------|----------|----------|----------|----------|---------|
| URL = /app/imob/chat | ✓ | ✓ | ✓ | ✓ | ✓ |
| Header compacto (pt≤10px) | ✓ 6.8px | ✓ 6.8px | ✓ 6.8px | ✓ 6.8px | ✓ 6.8px |
| textarea visível no viewport | ✓ y=299 | ✓ y=299 | ✓ y=299 | ✓ y=769 | ✓ y=643 |

Textarea visível em todas as 5 resoluções sem scroll — comportamento responsivo da Fase 9.3.1 preservado.

## Grep anti-hardcode

```bash
rg -n "João|Maria|Mariana|850\.000|matricula_imovel_12345|..." \
  apps/web/src/pages/app/imob/chat.tsx \
  apps/web/src/features/imob \
  apps/web/src/features/workbench
```

Resultado: **0 ocorrências** em arquivos de produção.

## pnpm check:evidence-index

```json
{ "ok": true, "refsChecked": 310 }
```

## Screenshots capturados

Armazenados em `docs/ops/evidence/latest/phase-9-3-2-product-shell-alignment/`:

| Arquivo | Descrição |
|---------|-----------|
| `after-1440x900.png` | Desktop: header compacto, sidebar sem descrição, main limpo |
| `after-1280x800.png` | Desktop médio: preservado |
| `after-1024x768.png` | Tablet landscape: sidebar 280px, toggle contextual |
| `after-768x1024.png` | Tablet portrait: chat full-width, compositor visível |
| `after-390x844.png` | Mobile: chat full-width, compositor visível |
| `smoke-results-9-3-2.json` | 29 checks detalhados do smoke |

## Invariantes preservadas

- `VerticalWorkbenchShell` e `ImobWorkbenchShell` preservados — sem nova arquitetura paralela
- `WorkbenchPanelCard` preservado
- `ChatAgentLauncher` não recebeu lógica nova
- Grid columns `xl:grid-cols-[280px,minmax(0,1fr),360px]` intocado (locked por teste)
- Backend: nenhuma rota alterada
- Workers, storage, draft, retention, observability: intocados
- Auth/entitlement da Fase 9.2: intocados
- Responsividade da Fase 9.3.1: intacta (`hidden lg:flex`, `min-h-[520px]`)
- Dados continuam vindo de payload real — nenhum dado fictício hardcoded
- `stage/status/journeyType` não criados
- Status operacional permanece **PILOTO CONTROLADO**
- Object storage real: **NO-GO**
- Multi-instância: **NO-GO**

## Conclusão

Fase 9.3.2 declarada **EVIDENCIADA**:

1. Header global reduzido: `py-4`→`py-2`, logo menor, subtitle/workspaceLabel ocultos em `/app/imob/chat`
2. Sidebar sem descrição técnica — aparência operacional mais limpa
3. Main area header: `workspaceLabel` de title proeminente para label secundário `text-[12px]`; chips técnicos removidos
4. Painel contextual: título e empty state simplificados
5. 50/50 testes unitários pass — 0 regressões
6. 29/29 checks smoke Playwright — 0 falhas
7. Textarea visível em todas as 5 resoluções (y=299-769px dentro do viewport)
8. 0 dados hardcoded
9. check:evidence-index ok (310 refs)
