# Formulários legíveis e rolagem sem barra — 2026-11-10

Escopo: escala de leitura do Perfil aplicada a campos e comandos do Front Door, com labels text-sm, controles text-base no desktop e 16px no mobile (para evitar zoom ao digitar). O modo compact-ui global reduz rem; usa-se a mesma escala do Perfil no desktop. Altura mínima de 44px, títulos destacados e foco visível. Mudanças limitadas à apresentação no Front Door.

A barra é ocultada com a utilidade no-scrollbar existente; overflow-y-auto permanece. A região Conversa recebe foco com Tab para permitir setas nativas sem interceptar o teclado de campos editáveis.

Execuções reais:
- 175 testes focais PASS com Node 22 (FrontDoorSessionHeader, imobActionMenus, createImobStructuredForms).
- Build apps/web PASS com Node 22 (avisos existentes de ES2024, Browserslist e bundle).
- Gate render-only PASS.
- Chromium em 320, 390 e 1440px: escala computada dos labels/campos/ações, controles >=44px, edição de campo, scrollbar-width none, roda do mouse e ArrowDown/ArrowUp na região focada, ausência de overflow horizontal e de erros de runtime: PASS.

Capturas form-320.png, form-390.png e form-1440.png usam formulário, histórico e API sintéticos. O teste adiciona texto sintético ao DOM apenas para garantir conteúdo rolável. Não comprova backend, toque em dispositivo físico, CI ou staging. Status parcial.

Reprodução: Vite com VITE_API_URL=http://localhost:5180/api e porta 5180; node scripts/qa/readable-chat.mjs com Chromium instalado para Playwright.
