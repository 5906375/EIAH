# Indicador de espera "Buscando informação..." no Front Door (`/app/chat`)

Status: **PARCIAL** (implementação local, sem commit, sem staging, sem deploy). Dados 100% sintéticos; nada aqui vem de staging ou produção.

## O que foi feito

Um único estado de espera compartilhado (`apps/web/src/lib/frontDoorPendingWork.ts`) e um único componente de apresentação
(`apps/web/src/components/agents/FrontDoorWaitingIndicator.tsx`, texto exato **"Buscando informação..."**, `role="status"`, pulsação só de opacidade,
estático com `prefers-reduced-motion`). O launcher só liga o estado ao componente: nenhuma regra cognitiva nova, nenhum nome de agente ou vertical.

- Cada solicitação tem identidade própria (`begin()` devolve o `end` dela; `end` é idempotente). Uma terminar não oculta outra pendente.
- Escopo = geração da conversa (já muda com tenant, workspace, agente e tópico) + chave de escopo para o que a geração não cobre (usuário, sessão ativa, agente).
  A chave separa **hidratação** (ausente → definido: não muda), **troca real** (definido → outro: muda) e **logout/remoção** (definido → ausente: muda). Só avança.
- `trackDecision` cobre a avaliação do handoff desde o início da cadeia (o `begin` vem antes de `decide`) e passa a espera SEM intervalo ao encaminhamento
  (ponte criada no escopo de origem do turno). Mensagens intermediárias (aviso de handoff, card de contexto) não encerram a espera.
- `trackAsyncMethods` envolve os métodos assíncronos do adaptador IMOB (formulários/ações); `forwardToImob` (inclui reivindicação P11) também é rastreado.
- "Pensando..." foi substituído pelo mesmo componente (run em andamento sem texto em streaming); a transição para o streaming oculta a espera.
- `awaitIndicator` específico do IMOB foi removido (nenhum mecanismo paralelo).
- Guarda de contexto no turno (`sendTurn`) e na digitação do aviso (`pushAssistantMessageWithTyping`, parâmetro opcional `isCurrent`): turno de contexto antigo não continua no contexto novo (ver seção de isolamento).

Arquivos: `ChatAgentLauncher.tsx`, `useImobFrontDoorForms.ts`, `FrontDoorWaitingIndicator.tsx` (novo), `frontDoorPendingWork.ts` (novo), `styles.css`,
testes `frontDoorPendingWork.test.ts` (novo), `createImobStructuredForms.test.ts`, `FrontDoorSessionHeader.test.tsx`, e o QA `scripts/qa/waiting-indicator.mjs` (novo).

## Resultados reais (cópias dos logs desta pasta; não são, por si só, aprovação)

| Validação | Resultado | Exit | Detalhe |
|---|---|---|---|
| Unitário: estado compartilhado (`unit-pending-work.log`) | APROVADO | 0 | 23 executados, 23 aprovados, 0 reprovados, 0 ignorados |
| Unitário: adaptador IMOB (`unit-imob-forms-adapter.log`) | APROVADO | 0 | 173/173; 7 testes de espera reescritos para o estado compartilhado |
| Unitário: launcher/cabeçalho (`unit-launcher-header.log`) | APROVADO | 0 | 32/32; efeito de entrada executado com o mesmo tracker |
| Chromium run5, SEM cenário X (`results/browser-results-run5-without-X.json`) | APROVADO | 0 | 10 cenários × 320/390/1440 |
| Chromium run6, COM cenário X (`results/browser-results-run6-with-X.json`) | **REPROVADO** | 1 | 10 cenários aprovados; **X reprovado** nas 3 larguras (ver abaixo) |
| Regressão da rolagem da PR #533 (`regression-scroll-chromium.log`) | APROVADO | 0 | 3 larguras |
| Gates render-only, entrypoint-debt, presentation-snapshot | APROVADO | 0, 0, 0 | `ok: true`, sem violações |
| Typecheck do web (`web-typecheck.log`) | **NÃO APROVADO** | 2 | 64 diagnósticos, conjunto idêntico ao do log local anterior (não houve baseline limpa da `main`); nenhum nos arquivos alterados |
| `git diff --check` | APROVADO | 0 | |

Depois da correção local do isolamento (guarda de contexto no turno e na digitação; ver seção abaixo), execuções finais:

| Validação | Resultado | Exit | Detalhe |
|---|---|---|---|
| Chromium run7 FINAL, 12 cenários × 3 larguras (`results/browser-results-run7-final-with-X-and-C2.json`, `results/chromium-run7-final.log`) | APROVADO | 0 | inclui X e C2; `failures: []` |
| Controle negativo, guarda desativada só nesta execução (`results/browser-results-negative-control-guard-disabled.json`, `results/chromium-negative-control-guard-disabled.log`) | REPROVOU como esperado | 1 | X e C2 reprovam em 320 px; arquivo restaurado byte a byte (hash conferido) |
| Unitários finais (`*-final.log`) | APROVADO | 0 | 23 (estado compartilhado), 173 (adaptador IMOB), 33 (launcher/cabeçalho; +1 teste da digitação cancelável) |
| Regressão da rolagem da PR #533 (`regression-scroll-chromium-final.log`) | APROVADO | 0 | 3 larguras |
| Gates render-only, entrypoint-debt, presentation-snapshot (`gate-*-final.log`) | APROVADO | 0, 0, 0 | `ok: true` |
| Typecheck do web (`web-typecheck-final.log`) | **NÃO APROVADO** | 2 | 64 diagnósticos, mesmo conjunto do log local anterior; nenhum nos arquivos alterados |
| `check:evidence-index` antes da correção (`gate-evidence-index-before-fix.log`) | APROVADO | 0 | índice com a falha registrada |

Cenários Chromium (API mockada; escritas só por mock; hosts externos abortados): **H** consulta → handoff → espera → resposta (indicador único, pulsação 0,5–1, layout e campo de
entrada constantes), **R** movimento reduzido, **E** erro, **C** troca de conversa (nova conversa) com resposta atrasada, **L** leitor acima não é movido, **A** avaliação inicial do handoff
+ ponte até a resposta (presença contínua medida por observador instalado antes da ação), **V** outra vertical (Logística, sem encaminhamento ao IMOB), **Q/Q2** duas solicitações
(a mais antiga ou a mais nova terminar não oculta a pendente), **F** salvar formulário (`POST /api/imob/owners` exclusivamente mock, retido pelo teste), **X** troca real de usuário.
Em A, V, Q, Q2, F e H o teste exige que o indicador tenha aparecido, que permaneça até a liberação e, separadamente, que seja removido depois.
Capturas: `screenshots/` (18 PNGs, 320×700, 390×844, 1440×900; incluem as de falha de X). Conferidas manualmente: texto exato, indicador após o card, sem sobreposição ao campo.

## Isolamento entre contextos: X reprovado no run6 (requisito não atendido), corrigido localmente e aprovado no run7

Com uma avaliação de handoff retida, trocar o usuário (store de sessão) e voltar: o estado de espera do contexto novo **não** herda a pendência e voltar **não** a ressuscita (testado).
Ao liberar a avaliação antiga, porém, a continuação do turno antigo **encaminha a consulta antiga** (`resolve-turn` chamado 1 vez), insere o aviso de handoff/card na conversa
e **reativa o indicador** no contexto atual (`failure-X-*.png`). Isso é isolamento entre contextos não atendido nesta versão. Observação de código (não é prova comportamental):
o corpo do turno (`sendTurn`, após `await trackDecision(...)`) não lê a conversa nem o usuário antes de continuar, e o trecho equivalente de `handleSend` no `HEAD` (`eadd2ccc`) também não tem
nenhuma leitura de `conversationGenerationRef` ou de contexto. Não foi executado X contra o `HEAD`, então não há comparação comportamental que diga se o vazamento já existia antes desta mudança.
O mesmo risco existia, sem teste próprio no run6, para troca de conversa **durante** a avaliação do handoff (o cenário C troca depois do handoff). Esta seção descreve o run6 (histórico preservado).

### Correção local e verificação (run7)

Guarda de ciclo de vida/contexto em `ChatAgentLauncher.tsx` (sem regra cognitiva; o gate `render-only` continua aprovado): `sendTurn` captura o contexto de origem (a mesma chave do estado de espera:
conversa, usuário, sessão e agente; hidratação não conta) e, se ele mudar durante a decisão ou durante/ao fim da digitação do aviso, **para**: não encaminha a consulta, não conclui a digitação
(a mensagem parcial é removida pelo id exclusivo da invocação) e não executa o restante do turno (inclui `persistHelpdeskSession`). Toda saída passa pelo `finally` de `handleSend`, que solta só a ponte deste turno.
Garantia efetiva limitada ao que a guarda cobre: **não** desfaz o que já ocorreu antes da troca (mensagem do usuário, upload, requisições em andamento).
- Testado: Chromium X (troca real de usuário) e C2 (nova conversa com avaliação retida) aprovados nas 3 larguras (run7); o **controle negativo** (guarda desativada só durante uma execução) reprova X e C2, então os cenários detectam o vazamento;
  unitário da digitação (`FrontDoorSessionHeader.test.tsx`): interrupção em cada ponto de verificação (inclusive após o último trecho), remoção só da mensagem parcial, demais mensagens intactas, comportamento igual sem `isCurrent`.
- Limitação: a observação em X e C2 é uma janela de 90 quadros, **não determinística**, e não prova a conclusão da cadeia antiga; o isolamento da cadeia com promessa controlada é sustentado pelos unitários de `trackDecision`.
- A captura `failure-X-320.png` do run6 é byte-idêntica à do controle negativo (mesmo estado de vazamento), por isso não foi duplicada; as demais capturas `final-*` só existem quando diferem das do run6 (as outras 11 são byte-idênticas).

## Implementado × efetivamente testado

| Comportamento | Implementado | Testado (como) |
|---|---|---|
| Espera por mensagem/handoff IMOB | sim | Chromium A, H; unitário `trackDecision` |
| Mensagens intermediárias não encerram a espera | sim | Chromium A, H (presença contínua); unitário adaptador |
| Outra vertical (Logística) | sim (mesmo estado, sem nome de vertical) | Chromium V; unitário de independência de origem |
| Duas solicitações simultâneas | sim | Chromium Q, Q2; unitários de identidade |
| Formulário (salvar) e reivindicação | sim | Chromium F (formulário); unitário (formulário e `claim`) |
| Erro | sim | Chromium E; unitários |
| Troca de conversa (nova conversa) | sim | Chromium C (troca depois do handoff); unitário de escopo |
| Hidratação, troca real, logout/remoção e retorno ao contexto | sim (chave de escopo) | só unitários (`frontDoorPendingWork.test.ts`); Chromium X cobre troca real e **reprova** |
| Continuação tardia de um turno de contexto antigo (usuário ou conversa) | run6: **não**; run7: sim (guarda no turno e na digitação) | run6 X **reprovado**; run7 X e C2 aprovados (janela de observação) + controle negativo + unitário da digitação |
| Run em andamento (substitui “Pensando...”) | sim | só leitura de código; sem execução própria |
| Quick reply e ação de cartão | sim (mesmo `handleSend`) | sem execução própria |
| Aprovar execução e adotar recomendação | sim (rastreado) | sem teste |

## Limitações e lacunas declaradas

- X: a janela de observação é de 90 quadros e **não é determinística**; não há sinal observável confiável do término da cadeia antiga no navegador. A conclusão da cadeia com promessa controlada é
  sustentada só pelos testes unitários de `trackDecision`.
- Sem cenário Chromium dedicado de quick reply, ação de cartão e run (usam o mesmo `handleSend`/`isStreaming`; cobertos por leitura do código e pelo mecanismo compartilhado, não por execução própria).
- `handleApprove` e `handleAdoptRec` estão rastreados sem teste próprio. Upload de anexo, avisos em background e a sonda de autoridade do IMOB (`useImobAuthority`) não são rastreados.
  Cards internos da Logística/PreDuimp têm carregamento próprio, fora do ciclo.
- A prontidão dos cenários usa estado real do app (sessão hidratada + barra do IMOB visível); não prova ausência de outra rede em curso.
- Sem leitor de tela real, sem teste de mutação. Sem validação em staging. O typecheck do web continua não aprovado (preexistente).

## Procedência e reprodução

HEAD `eadd2ccc` + árvore de trabalho não commitada. `SOURCES.sha256` registra os hashes dos fontes avaliados; `MANIFEST.sha256` registra os dos arquivos desta pasta.
Reprodução: Vite local `VITE_API_URL=http://localhost:5180/api npx vite --host 127.0.0.1 --port 5180 --strictPort` e
`QA_OUT=<pasta> node scripts/qa/waiting-indicator.mjs` (filtros opcionais `QA_ONLY`, `QA_WIDTHS`; execução filtrada é registrada como PARCIAL).
Testes: `TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test --test-force-exit <arquivo>`.
