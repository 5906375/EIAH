# Chat com fundo preto — 2026-11-10

Alteração de apresentação: fundo interno preto puro, sem brilhos decorativos; mensagens sem balões; comandos e respostas rápidas sem bordas ou preenchimentos, com foco visível. Inputs, controles de acesso e comportamento dos agentes preservados.

Execuções reais:
- 175 testes focais PASS com Node 22: FrontDoorSessionHeader, imobActionMenus e createImobStructuredForms.
- Build apps/web PASS com Node 22; avisos de ES2024/Browserslist/bundle existentes.
- Gate checkChatLauncherRenderOnly PASS.
- Chromium: 320, 390 e 1440 px PASS. Fundo computado rgb(0, 0, 0); mensagens e resposta rápida transparentes e sem borda; sem overflow horizontal ou erros de runtime.

As capturas e browser-results.json usam sessão, histórico e API sintéticos. Não houve cadastro ou operação real. Não comprovam autenticação, backend ou staging. Status parcial, aguardando CI e validação manual após deploy.

Reprodução: iniciar Vite em apps/web com VITE_API_URL=http://localhost:5180/api e porta 5180; executar node scripts/qa/black-chat.mjs com Chromium instalado no Playwright.
