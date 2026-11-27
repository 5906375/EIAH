Área de mensagens do Front Door escurecida em 20% com fundo preto alpha 0,2 sobre o cartão existente. Afeta somente launcher-conversation-surface; não aplica opacity ao conteúdo, nem altera fundo do painel esquerdo, compositor, bordas ou handlers.

QA Chromium com conversa longa/API sintéticas em 320,390,1024,1440: verifica background rgba(0,0,0,0.2), opacity 1, fundo do shell preservado, rolagem por mouse/teclado e navegação. Capturas scroll-*.png, browser-results.json e browser.log. Status parcial: CI/deploy pendentes.
