# Consulta de revisão do corte negativo CI1

Contexto: revisar, somente por leitura, o corte local de negativas SIMULATION. Não implementar, publicar ou fechar gates. Sem subagentes.

Passo 0: ler CODEX.md e CLAUDE.md da raiz e quaisquer aninhados antes do código; resumir em 5–10 linhas as regras aplicáveis. Seguir o roadmap canônico, AGENTS.md, arquitetura de chat, Evidence Index e IA_EIAH.md, sinalizando conflitos. Fonte TS é canônica; launcher apenas apresenta; evidência real é obrigatória; isolamento tenant/workspace, autorização e HITL devem falhar fechados.

Documentos-alvo: docs/ops/oraculo-ci1.md, oraculo-negative-ratification.md, oraculo-negative-mapper-proposal.md e reason-codes-catalog.md. Inspecionar packages/core/src/reasons/reasonCatalog.ts, apps/api/src/services/logistica/oraculo/{evaluation,negativeMapping,transactionExecutor,ci1.integration.test}.ts, nova migração 20260923120000_oraculo_ci1_negative_results e packages/db/prisma/schema.prisma. Não tratar client gerado como fonte normativa.

Verificações: C5 negativo não altera visita; não imputar falha a credencial não avaliada; escopo e sessão são revalidados; referências C3/C5 são consistentes; avaliação/auditoria originais sobrevivem à recuperação; concorrência não duplica resultado; perda de resposta do commit não vira FAILED; RV27 exige prova independente; novos materiais não reavaliam intenção antiga; migrações anteriores intactas; catalogação local não equivale a PR aprovado.

Entregável: (0) resumo normativo; (1) sumário com prontidão apenas no escopo demonstrado, sem percentual global inventado; (2) matriz Item/CONFIRMADO|PARCIAL|AUSENTE|DIVERGENTE/evidência arquivo:linha/lacuna; (3) drift; (4) riscos bloqueantes; (5) backlog com critérios de aceite; (6) perguntas e arquivos ausentes. Sem evidência, classificar parcial; não declarar produção pronta por testes sintéticos.
