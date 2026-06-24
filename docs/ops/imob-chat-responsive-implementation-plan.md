# Plano de Implementação — Chat IMOB Responsivo

## Objetivo

Aproximar o chat IMOB do visual de referência sem perder:

- comportamento `agent-driven`;
- widgets já suportados;
- contexto reativo da lateral direita;
- histórico/threading atual;
- responsividade real para mobile, notebook e desktop largo.

Regra de arquitetura preservada:

- agente define;
- engine executa;
- launcher/render layer apenas apresenta.

Este plano não introduz lógica cognitiva nova no `ChatAgentLauncher`/`chat.tsx`.

## Escopo

Arquivos-alvo primários:

- `apps/web/src/features/workbench/VerticalWorkbenchShell.tsx`
- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx`
- `apps/web/src/features/imob/ThreadPanel.tsx`

Arquivos de apoio potencial:

- `apps/web/src/features/imob/ImobChatWidgets.tsx`
- `apps/web/src/features/imob/ImobIntakeSummaryPanel.tsx`

## Restrições

- Não criar regra de quick reply, handoff, bloqueio ou fallback na UI.
- Não inventar estado de contexto fora de `imobWorkbenchContext.ts`.
- Não duplicar resumo do intake em mais de uma superfície ao mesmo tempo.
- Não quebrar `contract_intake_draft` e `contract_intake_result`.
- Não atualizar `docs/EVIDENCE_INDEX.md` nesta etapa sem evidência real.

## Breakpoints

### 1. Mobile

Faixa alvo:

- `< 768px`

Objetivo:

- experiência de chat dominante;
- laterais colapsadas;
- composer sempre acessível;
- contexto sob demanda, nunca competindo com a conversa.

Implementação:

1. Em `VerticalWorkbenchShell.tsx`, manter layout de coluna única.
2. Sidebar esquerda não renderiza fixa; vira entrada resumida no topo ou drawer leve.
3. Painel direito permanece atrás do toggle já existente.
4. Header do chat reduz para:
   - voltar;
   - vertical ativa;
   - workspace quando útil.
5. Timeline central usa padding menor e largura total.
6. Quick prompts ficam imediatamente acima do composer.
7. Composer fica visualmente colado à timeline, sem bloco “solto”.
8. Cards de widget devem respeitar largura total e reduzir paddings internos.

Classes/Tailwind alvo:

- shell: `px-0.5 py-0.5 sm:px-2`
- main header: `px-3 py-2`
- timeline: `px-3 py-2`
- composer zone: `sticky bottom-0 px-3 py-2`
- context toggle: manter em `xl:hidden`

Critério visual:

- usuário vê primeiro a conversa;
- não há três colunas comprimidas;
- composer e última mensagem permanecem próximos.

### 2. Notebook

Faixa alvo:

- `768px` até `1439px`

Objetivo:

- duas áreas principais visíveis;
- esquerda compacta;
- direita contextual somente quando houver espaço real;
- lane central mais legível do que hoje.

Implementação:

1. Em `VerticalWorkbenchShell.tsx`, usar grid de duas colunas até `xl`.
2. Sidebar esquerda fica fixa, porém mais estreita e com blocos mais densos.
3. Painel direito sai da grade fixa e continua acessível pelo toggle até `xl`.
4. Lane central recebe limite de largura menor do que monitor ultrawide.
5. ThreadPanel prioriza modo compacto por padrão.
6. Operações da conversa aparecem como apoio, não como segundo painel dominante.
7. Empty state da direita fica mais curto e com menos padding quando aberto.

Classes/Tailwind alvo:

- grid: `lg:grid-cols-[220px,minmax(0,1fr)]`
- sidebar: `lg:flex lg:border-r`
- context panel fixo: somente `xl:flex`
- lane central: `max-w-[780px] xl:max-w-[860px]`
- sidebar cards: reduzir para `rounded-[12px] px-2 py-2`

Critério visual:

- notebook não pode parecer desktop espremido;
- a conversa segue dominante;
- a direita não rouba largura da timeline sem contexto resolvido.

### 3. Desktop largo

Faixa alvo:

- `>= 1440px`

Objetivo:

- reproduzir a sensação da referência:
  - navegação lateral clara;
  - chat como foco central;
  - resumo do intake estável à direita.

Implementação:

1. Em `VerticalWorkbenchShell.tsx`, restaurar três colunas apenas em `xl`/`2xl`.
2. Sidebar esquerda continua estreita e funcional, não cenográfica.
3. Lane central fica visualmente mais limpa, com menos largura excessiva.
4. Painel direito ganha papel de “resumo vivo” do intake.
5. Empty state da direita usa variante compacta.
6. Widgets centrais devem parecer cards operacionais limpos, não blocos muito altos.

Classes/Tailwind alvo:

- grid `xl:grid-cols-[228px,minmax(760px,920px),292px]`
- grid `2xl:grid-cols-[236px,minmax(820px,980px),304px]`
- shell radius menor e mais consistente
- central lane `mx-auto w-full`

Critério visual:

- monitor grande não pode virar vazio com bordas grossas;
- a largura central deve favorecer leitura de mensagens e widgets;
- direita deve parecer painel de acompanhamento, não coluna ociosa.

## Ordem de Implementação

### Lote 1 — Shell estrutural

Arquivo:

- `apps/web/src/features/workbench/VerticalWorkbenchShell.tsx`

Mudanças:

- redefinir grid por breakpoint;
- diminuir excesso de moldura;
- ajustar presença das laterais;
- preservar toggle mobile do painel direito.

Risco:

- baixo.

Dependência:

- nenhuma de backend.

Teste:

- visual manual.

### Lote 2 — Header, lane central e composer

Arquivo:

- `apps/web/src/pages/app/imob/chat.tsx`

Mudanças:

- compactar header;
- reposicionar quick prompts;
- aproximar prompts/composer;
- revisar `chatLaneClassName` por breakpoint;
- reduzir espaçamento vertical da timeline.

Risco:

- médio, porque afeta scroll, sticky composer e leitura do fluxo.

Dependência:

- nenhuma de backend.

Teste:

- visual manual;
- checagem funcional de scroll e envio de mensagem.

### Lote 3 — Sidebar esquerda

Arquivos:

- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/features/imob/ThreadPanel.tsx`

Mudanças:

- reorganizar prioridade dos blocos;
- deixar histórico mais escaneável;
- manter ações e busca compactas;
- colocar detalhes de timeline apenas quando fizer sentido.

Risco:

- médio, porque pode afetar seleção de thread e continuidade operacional.

Dependência:

- nenhuma de backend.

Teste:

- visual manual;
- seleção de conversa;
- seleção/limpeza de thread.

### Lote 4 — Painel direito reativo

Arquivos:

- `apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx`
- `apps/web/src/features/imob/ImobIntakeSummaryPanel.tsx`

Mudanças:

- compactar empty state;
- reforçar modo “resumo vivo” quando houver payload;
- reduzir redundância textual;
- melhorar hierarquia entre status, próximo passo e exportação.

Risco:

- baixo a médio.

Dependência:

- depende apenas do contrato já emitido pelo frontend/backend atual.

Teste:

- visual manual;
- validação com `contract_intake_draft`;
- validação com `contract_intake_result`.

## Sequência Recomendada de Execução

1. Ajustar `VerticalWorkbenchShell.tsx`.
2. Ajustar `chat.tsx` no header/lane/composer.
3. Ajustar sidebar e `ThreadPanel`.
4. Ajustar painel direito e empty state.
5. Validar visualmente em:
   - iPhone SE / 375x667
   - notebook ~1366x768
   - desktop 1440p / 27"

## Fora de Escopo Nesta Etapa

- novas regras de agente;
- novos widgets;
- novo contrato de backend;
- mudança em persistência;
- alteração de `imobWorkbenchContext.ts` sem novo payload;
- atualização de Evidence Index.

## Resultado Esperado

- chat IMOB com aparência mais próxima da referência;
- composição responsiva e previsível;
- sem perda das funcionalidades existentes;
- sem violar a arquitetura `agent-driven`.

## Status Real de Execução

| Item | Status | O que já foi feito | O que falta |
| --- | --- | --- | --- |
| Shell estrutural | `[x]` | Grid por breakpoint, moldura reduzida, laterais redistribuídas, toggle mobile preservado | Nada estrutural relevante |
| Header + lane + composer | `[x]` | Header compacto, lane central estreitada, prompts colados ao composer, timeline mais densa | Só ajuste fino se houver pedido visual |
| Sidebar esquerda | `[x]` | Sidebar estreitada, blocos compactados, histórico mais escaneável, busca e ações mantidas | Nada estrutural relevante |
| ThreadPanel | `[x]` | Cards menores, textos mais curtos, timeline e CTAs compactados | Só polimento se necessário |
| Painel direito vazio | `[~]` | Header menor, card vazio menor, menor custo visual | Definir política final da coluna direita |
| Painel direito com contexto real | `[~]` | Estrutura pronta e reativa ao payload continua preservada | Validar com fluxo real e possivelmente polir hierarquia |
| Mobile collapse | `[x]` | Sem 3 colunas espremidas, contexto por toggle, composer preservado | Só refinamento visual se quiser |
| Densidade da timeline central | `[~]` | Melhorou bastante, cards e balões ficaram menores | Ainda pode reduzir altura de cards pesados |
| Widgets centrais | `[~]` | Formulários e cards foram compactados | Falta um último passe em bloqueio/atenção e formulários longos |
| Validação por cenário real | `[ ]` | Ainda não fechada | Validar empty, proposta/form, contrato com contexto resolvido |
| Fechamento técnico | `[ ]` | Ainda não fechado | Smoke manual final, revisão visual final, commit se aprovado |

## Próximos Passos Recomendados

| Próximo passo | Motivo |
| --- | --- |
| Definir política final da coluna direita | É o maior ponto ainda indefinido de UX |
| Validar 3 cenários reais | Fecha o ciclo com uso real, não só layout |
| Último passe nos widgets centrais | Resolve o que ainda parece alto/pesado |
| Fechamento técnico | Só depois disso vale consolidar como pronto |
