# IMOB Chat Workbench — Fase 9.1 Light SaaS Visual Parity

Data: 2026-06-19
Status da frente: PILOTO CONTROLADO
Escopo: refinamento visual do IMOB Workbench para maior paridade com o mock SaaS claro de referência

## Objetivo

Registrar o refinamento visual da Fase 9.1 sobre a fundação multi-vertical criada na Fase 9.0, aproximando
o IMOB Chat Workbench do mock SaaS claro de referência sem reconstruir a arquitetura.

## Pré-condições herdadas da Fase 9.0

- `VerticalWorkbenchShell.tsx` e `WorkbenchPanelCard.tsx` preservados integralmente
- `ImobWorkbenchShell.tsx` mantido como wrapper semântico
- Layout desktop 3 colunas: sidebar escura (280px) + área central clara + painel direito claro (360px)
- Responsividade mobile/tablet com toggle de painel contextual preservada
- `ChatAgentLauncher` intocado
- Backend, worker, storage, draft e retention intocados

## Arquivos alterados

- `apps/web/src/features/workbench/WorkbenchPanelCard.tsx`
- `apps/web/src/features/workbench/VerticalWorkbenchShell.tsx`
- `apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx`
- `apps/web/src/pages/app/imob/chat.tsx`

## Refinamentos visuais aplicados

### WorkbenchPanelCard.tsx

- Adicionado inset highlight sutil no topo dos cards:
  `shadow-[0_16px_36px_rgba(15,23,42,0.07),inset_0_1px_0_rgba(255,255,255,0.85)]`
- Cards brancos ficam levemente mais elevados e com aparência de superfície polida

### VerticalWorkbenchShell.tsx

- Container externo do workbench: sombra refinada com dupla camada:
  `shadow-[0_28px_80px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.04)]`
- Header superior: sombra com inset highlight:
  `shadow-[0_20px_56px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.9)]`
- Toggle mobile de painel contextual: inset highlight aplicado
- Colunas da grid preservadas integralmente (locked por teste):
  `xl:grid-cols-[280px,minmax(0,1fr),360px]`

### ImobWorkbenchContextPanel.tsx

- Header: gradiente de fundo mais polido (`#fafcff → #f2f7fd`), padding mais compacto (`py-3.5`)
- Eyebrow do header: tamanho reduzido para `text-[10px]` com tracking mais aberto
- Título do header: `text-[13px]` com `leading-snug`
- Badge "Piloto controlado": adicionado `shadow-sm` e `shrink-0`
- Descrição de segurança: `text-[11px]` com `leading-5`
- Botões de export (HTML/DOCX/Orientação PDF): adicionado `shadow-sm`, `transition`, estados `hover` distintos e `disabled:cursor-not-allowed`
- Links de navegação (Command Center/Funil/RunArchive): adicionado `shadow-sm`, `transition`, hover states

Todos os textos testados preservados sem alteração:
- "Nenhum destino novo e nenhuma decisão operacional nascem aqui" ✓
- "Piloto controlado" ✓
- "Dossiê indisponível neste piloto" ✓
- "Ainda não há rota frontend segura dedicada" ✓
- "O painel permanece informativo até que um contexto navegável seja emitido" ✓
- "client já existente para HTML, DOCX e orientação de PDF" ✓
- "Carregando contexto do intake" ✓
- "payload real estiver disponível" ✓

### chat.tsx

**Sidebar escura — refinamentos:**
- Header card da sidebar: sombra mais definida com outer shadow:
  `shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_24px_rgba(0,0,0,0.28)]`
- Borda do card: `border-cyan-400/15` (era `border-cyan-400/10`)
- Stat cards: `rounded-[14px]` (era `rounded-xl`), `border-white/10`, `py-2.5`, `text-[10px]` labels, `text-[13px]` números, inset highlight
- Search input: `rounded-[14px]`, `bg-white/5` (era `bg-black/25`), focus `border-cyan-400/30`
- Botão "Nova conversa": `rounded-[14px]`, `bg-white/8`, shadow inset, hover `border-cyan-400/30`
- Botão "Ver operações": hover state `hover:text-white` adicionado

**Área central — header refinado:**
- Padding `py-4` (era `py-5`) — header mais compacto
- Eyebrow "Document Intake": `text-[11px]` com `tracking-[0.28em]`
- Badges "IMOB v2.1" e "Piloto controlado": `py-0.5` mais compactos, `shadow-sm`
- Título do workspace: `text-[17px]` com `leading-tight`
- Subtítulo descritivo: `text-[11px] leading-5`
- Indicador "Chat central preservado": `rounded-[16px]`, shadow com inset highlight, pulsação verde no dot

**Composer — principal refinamento visual:**
- Quick actions: removido o card container com header "Quick actions" e descrição verbosa
- Quick actions agora renderizadas como linha compacta de chips diretamente acima do textarea:
  - Container: apenas `flex flex-wrap items-center gap-1.5 mb-2.5`
  - Chips: `bg-white shadow-sm`, `py-1` mais compactos, hover states `hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900`
- Container compositor: `rounded-[20px]` (era `rounded-2xl`), sombra suavizada
- Textarea: `bg-transparent rounded-[14px]` (era `bg-slate-50 rounded-xl`) — aparência mais limpa dentro do branco do container
- Botão enviar: `rounded-[14px]` (era `rounded-xl`)
- Botão anexo: `h-[28px] w-[28px]` (era `h-[24px] w-[24px]`), `shadow-sm`, hover refinado

## Validação por renderização sanitizada

Sem browser headless disponível neste host. Validação por renderização sanitizada com `renderToStaticMarkup`.

Elementos observados na renderização dos testes:

```html
<!-- VerticalWorkbenchShell (via ImobWorkbenchShell) -->
<p>IMOB Conversation Workbench</p>
<p>Document Intake / IMOB v2.1</p>
<span>Piloto controlado</span>
<span>Painel contextual</span>
<button>Mostrar</button>

<!-- ImobWorkbenchContextPanel - header -->
<p>Contexto IMOB</p>
<p>Resumo operacional do intake ativo no chat.</p>
<span>Piloto controlado</span>
<p>...Nenhum destino novo e nenhuma decisão operacional nascem aqui.</p>

<!-- ImobWorkbenchContextPanel - export buttons -->
<button>Exportar HTML</button>
<button>Exportar DOCX</button>
<button>Orientação PDF</button>

<!-- ImobWorkbenchContextPanel - navigation -->
<a>Abrir contexto no Command Center</a>
<a>Abrir Funil deste caso</a>
<a>Abrir execução no RunArchive</a>
```

## Verificação de integridade de dados

Grep anti-hardcode executado:

```bash
rg -n "João|Maria|Mariana|850\.000|matricula_imovel_12345|contrato_compra_venda\.pdf|apartamento 101|12345" \
  apps/web/src/pages/app/imob/chat.tsx \
  apps/web/src/features/imob \
  apps/web/src/features/workbench
```

Resultado:
- Ocorrências encontradas apenas em arquivos de teste preexistentes (dados de fixture em `imobWorkbenchContextPanel.test.tsx` e `funnel/ImobFunnelTeamSection.test.tsx`)
- Nenhuma ocorrência nos arquivos de produção alterados nesta fase
- Nenhum dado do mock hardcoded como dado real

## Testes focados

Comando executado:

```bash
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test \
  apps/web/src/features/imob/imobWorkbenchContext.test.ts \
  apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx \
  apps/web/src/features/imob/imobContractIntakeDraftCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeResultCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeApiClient.test.ts
```

Resultado: `50/50 pass` — exit `0`

## Gate documental

```bash
pnpm check:evidence-index
```

Resultado: `ok: true` — 305 refs verificadas

## Invariantes preservadas

- `xl:grid-cols-[280px,minmax(0,1fr),360px]` intacto (locked por teste)
- `VerticalWorkbenchShell` e `WorkbenchPanelCard` preservados como base multi-vertical
- `ImobWorkbenchShell` preservado como wrapper semântico
- `ChatAgentLauncher` não recebeu lógica de negócio
- Backend não alterado
- Worker não alterado
- Storage provider não alterado
- Draft store não alterado
- Retention cleanup não alterado
- Observability não alterada
- Nenhum destino/rota inventado
- Nenhum dado do mock hardcoded como dado real
- PII não aparece
- `stage/status/journeyType` não foram criados na UI
- Status permanece `PILOTO CONTROLADO`
