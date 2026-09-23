# Oráculo SC — corte local de negativas e recuperação

Base revisada: d1f102433ee56803ba8f278c481d7bab3b5e8709. Data: 23/09/2026. Agente: Codex, sem subagentes. Status: evidenciado no escopo sintético; parcial para integração operacional.

## Ratificação e implementação

O usuário reproduziu a sequência de ratificação dos 30 códigos, implementação, validação e versionamento e concluiu “seguir”. Registrada aprovação da matriz SIMULATION, incluindo FT03. A promoção do catálogo é candidata local para PR dedicado; publicação/revisão e conferência autenticada da origem da aprovação permanecem pendentes. Registro contextual: docs/ops/oraculo-negative-ratification.md. Não existe afirmação de assinatura digital, PR aprovado ou promoção no repositório compartilhado.

- Novas negativas DENIED, REVIEW_REQUIRED e CONFLICT persistem C5 e chegam a FINAL, sem mudar estado/revisão da visita.
- C3 negativo somente quando a avaliação identifica a credencial afetada. Findings agregados e legados não recebem atribuição fabricada. A decisão humana resolvida é preservada na auditoria.
- recoverCi1Negative finaliza um hold histórico com a avaliação/snapshot já auditados, nunca com materiais novos. O audit original e o assessment permanecem intactos; a recuperação gera audit separado, no mesmo commit do C5. Repetição/concorrência retornam o mesmo resultado.
- Erros de admissão/autoridade, causa desconhecida, commit incerto e RV27 sem prova de ausência de efeito não geram C5 fictício.
- Nova migração aditiva 20260923120000_oraculo_ci1_negative_results; as duas migrações anteriores permanecem intactas. Modelo Prisma e client gerado sincronizados. Sem rotas, workers ou escritores operacionais conectados.

## Validação real

79 testes puros/contratuais/mapper/regressões selecionadas e 44 integrados PostgreSQL 16 passaram; dois typechecks, 10 testes do catálogo e checker canônico passaram. Prisma validate/generate passou com configuração sem banco real. git diff --check passou. Instância exclusiva removida pelo harness.

Comandos: test:oraculo-s1; node --import tsx apps/api/scripts/validateOraculoS1Integrated.ts; tsc nos projetos contracts e oraculo-ci1; checkReasonCodeCanon e seus testes; prisma validate/generate --config prisma.oraculo-ci1.config.ts. Sem instalação de dependências nem acesso a banco compartilhado.

Evidências:
- ops/evidence/latest/oraculo-ci1-validation/negative-checks-20260923T155359.json
- ops/evidence/latest/oraculo-ci1-validation/51324fa4-21aa-490c-a1c0-f98a4e8f97da/results.json
- ops/evidence/latest/oraculo-ci1-validation/negative-schema-checks.json
- ops/evidence/latest/oraculo-ci1-validation/negative-file-hashes.json

A primeira execução preservada em negative-checks-20260923T155156.json e run 5bf1c5a1-3208-432d-a076-fcaaae2fe7c8 teve 40/41 integrados: a fixture esperada compartilhava referência mutável com o cenário. Corrigida por cópia independente; o banco havia preservado a auditoria. A segunda execução também cobre referência A1 na negativa, rollback de C3 e concordância de todos os mapeamentos SQL/canônicos. Perda de resposta COMMIT é injetada após commit real, sem simular crash ou partição física.

## Próxima etapa e limites

Revisar os dois commits locais/minutas (catálogo dedicado e implementação dependente). Publicar PR requer passo próprio; não houve push/merge/deploy. Conferir escritores operacionais, autoridade global, transporte/autenticação, permissões de implantação e cadeia histórica de migrações antes de integração real. G3/G5 e C0 integrado continuam abertos. Caderno Pré-DUIMP permanece separado.
