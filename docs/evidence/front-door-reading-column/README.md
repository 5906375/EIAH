# Front Door — coluna central de leitura (2026-11-10)

Referência aprovada pelo owner: organização da conversa em coluna central, adaptada ao padrão EIAH. Chat usa largura externa max-w-6xl, margens, centralização e cabeçalho compartilhados com Perfil. Interior preto preservado. Transcrição e compositor usam max-w-3xl, centralizados; textarea ocupa toda a largura e ações ficam abaixo. Formulários IMOB em uma coluna em todas as resoluções.

Execuções reais:
- 184 testes focais PASS com Node 22 (FrontDoorSessionHeader, shell/pre-duimp e createImobStructuredForms).
- Build apps/web PASS com Node 22; avisos existentes de ES2024, Browserslist e bundle.
- Gates render-only e single-surface ok=true. Single-surface preserva conformant=false e 35 pendências legadas; esta tarefa não migra rotas antigas.
- Chromium em 320/390/1440/1920 px: Chat/Perfil com dimensões iguais no main e cabeçalho; transcrição/compositor alinhados; textarea na largura total; formulário em uma coluna; campo editável; escala de leitura preservada; comandos >=44px; sem overflow horizontal nem erros de runtime; barra oculta; roda e setas para rolagem: PASS.

Fixtures sintéticas de sessão, formulário, histórico e API. Texto sintético é adicionado ao DOM para exercitar rolagem. Capturas form-*.png e browser-results.json não comprovam operações de backend ou validação física/staging. Status parcial.

Reprodução: Vite em apps/web com VITE_API_URL=http://localhost:5180/api e --port 5180; node scripts/qa/reading-column.mjs com Chromium para Playwright instalado.
