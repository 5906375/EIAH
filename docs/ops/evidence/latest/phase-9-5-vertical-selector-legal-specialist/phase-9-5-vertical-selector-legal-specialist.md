# IMOB Chat Workbench — Fase 9.5 Vertical Selector with LEGAL Specialist Context

Data: 2026-06-20  
Status: PILOTO CONTROLADO  
Escopo: seletor de verticais (IMOB/LEGAL) com painel direito reativo, preservando shell e comportamento IMOB intactos das fases 9.0–9.4.2.

---

## 1. Caminho real dos novos arquivos e justificativa

**Caminho escolhido:** `apps/web/src/features/workbench/vertical-chat/`

**Justificativa:**  
O padrão real do projeto é `apps/web/src/features/workbench/` para componentes genéricos de shell (`VerticalWorkbenchShell.tsx`, `WorkbenchPanelCard.tsx`). A pasta `vertical-chat/` não existia — criada seguindo o padrão docs da instrução, que prevê `features/workbench/vertical-chat/` quando `features/workbench/` é o padrão. Nunca foi usado `components/agents/` para componentes visuais.

---

## 2. Arquivos criados

| Arquivo | Descrição |
|---|---|
| `apps/web/src/features/workbench/vertical-chat/VerticalChatTypes.ts` | Tipos canônicos: `VerticalId`, `VerticalState`, `VerticalSelectorItem`, `VerticalSelectorBarProps` |
| `apps/web/src/features/workbench/vertical-chat/VerticalSelectorBar.tsx` | Componente puro de pills IMOB/LEGAL — zero lógica de domínio |
| `apps/web/src/features/workbench/vertical-chat/LegalContextPanel.tsx` | Painel direito LEGAL — safe empty state, sem dados inventados |
| `apps/web/src/features/workbench/vertical-chat/ReactiveContextPanel.tsx` | Wrapper que seleciona IMOB vs LEGAL sem alterar componentes existentes |
| `apps/web/src/features/workbench/vertical-chat/VerticalSelectorBar.test.tsx` | 7 testes para o seletor de pills |
| `apps/web/src/features/workbench/vertical-chat/ReactiveContextPanel.test.tsx` | 5 testes para o wrapper reativo |
| `apps/web/src/features/workbench/vertical-chat/LegalContextPanel.test.tsx` | 5 testes para o painel LEGAL |

---

## 3. Arquivos modificados

### `apps/web/src/pages/app/imob/chat.tsx`

4 alterações cirúrgicas:

**a) Imports** (linha ~68):
```diff
- import { ImobWorkbenchContextPanel } from "@/features/imob/ImobWorkbenchContextPanel";
  import { ImobWorkbenchShell } from "@/features/imob/ImobWorkbenchShell";
+ import { VerticalSelectorBar } from "@/features/workbench/vertical-chat/VerticalSelectorBar";
+ import { ReactiveContextPanel } from "@/features/workbench/vertical-chat/ReactiveContextPanel";
+ import type { VerticalId, VerticalSelectorItem } from "@/features/workbench/vertical-chat/VerticalChatTypes";
```

**b) Estado local** (linha ~1747):
```diff
  const [showWorkbenchContextPanel, setShowWorkbenchContextPanel] = React.useState(false);
+ const [activeVerticalId, setActiveVerticalId] = React.useState<VerticalId>("imob");
```

**c) Constante de pills + `chatLaneClassName`** (linha ~4550):
```diff
  const chatLaneClassName = "mx-auto w-full xl:max-w-[82%]";
+ const VERTICAL_SELECTOR_ITEMS: VerticalSelectorItem[] = [
+   { id: "imob",  label: "IMOB",  state: "active",  color: "#5DCAA5" },
+   { id: "legal", label: "LEGAL", state: "preview", color: "#7F77DD", tooltip: "Em breve" },
+ ];
```

**d) Header interno** — `VerticalSelectorBar` inserido dentro do `<header>` existente, abaixo do `workspaceLabel`:
```diff
  <p className="mt-0.5 text-[11px] text-slate-500">...</p>
+ <div className="mt-2">
+   <VerticalSelectorBar
+     verticals={VERTICAL_SELECTOR_ITEMS}
+     activeVerticalId={activeVerticalId}
+     onSelect={setActiveVerticalId}
+   />
+ </div>
```

**e) `contextPanel` prop** — substituição do painel fixo pelo wrapper reativo:
```diff
- <ImobWorkbenchContextPanel
-   state={workbenchContextState}
-   intakeContext={workbenchIntakeContext}
-   commandCenterHref={workbenchCommandCenterHref}
-   funnelHref={workbenchFunnelHref}
-   runArchiveHref={workbenchRunArchiveHref}
- />
+ <ReactiveContextPanel
+   activeVerticalId={activeVerticalId}
+   imobProps={{
+     state: workbenchContextState,
+     intakeContext: workbenchIntakeContext,
+     commandCenterHref: workbenchCommandCenterHref,
+     funnelHref: workbenchFunnelHref,
+     runArchiveHref: workbenchRunArchiveHref,
+   }}
+ />
```

---

## 4. Arquivos confirmados NÃO tocados

| Arquivo | Status |
|---|---|
| `apps/web/src/components/agents/ChatAgentLauncher.tsx` | ✅ INTOCADO |
| `apps/web/src/components/agents/chatLauncherEngine.ts` | ✅ INTOCADO |
| `apps/web/src/components/agents/legalContextResolver.ts` | ✅ INTOCADO |
| `apps/web/src/components/agents/imobContextResolver.ts` | ✅ INTOCADO |
| `apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx` | ✅ INTOCADO |
| `apps/web/src/features/imob/ImobWorkbenchShell.tsx` | ✅ INTOCADO |
| `apps/web/src/features/workbench/VerticalWorkbenchShell.tsx` | ✅ INTOCADO |
| `apps/web/src/features/workbench/WorkbenchPanelCard.tsx` | ✅ INTOCADO |
| Todo backend, auth, infra crítica | ✅ INTOCADOS |

---

## 5. Como IMOB foi modelado

- `state: 'active'` — pill verde-claro (#5DCAA5), borda sólida, texto colorido, clicável
- IMOB é o default ao abrir `/app/imob/chat`: `useState<VerticalId>("imob")`
- `activeVerticalId === 'imob'` → `ReactiveContextPanel` renderiza `ImobWorkbenchContextPanel` exatamente como antes, com todos os props passados de forma idêntica
- Comportamento IMOB é 100% preservado

---

## 6. Como LEGAL foi modelado + decisão sobre entitlement

**Entitlement LEGAL**: ausente no `LauncherAccessContext`.

O tipo `LauncherAccessContext` em `chatLauncherEngine.ts:262-265` define apenas:
```typescript
entitlements?: {
  REAL_ESTATE_CORE?: boolean;
  IMOB_INSTALLED?: boolean;
} | null;
```

Sem entitlement LEGAL → pill LEGAL fica com `state: 'preview'`:
- Borda tracejada (`border-dashed`)
- Texto desaturado (40% opacity)
- Badge "Em breve" inline
- `disabled` — não dispara `onSelect`
- `aria-disabled="true"`, `aria-selected="false"`

Quando e se um entitlement LEGAL for adicionado ao `LauncherAccessContext`, basta mudar `state` para `'inactive'` na constante `VERTICAL_SELECTOR_ITEMS` em `chat.tsx:4551`.

---

## 7. Como J-360 foi tratado como especialista

J-360 **não aparece como pill/vertical** em nenhum lugar da Fase 9.5.

- `VerticalId = "imob" | "legal"` — J-360 não é um valor válido
- J-360 aparece **apenas** no `LegalContextPanel` como texto descritivo de agente especialista, e **somente** quando `specialistAvailable=true`:
  ```
  Especialista disponível
  J-360 — Agente Jurídico
  Análise de contratos e documentos jurídicos.
  ```
- O prop `legalSpecialistAvailable` em `ReactiveContextPanel` e `LegalContextPanel` não é passado em `chat.tsx` (default: `false`) — a seção de especialista permanece oculta até que o engine indique disponibilidade
- Hierarquia confirmada: LEGAL é contexto vertical → J-360 é agente especialista dentro de LEGAL

---

## 8. Entitlements encontrados no código

No `LauncherAccessContext` (`chatLauncherEngine.ts:262-265`):
```typescript
entitlements?: {
  REAL_ESTATE_CORE?: boolean;  // gate para acesso IMOB
  IMOB_INSTALLED?: boolean;    // confirma produto IMOB instalado
} | null;
```

No `HelpDictionaryAccessContext` (`helpDictionary.ts:23-26`): idêntico — sem LEGAL.

**Conclusão**: zero entitlement LEGAL no frontend → pill LEGAL = `preview`.

---

## 9. Como o painel direito reage por vertical

`ReactiveContextPanel` é o único ponto de decisão:

```typescript
if (activeVerticalId === "legal") {
  return <LegalContextPanel specialistAvailable={legalSpecialistAvailable} />;
}
return <ImobWorkbenchContextPanel {...imobProps} />;
```

- `activeVerticalId = 'imob'` → `ImobWorkbenchContextPanel` (comportamento original intacto)
- `activeVerticalId = 'legal'` → `LegalContextPanel` (safe empty state)
- `ImobWorkbenchContextPanel` não foi modificado — zero risco de regressão
- A mudança de painel é instantânea (estado local React), sem network calls

---

## 10. Testes existentes — resultado

```
# tests 48 | pass 48 | fail 0
```

Suites validadas:
- `ImobWorkbenchContextPanel` — 11 subtestes
- `imobContractIntakeDraftCard` — subtestes
- `imobContractIntakeResultCard` — subtestes
- `imobContractIntakeApiClient` — subtestes
- `ImobWorkbenchShell` — 1 subteste

---

## 11. Novos testes — resultado

```
# tests 17 | suites 3 | pass 17 | fail 0
```

**VerticalSelectorBar** (7 testes):
- ✅ Pill IMOB active com `aria-selected="true"`
- ✅ Pill LEGAL preview com `border-dashed`, `disabled`, `Em breve`
- ✅ Pill J-360 NÃO existe (assert negativo)
- ✅ `onSelect` disparado ao clicar IMOB inactive
- ✅ `onSelect` NÃO disparado em LEGAL preview (button disabled)
- ✅ `aria-selected` e `aria-disabled` corretos
- ✅ State `disabled` não renderiza pill

**ReactiveContextPanel** (5 testes):
- ✅ `activeVerticalId = 'imob'` → renderiza `ImobWorkbenchContextPanel`
- ✅ `activeVerticalId = 'legal'` → renderiza `LegalContextPanel`
- ✅ Fallback IMOB preservado
- ✅ Especialista oculto por padrão
- ✅ J-360 visível quando `legalSpecialistAvailable=true`

**LegalContextPanel** (5 testes):
- ✅ Renderiza sem dados inventados
- ✅ J-360 ausente quando `specialistAvailable=false`
- ✅ J-360 visível como especialista quando `specialistAvailable=true`
- ✅ Texto de empty state presente
- ✅ Sem dados hardcoded (nomes, CPF, valores, processos)

---

## 12. Smoke browser — resultado por viewport

**Data:** 2026-06-20  
**Ferramenta:** Playwright Chromium headless (smoke-9-5.mjs)  
**Dev server:** `http://localhost:5173` (Vite local-docker)  
**Token:** `seed_53670...` via `localStorage.setItem("eiah_token", token)` — padrão smoke-9-4.mjs

### Resultado: 44/44 checks OK

| Item | 1440×900 | 1280×800 | 390×844 |
|---|---|---|---|
| URL permanece `/app/imob/chat` | ✅ | ✅ | ✅ |
| "Document Intake" no hero | ✅ | ✅ | ✅ |
| "IMOB Product Shell" presente | ✅ | ✅ | ✅ |
| `VerticalSelectorBar` (role=tablist) | ✅ | ✅ | ✅ |
| Pill IMOB `aria-selected=true` | ✅ | ✅ | ✅ |
| Pill LEGAL `aria-disabled=true` | ✅ | ✅ | ✅ |
| Pill LEGAL texto "Em breve" | ✅ | ✅ | ✅ |
| Pill LEGAL `border-dashed` | ✅ | ✅ | ✅ |
| Pill J-360 ausente no tablist | ✅ | ✅ | ✅ |
| Painel IMOB "Contexto IMOB" | ✅ | ✅ | N/A |
| Grid 3 colunas presente | ✅ | ✅ | N/A |
| Textarea visível | ✅ (y=528) | ✅ (y=512) | ✅ (y=673) |
| Sidebar "Conversas do intake" | ✅ | ✅ | N/A (colapsada ✅) |
| J-360 ausente no DOM inteiro | ✅ | ✅ | ✅ |
| Accordion mobile visível | N/A | N/A | ✅ |
| Sidebar colapsada em mobile | N/A | N/A | ✅ |

### LegalContextPanel (verificação browser)

| Item | Resultado |
|---|---|
| Pill LEGAL disabled (não dispara click) | ✅ confirmado |
| Painel IMOB permanece após tentativa click em LEGAL disabled | ✅ |
| Sem dados hardcoded no DOM inteiro | ✅ limpo |

### Screenshots gerados

- `smoke-9-5-1440x900.png`
- `smoke-9-5-1280x800.png`
- `smoke-9-5-390x844.png`
- `smoke-9-5-legal-panel-check.png`
- `smoke-results-9-5.json`

**Status: SMOKE BROWSER PASSOU — 44/44 checks OK**

---

## 13. Grep anti-hardcode — resultado

**Componentes reais** (os 4 arquivos TSX/TS de produção):
```
✅ COMPONENTES LIMPOS
```

Nenhum dos seguintes padrões encontrado em componentes:
`João|Maria|Mariana|850.000|matricula_imovel_12345|contrato_compra_venda.pdf|apartamento 101|processo fake|cliente fake|parecer fake`

Nota: o padrão `850.000` aparece **dentro dos arquivos de teste** como string de assertion (`assert.ok(!includes("850.000"))`), não como dado real. Isso é o comportamento esperado — o teste verifica a ausência do padrão.

---

## 14. ChatAgentLauncher — status

**INTOCADO.**

`apps/web/src/components/agents/ChatAgentLauncher.tsx` não foi aberto, lido ou modificado nesta fase. Zero alterações.

---

## 15. Backend/auth/infra — status

**INTOCADOS.**

Nenhum arquivo fora de `apps/web/src/` foi modificado. Nenhuma rota de API, schema de banco, configuração de auth, env vars ou infraestrutura foi alterada.

---

## 16. Riscos remanescentes

| Risco | Severidade | Mitigação |
|---|---|---|
| Pill LEGAL preview ao clicar não dispara, mas o estado `activeVerticalId` permanece `'imob'` (correto) — UX pode confundir se usuário esperar feedback mais rico | Baixo | Tooltip "Em breve" é suficiente para o piloto |
| `legalSpecialistAvailable` hardcoded como `false` em `chat.tsx` — J-360 nunca aparece no painel LEGAL nesta fase | Baixo / Intencional | Proposital: não conectar engine no `contextPanel` ainda |
| Smoke browser — executado e passou 44/44 | ✅ Resolvido | smoke-9-5.mjs + 44/44 checks OK |
| Erros pré-existentes de typecheck em `chat.tsx` (linhas 2, 244, 4422) e em `chatProof.ts` não resolvidos — fora do escopo da Fase 9.5 | Informativo | Preexistentes — não introduzidos nesta fase |

---

## Status final

**PILOTO CONTROLADO — EVIDENCIADO**

- Shell IMOB: preservado
- VerticalSelectorBar: IMOB ativo, LEGAL preview
- Painel direito: reativo por vertical
- ChatAgentLauncher: intocado
- Backend/auth/infra: intocados
- Testes unitários: 65/65 passando (48 existentes + 17 novos)
- Smoke browser: 44/44 checks OK — 1440×900, 1280×800, 390×844
- Grep anti-hardcode: limpo nos componentes
- check:evidence-index: `ok: true`
