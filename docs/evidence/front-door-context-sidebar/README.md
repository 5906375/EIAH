# Painel único de workspace e operações — 2026-11-10

Incremento da PR #523: custo mensal do workspace, quota, seletor de agente/Playbook e menus operacionais passam para uma única coluna lateral. Novo FrontDoorSidebar controla apenas apresentação: expandir/recolher no desktop, painel único inicialmente recolhido no mobile, fechamento após operação e Escape com retorno de foco. Header conserva só o título da conversa. O menu sidebar recebe modo embedded para evitar dois recolhimentos e scrolls aninhados.

O bloco ContextualCostPanel foi movido com os mesmos props e as mesmas condições. Valores, fontes de dados, cálculos e hooks financeiros preservados. AgentSelect e Playbook conservam controles/handlers existentes. showImobSurface continua sendo o gate da autoridade IMOB; o painel não concede autoridade ou cria menus quando ela falta. Conversa preta, coluna única e compositor expansível preservados.

Execuções reais:
- 184 testes focais PASS com Node 22: FrontDoorSessionHeader (agora renderiza também o JSX real do painel para verificar agente, R$123,45 e quota37%), shell/pre-duimp, imobActionMenus, createImobStructuredForms.
- Build apps/web PASS com Node 22; avisos existentes ES2024/Browserslist/bundle.
- Gates render-only e single-surface ok=true; single-surface conserva baseline conformant=false com 35 pendências legadas.
- Chromium em 320x700,390x844,1024x768,1440x705,1920x1080: custo e quota sintéticos preservados no painel, combobox somente na lateral, header sem indicadores/agente, expandir/recolher desktop aumenta largura da região da conversa, painel mobile único, submenu sem bordas e sem sobreposição, seleção/callback/Escape/foco, área útil, compositor autoaltura, edição e layout/rolagem sem overflow ou erros: PASS.

Fixtures: sessão, API, formulário e histórico sintéticos. O painel real é o da aplicação; o teste monta somente o menu operacional real dentro do painel como fixture, com callback sintético, sem conceder acesso IMOB. Texto adicional ao DOM exercita rolagem. Capturas menu/form/form-actions e browser-results.json. Não comprova backend, CI ou staging. Status parcial.

Reprodução: Vite em apps/web com VITE_API_URL=http://localhost:5180/api e --port 5180; node scripts/qa/context-sidebar.mjs com Chromium instalado para Playwright.
