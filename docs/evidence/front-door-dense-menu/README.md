Menu lateral mais compacto: sem margem entre grupos, altura mínima desktop de 28px e fonte normal (peso 400), sem caixa alta ou espaçamento de letras. Mobile mantém alvos de 40px. Somente apresentação; expansão e ações preservadas.

QA Chromium com dados/API sintéticos em 320,390,1024,1440: verificação de peso 400 e altura desktop <=30px, além das jornadas existentes. Resultado em browser-results.json/browser.log. Status parcial: CI e deploy pendentes.

Envio: círculo visual e SVG reduzidos em 30% (30,8px e 15,4px); alvo transparente de 44px mantém clique/toque confortável. Campo como bloco elimina espaço de baseline, alinhando centros verticais. Mesmos handleSend/canSend/upload. QA verifica redução proporcional e alinhamento em quatro larguras, além da regressão existente; send-size-browser.log. CI/deploy pendentes.
