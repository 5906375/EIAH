# Painel compacto, sequência e gestão de conversas — 2026-11-10

Escopo autorizado: compactar opções/realces do painel e incluir resumo navegável, busca, renomeação e exclusão confirmada de conversas. Resumo é um índice fiel dos pedidos atuais, sem resumo semântico gerado ou nova interpretação pelo launcher. Histórico persistido é IMOB, usando as fontes, membership ativa e titularidade existentes; não cria histórico geral para todas as verticais.

Frontend: Nova conversa no painel, sequência navegável por mensagem de origem, busca por título/prévia, retomada, renomeação inline e exclusão em duas etapas. Cancelar não envia DELETE. Exclusão da conversa em foco reinicia o contexto local, sem apagar entidades de negócio. Painel mais compacto, sem realces/bordas grandes; dados financeiros seguem empilhados. API antiga mantém leitura/busca local e ações de mutação desabilitadas até anunciar capabilities.

API aditiva: GET /api/imob/chat/conversations com q e capabilities; PATCH /:id para título canônico e DELETE /:id com confirm:true. Reutiliza os gates de identidade, membership, entitlement e titularidade. Mudanças acrescentam MemoryEvents auditáveis, sem editar/apagar evidências; tombstone bloqueia lista, leitura, escrita e recuperação. Lock transacional por escopo/conversa impede renomeação/exclusão concorrentes de restaurar conversa excluída. Sem migrations novas. Contrato e limites: docs/ops/front-door-conversation-history.md.

Execuções reais:
- 191 testes frontend PASS (cabeçalho/painel, sequência, persistência e formulários estruturados).
- 16 testes API/autorização PASS, incluindo integração HTTP com PostgreSQL 16 + pgvector e Redis locais descartáveis, migrations existentes. Valida proprietário, pares, workspace/tenant diferentes, membership revogada/ausente, token sem usuário, título inválido, busca sem acento, confirmação, bloqueio após exclusão, auditoria preservada e concorrência. Nenhum banco externo/staging/produção foi acessado.
- Build apps/web PASS com Node 22.
- Gates render-only, contratos e orphan-tests PASS. Single-surface ok=true com baseline conformant=false e 35 pendências legadas.
- Chromium em 320x700,390x844,1024x768,1440x900: painel compacto, dados em coluna, navegação para turno de origem, busca, rename, cancelamento sem DELETE, confirmação, retomada, reset da atual excluída, API antiga sem mutações habilitadas, sem overflow/erros: PASS.
- Typecheck amplo não limpo: TS6059/rootDir no projeto API e imports/declarations de mídia e erros fora dos componentes novos no projeto web. Logs registrados; não declarar typecheck global PASS. Nenhum erro direto foi reportado para os novos componentes/serviço nesses logs.

Browser usa API, sessão e conversas sintéticas, incluindo veredito de handoff de fixture. Testes HTTP usam stack real com dados sintéticos, guardas de acesso reais e banco descartável. Capturas delete-*.png e sidebar-*.png. Não comprovam provider de IA real, deploy ou staging. Status parcial: CI, typecheck global e validação operacional pendentes.

Reprodução: Vite com VITE_API_URL=http://localhost:5180/api e --port 5180; node scripts/qa/conversation-history.mjs. Backend: usar banco local eiah_logistica_core_* e executar imob-history-authz.integration.test.ts com Node 22 + tsx, conforme script de integração do repositório. Publicação completa exige API e frontend; esta tarefa não fez merge/deploy.
