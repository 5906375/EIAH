Compactação compartilhada dos formulários IMOB: padding (1rem/1,25rem → 0,7rem/0,875rem), distância entre campos (0,75rem → 0,525rem), altura mínima desktop (44px → 30,8px), padding dos controles e distância entre ações reduzidos em 30%. Largura responsiva e coluna única mantidas. Texto com piso de 12px; mobile preserva inputs em 16px e alvos de 40px. A altura total não é uma redução matemática fixa: depende do conteúdo e destas salvaguardas de legibilidade.

Aplica-se ao ImobFormCard, compartilhado por /app/chat e /app/imob/chat, cobrindo os modelos-base e variantes que usam este renderer, sem alterar contratos/campos/handlers. Não reduz compositor, menus ou mensagens.

Execuções reais: 185 testes de formulário PASS. Quatro cenários Chromium PASS (320,390,1024,1440) com formulário e API sintéticos, texto/e-mail/telefone/lista/arquivo, preenchimento, seleção e anexo. Verifica padding/gap 70%, largura sem overflow, mobile legível e métricas equivalentes sem ancestral Front Door. Esta última é uma verificação de CSS do renderer compartilhado, não uma jornada completa na rota legada nem de todos os 21 fluxos. Capturas form-*.png e browser-results.json. Status parcial: CI/deploy pendentes.

Build web com Node 22 PASS (build.log), com avisos existentes do bundler.

Seletor de agente inline: rótulo visual Agente oculto com sr-only, mantendo associação aria-labelledby e placeholder Selecione um agente; nenhuma alteração em onValueChange, carregamento ou lista. QA verifica rótulo oculto e combobox com nome acessível Agente; agent-label-browser.log.
