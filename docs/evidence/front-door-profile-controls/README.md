# Padrão Perfil para formulários e comandos — 2026-11-10

Referência visual enviada pelo owner: painel Cadastro do Perfil. Formulários no Front Door recebem painel #1a2231 com borda branca translúcida e cantos arredondados; campos escuros com border-white/10 e rounded-xl; comandos pill com borda, ação principal azul accent/20 e foco de teclado visível. Menus preservam indicação expandida. Seletor de agente continua arredondado como campo. Formulários IMOB seguem em uma coluna; fundo preto e coluna central preservados. Regras CSS compartilhadas abrangem formulários nativos, campos e comandos no contexto do Front Door.

Alterações de produção: estilos e atributos de apresentação para identificar ações primárias já resolvidas. Não altera handlers, contratos, API, permissões ou execução dos agentes.

Execuções reais:
- 178 testes focais PASS com Node 22: FrontDoorSessionHeader, imobActionMenus, createImobStructuredForms e PreDuimpConversationCard.
- Build apps/web PASS com Node 22; avisos existentes de ES2024, Browserslist e bundle.
- Gate render-only PASS.
- Chromium em 320/390/1440/1920px: painel/campos/botões com bordas e raios computados, fundo do painel #1a2231 e campos black/30, distinção de ação primária, foco visível, edição de campo, coluna única, moldura Chat/Perfil igual, alinhamento do compositor e textarea, comandos >=44px, barra oculta, roda e setas e ausência de overflow/erros: PASS.

Screenshots form-*.png e form-actions-*.png usam sessão, formulário, histórico e API sintéticos; texto adicional no DOM exercita rolagem. Não comprovam backend, toque físico, CI ou staging. Status parcial.

Reprodução: Vite com VITE_API_URL=http://localhost:5180/api e --port 5180; node scripts/qa/profile-controls.mjs com Chromium para Playwright instalado.
