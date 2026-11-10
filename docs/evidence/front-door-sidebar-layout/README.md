# Menus laterais e espaço útil do Front Door — 2026-11-10

Ajuste na PR #523 após feedback do owner: menus operacionais IMOB à esquerda no desktop, sem bordas, com subopções inline; no mobile, navegação recolhível Operações IMOB. Cabeçalho global e interno compactados; margem superior do Chat reduzida, mantendo largura/alinhamento do shell comum. Chat usa altura dinâmica maior; compositor começa com 44px vazio e cresce até 128px ao digitar, retornando ao tamanho compacto ao limpar.

A variante sidebar do componente de menu só é usada no Front Door. O chat dedicado mantém a variante bar. Condição de autoridade showImobSurface, menus/callbacks e handlers existentes preservados. Sem nova interpretação ou concessão de acesso. Escape restaura foco; seleção fecha grupos e menu mobile. Bordas dos comandos enviados da primeira parte da PR permanecem.

Execuções reais:
- 184 testes focais PASS com Node 22: FrontDoorSessionHeader, shell/pre-duimp, imobActionMenus, createImobStructuredForms.
- Build apps/web PASS com Node 22; avisos existentes de ES2024, Browserslist e bundle.
- Gates render-only e single-surface ok=true. Single-surface mantém baseline conformant=false com 35 pendências legadas; não comprova migração de rotas antigas.
- Chromium em 320x700, 390x844, 1024x768, 1440x705 e 1920x1080: menu sem bordas, submenu inline, callback e seleção, Escape com retorno de foco, recolhimento mobile, sidebar sem cobrir a conversa no desktop, área útil da transcrição >=35% da altura mobile e >=50% desktop, compositor compacto/autogrow/shrink, colunas e formulários preservados, edição, foco, wheel/setas, sem overflow horizontal ou erros de runtime: PASS.

Fixtures: sessão/API/histórico/formulário sintéticos. O teste monta o componente real ImobActionMenuBar na estrutura real front-door-workspace, com menus canônicos e callback sintético, sem conceder autoridade IMOB nem executar operação. Texto adicional no DOM exercita rolagem. Capturas menu-*.png, form-*.png e form-actions-*.png e browser-results.json. Não comprova backend ou staging. Status parcial.

Reprodução: Vite com VITE_API_URL=http://localhost:5180/api e --port 5180; node scripts/qa/sidebar-layout.mjs com Chromium instalado para Playwright.
