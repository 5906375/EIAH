# Brand Kit Extraction — Evidência (2026-07-02)

> Gerado pela execução do comando `/eiah-brand-marketing` (somente leitura de código de produto).
> Escrita nesta sessão restrita a `docs/marketing/**` e `ops/evidence/latest/**`. Zero diff em `apps/` ou `packages/`.

## Arquivos normativos lidos (protocolo A1)

| # | Arquivo | Status |
| --- | --- | --- |
| 1 | `CLAUDE.md` | Lido integralmente nesta sessão (conversa anterior, mesmo working directory); confirmado sem alteração via `mtime` antes do uso (1781515236, inalterado). |
| 2 | `CODEX.md` | Idem (mtime 1781515236, inalterado). |
| 3 | `IA_EIAH.md` | Idem (mtime 1782719829, inalterado). |
| 4 | `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md` | Idem (mtime 1782894672, inalterado). |
| 5 | `docs/EVIDENCE_INDEX.md` | Idem (mtime 1782996283, inalterado). |
| 6 | `docs/architecture/agent-chat-runtime.md` | Idem (mtime 1782995900, inalterado). |

Nenhum arquivo raiz obrigatório ausente — protocolo A1 não acionou parada P0 documental.

## Design system extraído — tabela-mestre com fontes

Ver tabela completa em `docs/marketing/brand-kit-derivado-do-produto-v1.md §1-2`. Resumo:

| Token | Valor | Fonte |
| --- | --- | --- |
| Fundo dominante | `#020617` | `apps/web/tailwind.config.ts:8` |
| Acento/CTA | `#38bdf8` | `apps/web/tailwind.config.ts:12` |
| Selo de governança "aprovado" | `#10b981` (emerald-500) | `apps/web/src/components/runs/GovernancePanel.tsx:19-20`; `apps/web/src/components/runs/RunViewer.tsx:240` |
| Vertical IMOB | `#5DCAA5` | `apps/web/src/features/workbench/vertical-chat/VerticalSelectorBar.tsx:5` |
| Vertical LEGAL (preview) | `#7F77DD` | `apps/web/src/features/workbench/vertical-chat/VerticalSelectorBar.tsx:6` |
| Tipografia corpo | Space Grotesk (400/500/600/700) | `apps/web/src/styles.css:1` |
| Tipografia título | Unbounded (600) | `apps/web/src/styles.css:1` |
| Radius de card padrão | `rounded-[20px]` (cards claros do Workbench) | `apps/web/src/features/workbench/WorkbenchPanelCard.tsx:34` |
| Sombra de shell padrão | anel ciano + sombra difusa | `apps/web/src/features/workbench/VerticalWorkbenchShell.tsx:80` |

## Superfícies-herói localizadas vs ausentes

**Localizadas (7/7 pedidas):**
1. Chat Agent Launcher → `apps/web/src/components/agents/ChatAgentLauncher.tsx`, rota `/app/chat` (`apps/web/src/App.tsx:300`).
2. Command Center IMOB → `apps/web/src/features/imob/ImobCommandCenter.tsx`, rota `/app/imob/dashboard#command-center` (`apps/web/src/App.tsx:345`).
3. Funil + Equipe → `apps/web/src/features/imob/funnel/ImobFunnelTeamSection.tsx`, rota `/app/imob/dashboard?tab=funil#equipe`.
4. CRM IMOB / entrada de leads → `apps/web/src/features/imob/ThreadPanel.tsx` + `apps/web/src/pages/app/imob/chat.tsx`, rota `/app/imob/chat` (`apps/web/src/App.tsx:357`).
5. Fluxo de aprovação humana → `apps/web/src/features/imob/ImobApprovalContextCard.tsx` (dentro da aba Equipe do dashboard).
6. Trilha/RunArchive na UI → **sem página "RunArchive" própria**; superfície real equivalente é `/app/runs` (`apps/web/src/App.tsx:298`) via `apps/web/src/components/runs/RunViewer.tsx`. Registrado como equivalência, não substituição.
7. Login/onboarding → `apps/web/src/pages/access.tsx`, rota `/access` (`apps/web/src/App.tsx:425`).

**Ausentes (confirmado por busca, não por suposição):**
- `apps/web/public/` não existe como diretório — zero logo, favicon, ícone ou ilustração própria no repositório.
- Nenhuma biblioteca de ícones (`lucide`, `heroicons`, `react-icons`) em `apps/web/package.json`; produto usa glifos unicode inline.
- Nenhum componente literal de "linha de trilha"/connector — o candidato mais próximo é o sistema de bullets de estado em `apps/web/src/features/imob/ThreadPanel.tsx:270-288`, documentado como base de extrapolação (não cópia 1:1) no brand kit §3.
- `.timeline-progress` (`apps/web/src/components/runs/RunViewer.tsx:3559`) existe no markup do export HTML mas não tem nenhuma regra CSS associada — elemento presente porém sem estilo funcional; não usado como fonte.

## Arquivos criados nesta sessão

1. `docs/marketing/brand-kit-derivado-do-produto-v1.md`
2. `docs/marketing/specs-pecas-linkedin-instagram-v1.md`
3. `ops/evidence/latest/brand-kit-extraction-2026-07-02.md` (este arquivo)

Nenhum arquivo em `apps/**` ou `packages/**` foi criado, alterado ou removido nesta sessão.

## Peças que precisaram de substituição

Nenhuma. As 5 superfícies pedidas para P05–P09 (chat IMOB, CRM/intake, funil+equipe, command center, approvals) foram todas localizadas com componente e rota reais — não houve necessidade de troca de peça por ausência de superfície.

## Lista de encomenda para designer

1. Logo/wordmark EIAH (SVG + PNG), incluindo monograma para favicon/avatar.
2. Favicon e ícone de app.
3. Set de ícones consistente com a linguagem minimalista do produto.
4. Fallback tipográfico de produção definitivo para títulos (caso "Unbounded" não esteja disponível na ferramenta de design) — recomendação nesta sessão: `Poppins`/`Montserrat`, não extraído do código.
5. Versão vetorial do elemento "traço de trilha" como asset reutilizável (composição de marketing sobre tokens reais; não existe como componente pronto no produto).

## Gaps e riscos

- Inconsistência de cor entre `RunViewer.tsx:242` (`blocked` → amarelo/yellow-500) e `GovernancePanel.tsx:22` (`blocked` → rosa/rose-500) para o mesmo conceito semântico em superfícies diferentes do produto. Registrado no brand kit §1 como nota; não bloqueia a extração, mas indica que o produto ainda não tem 100% de consistência de cor de estado entre componentes — as peças de marketing adotaram rosa (`GovernancePanel.tsx`) como padrão por ser o componente de governança mais diretamente ligado ao tema da campanha.
- Contraste AA: texto branco sobre selos sólidos `#10b981`/`#5DCAA5` falha AA (2.54:1 e 2.01:1); regra corretiva (texto escuro sobre selo, ou fundo translúcido + texto claro no padrão `bg-emerald-500/20 text-emerald-200` já usado no produto) documentada em `specs-pecas-linkedin-instagram-v1.md §D3`.
- Marca é 100% textual hoje (sem logo/ícone) — risco de identidade fraca em peças de Instagram Stories/Reels que dependem de reconhecimento rápido de marca; mitigado pela recomendação de encomenda de logo como item prioritário.

## Status final

**parcial** — extração do design system real e localização de superfícies são **evidenciadas** (toda afirmação cita `arquivo:linha`). As peças finais de campanha (artes produzidas) permanecem **proposta** até serem produzidas por designer/ferramenta e aprovadas pelo CEO.

## Fontes usadas

`apps/web/tailwind.config.ts`; `apps/web/src/styles.css`; `apps/web/index.html`; `apps/web/package.json`; `package.json`; `apps/web/src/App.tsx`; `apps/web/src/features/workbench/VerticalWorkbenchShell.tsx`; `apps/web/src/features/workbench/WorkbenchPanelCard.tsx`; `apps/web/src/features/workbench/vertical-chat/VerticalSelectorBar.tsx`; `apps/web/src/features/imob/ImobApprovalContextCard.tsx`; `apps/web/src/features/imob/ImobDashboardHero.tsx`; `apps/web/src/features/imob/funnel/ImobFunnelTeamSection.tsx`; `apps/web/src/features/imob/ImobCommandCenter.tsx`; `apps/web/src/features/imob/ThreadPanel.tsx`; `apps/web/src/components/runs/RunViewer.tsx`; `apps/web/src/components/runs/GovernancePanel.tsx`; `apps/web/src/components/billing/CostBadge.tsx`; `apps/web/src/components/agents/ChatAgentLauncher.tsx`; `apps/web/src/pages/access.tsx`; `apps/web/src/pages/app/billing/index.tsx`; `apps/api/src/services/imob/intake/imobContractPiiMasker.ts`; `apps/api/src/routes/imobCrmRouter.ts`; `apps/api/src/services/imob/imobAccessGate.ts`; `apps/api/src/middlewares/requireScope.ts`; `apps/api/src/routes/governance.ts`.
