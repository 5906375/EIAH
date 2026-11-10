# Chat com fundo preto — 2026-11-10

Alteração de apresentação: fundo interno preto puro, sem brilhos decorativos; mensagens sem balões; comandos e respostas rápidas sem bordas ou preenchimentos, com foco visível. Inputs, controles de acesso e comportamento dos agentes preservados.

Execuções reais:
- 175 testes focais PASS com Node 22: FrontDoorSessionHeader, imobActionMenus e createImobStructuredForms.
- Build apps/web PASS com Node 22; avisos de ES2024/Browserslist/bundle existentes.
- Gate checkChatLauncherRenderOnly PASS.
- Chromium: 320, 390 e 1440 px PASS. Fundo computado rgb(0, 0, 0); mensagens e resposta rápida transparentes e sem borda; sem overflow horizontal ou erros de runtime.

As capturas e browser-results.json usam sessão, histórico e API sintéticos. Não houve cadastro ou operação real. Não comprovam autenticação, backend ou staging. Status parcial, aguardando CI e validação manual após deploy.

Reprodução: iniciar Vite em apps/web com VITE_API_URL=http://localhost:5180/api e porta 5180; executar node scripts/qa/black-chat.mjs com Chromium instalado no Playwright.

## Diagnóstico do E2E de encerramento

Execução inicial: https://github.com/5906375/EIAH/actions/runs/42841200498/job/129916572091
O histórico retornou active para o caseId criado. A captura de falha já mostrava confirmação de encerramento para o imóvel da jornada. Não havia captura de rede correlacionando POST, caseId encerrado e GET do histórico; o teste esperava somente texto na tela. A causa temporal exata da execução original não pode ser comprovada retrospectivamente.

A implementação de close aguarda a transação antes de responder; a UI monta a confirmação depois da resposta. Acrescentada no E2E espera pelo POST /imob/rentals/close, HTTP 200, comparação do caseId retornado com o criado e confirmação visual específica do imóvel. Sem sleep ou polling para aceitar resultado inconsistente.

Execução com correlação, commit ac18f50dc944782414b9b527953ada1ee26becdc: https://github.com/5906375/EIAH/actions/runs/42843764222/job/129925602972
Resultado: PASS / PARIDADE OK. Ambos os chats encerraram a mesma locação criada e o histórico retornou closed após a resposta. Nenhuma run criada, ativação governada também PASS. Prova funcionamento nesta execução, não determina retroativamente a causa exata da falha inicial. Lógica de produção não alterada; ajustado apenas scripts/e2e/imobChatParity.ts.

Log filtrado da execução real: parity-correlated-ci.log. Status permanece parcial quanto à validação manual em staging.
