# Menu compacto e contorno de comandos — 2026-11-10

Opções do menu dentro do Front Door: borda 1px com branco 8%, rounded-lg, fundo branco 3%, espaçamento de 4px e padding menor; altura mínima 36px no desktop e 44px no mobile. Mensagens enviadas pelo usuário (incluindo comandos como Cadastrar imóvel) recebem o mesmo contorno, raio e fundo, com largura ajustada ao conteúdo e limite de 85%. Não são convertidas em botões nem recebem interpretação nova. Avisos do assistente continuam sem balões.

Escopo de produção: styles.css e um atributo data-message-role no render. Nenhum handler, contrato, engine, permissão ou API alterado.

Execuções reais:
- 27 testes focais PASS com Node 22 (FrontDoorSessionHeader e imobActionMenus).
- Build apps/web PASS com Node 22; avisos existentes de ES2024, Browserslist e bundle.
- Gate render-only PASS.
- Chromium em 320/390/1440/1920px: bordas e raios computados iguais em comando enviado/opção de menu; opção desktop menor que 44px e mobile >=44px; callback correto ao selecionar e fechamento após seleção/Escape PASS. Também preservados estilo de formulário, coluna única, moldura Chat/Perfil, foco, edição, alinhamento do compositor, rolagem sem barra e ausência de overflow/erros.

Fixtures: sessão, histórico, formulário e API sintéticos. O componente real ImobActionMenuBar é montado pelo teste no contexto do compositor com opções sintéticas, sem conceder autoridade IMOB ou executar operações reais. Texto adicional no DOM exercita rolagem. Capturas form-*.png, form-actions-*.png e menu-*.png. Não comprova backend ou staging. Status parcial.

Reprodução: Vite com VITE_API_URL=http://localhost:5180/api e --port 5180; node scripts/qa/compact-command-borders.mjs com Chromium instalado para Playwright.
