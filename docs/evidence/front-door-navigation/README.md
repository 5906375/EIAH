# Navegação global responsiva — 2026-11-10

Escopo: menu global compartilhado por Chat e Perfil. Removidas entradas de IMOB, Logística & Comex e Pré-DUIMP; Chat permanece ativo em contextos de vertical. Rotas e gates existentes preservados.

Execuções reais:
- Node 22.23.4: 40/40 testes focais PASS (pre-duimp.test.tsx, logisticaChatOnly.structure.test.ts, FrontDoorSessionHeader.test.tsx).
- Build Vite de apps/web com Node 22: PASS. Avisos existentes de ES2024, Browserslist e tamanho de bundle.
- Chromium/Playwright: 20/20 cenários PASS, larguras 320, 390, 768, 1024 e 1440, em /app/chat, /profile, /app/chat?domain=imob e /app/chat?domain=logistica.
- Menu fechado/aberto, links dentro da viewport, ausência de overflow horizontal, Escape e fechamento após navegação verificados.
- Gates render-only, contratos e single-surface: ok=true. O último preserva baseline com conformant=false e 35 pendências legadas; não comprova migração completa das rotas IMOB.

Browser usa sessão e respostas de API sintéticas: valida apresentação e navegação, não operações reais, autenticação ou handoffs de backend. Capturas mobile em 390 px mostram menu aberto no Chat e Perfil. Validação em dispositivo físico e staging pendente.

Reprodução: iniciar Vite em apps/web com VITE_API_URL=http://localhost:5180/api e --port 5180; executar QA_BASE_URL=http://localhost:5180 node scripts/qa/responsive-navigation.mjs com Chromium instalado para Playwright.
