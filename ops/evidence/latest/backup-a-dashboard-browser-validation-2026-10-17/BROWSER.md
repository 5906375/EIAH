# BACKUP-A dashboard — validação em NAVEGADOR REAL e correção da interatividade (2026-10-17)

| Campo | Valor |
| --- | --- |
| Decisão vinculada | `STORAGE-02B.11-DEC-20261017-01` — `ops/evidence/latest/backup-a-scheduling-decision-2026-10-17/DECISION.md` (histórico preservado) |
| Evidência corrigida/complementada (preservada, não reescrita) | `ops/evidence/latest/backup-a-dashboard-2026-10-17/DASHBOARD.md` — ela afirmava a interface validada só por testes HTTP automatizados e capturas de tela; a interatividade **não** havia sido testada com cliques reais, e o defeito abaixo passou despercebido. Este registro substitui essa afirmação para fins de interatividade; o código atual está em `source-after-fix/`. |
| Executor | Claude Code, por instrução do owner. Nenhuma chamada AWS, upload, conciliação, captura, restauração ou exclusão em dados reais; as ações foram exercitadas só contra fixture sintética com `mock-aws`. |
| Registro | 2026-10-17T13:57Z = 2026-10-17T10:57-03:00 (America/Sao_Paulo) |
| Status | `DASHBOARD_INTERACTIVITY_FIXED_AND_BROWSER_VALIDATED` |

## 1. Defeitos encontrados no navegador real (Edge via DevTools Protocol)
1. **Nada era clicável (causa principal).** `.modal{display:grid}` anulava o atributo `hidden`; o overlay `div#modal` (position:fixed, tela inteira) ficava **sempre por cima da página**, interceptando todos os cliques reais e escurecendo a tela. Cliques programáticos (`element.click()`, navegação por `#hash`, curl/HTTP) funcionavam, por isso os testes anteriores não viram. Prova: `elementFromPoint` no botão "Agenda" devolveu `DIV.modal#modal`; clique real não mudou a visão. Correção: `[hidden]{display:none!important}`.
2. **CSP bloqueava `style=` inline:** a barra da fila aparecia com 100% de largura. Correção: estilos por objeto CSSOM (`el.style.width`), sem atributo `style` (teste estático proíbe `style:` string e `setAttribute("style")`).
3. **Filtros do histórico eram recriados a cada atualização de 5 s** (texto digitado e foco perdidos) e a busca só valia ao sair do campo. Correção: filtros persistentes (criados uma vez), busca aplicada enquanto digita (300 ms), atualização automática só troca a tabela e não mexe no campo em foco.
4. **Cliques podiam se perder** se a atualização trocasse o DOM entre `mousedown` e `mouseup`: a renderização agora espera o ponteiro ser solto. Detalhes só re-renderizam quando mudam.
5. **Acessibilidade/aparência de clicável:** ausência de realce e de indicação nas linhas. Correções: `cursor:pointer`, realce de hover/foco visível (3 px), botão "Abrir ›" em cada linha, dica "Clique numa linha (ou Tab + Enter)", linhas focáveis por teclado (Enter/Espaço), Esc fecha detalhes/diálogo, botões com estado hover/ativo, favicon vazio (sem 404 no console), opção de 5 por página (para exercitar a paginação com 6 runs), colunas numéricas sem quebra.
Diff: `fix.diff`; saída do teste antes da correção: `logs/before-fix-output.txt`.

## 2. O que foi COMPROVADO NO NAVEGADOR (Edge headless do Windows, eventos de entrada reais via `Input.dispatchMouseEvent/KeyEvent`)
`browser-test.mjs` — resultados em `results/*.json`, capturas em `screenshots/`.
**Contra o servidor real (`http://127.0.0.1:8765/`, SOMENTE LEITURA): 36 de 36 OK**, console sem erros/exceções, sem falhas de rede, sem HTTP ≥ 400, nenhuma requisição `/api/aws` ou `/api/upload` (verificado por `performance.getEntriesByType`):
- carregamento de `app.js`/`app.css` (200) e renderização; script ativo (estado e atualização);
- cliques reais em Agenda, Histórico, Depende de você e retorno; barra da fila com largura proporcional;
- busca digitando (filtra para 1 registro sem Enter), **Limpar**, **texto e foco preservados após a atualização de 5 s**;
- filtros de perfil (diário+semanal+manual somam o total), estado, período (2099 ⇒ 0), ordenação (inverte), tamanho de página 5 ⇒ 2 páginas, **próxima** (página 2 com 1 registro) e **anterior**;
- clique real na linha ⇒ painel de detalhes (horários Brasília/UTC, tamanhos×recibo, SHA-256 registrado, seção de recuperação); **botão copiar** muda para "copiado" e o conteúdo da área de transferência é o valor exibido; botão Fechar; **Enter** em linha focada abre os detalhes;
- botão copiar do comando de login; "Verificar sessão AWS" presente e **não clicado**;
- emulação de celular 390 px sem rolagem horizontal.
**Contra fixture sintética + `mock-aws` (porta 18800, mesmo navegador): 44 de 44 OK** (os 36 acima + ações): linha CAPTURED ⇒ botão "Enviar este run ao S3" ⇒ diálogo ⇒ "Preparar plano" ⇒ plano com objetos, chaves e hash; confirmar começa desabilitado; frase correta sem sessão válida continua desabilitado; "Verificar sessão AWS" (mock) valida; frase errada mantém desabilitado; frase correta + sessão habilita; **duplo clique no botão** ⇒ um único upload (lado servidor: 3 PUTs, um por objeto, nenhum duplicado); acompanhamento mostra "VERIFICADO: 3/3 objetos por download completo"; o run passa a "verificado".

## 3. O que continua comprovado SÓ por testes automatizados (não pelo navegador)
`tests/test_dashboard.py` (20 testes, em `ops/evidence/latest/backup-a-dashboard-2026-10-17/tests/`, reexecutados após a correção: `logs/dashboard-tests-after-fix.log`): Host/Origin/CSRF/token, path traversal e ids inválidos, métodos não permitidos, sem AWS nos GETs, bind em loopback, plano alterado exige nova revisão, um upload por vez, servidor parado durante o job, sessão expirada, falha de fonte como "não disponível", conciliação protegida; novas asserções estáticas (sem `style` inline, `[hidden]` protegido).

## 4. Limitações
- Navegador: apenas Edge headless (Chromium) no Windows; Firefox/Safari/dispositivos móveis reais e leitores de tela não testados; 390 px por emulação de viewport.
- Selects: a escolha da opção foi feita por `value` + evento `change` (o select recebeu clique real, mas a opção foi aplicada por `value` + `change`, sem escolher na lista nativa); datas por `value`+`change`.
- A área de transferência do teste usa a permissão concedida ao navegador de teste; copiar pode ter substituído o conteúdo da área de transferência do Windows durante o teste.
- No modo real, conciliação e envio real **não** foram exercitados; a conciliação nem no mock via navegador (coberta só pelos testes de proteção).
- Mudança cosmética final (`white-space:nowrap` nas colunas numéricas do plano) foi incluída antes da execução final das duas suítes de navegador.
