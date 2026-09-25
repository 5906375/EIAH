# Oráculo SC — correções da revisão do corte puro S1

Data: 22/09/2026. Agente Codex, sem subagentes. Baseline: e75cf1924043c44147e73329e47aec934b81b3d0, com alterações locais não commitadas. Escopo autorizado: correções do corte puro e validação local isolada. Implementação integrada não autorizada; G3/G5 abertos.

## Correções verificadas

- R-S1-01: reconstrução do contexto E1 corrente a partir do snapshot sintético, incluindo revisões de case/operação/visita, ação canônica derivada da direção e referências materiais de evidência, snapshot e risco. O hash de E1 revisado e o inputHash de A1 devem coincidir com esse contexto corrente. A concordância entre E1 antigo e A1 não basta.
- R-S1-02: observationId deve ser único em todo o snapshot. Repetições, inclusive entre credenciais diferentes, são recusadas na validação de entrada.
- R-S1-03: C3/C5/tracking reutilizam governedReasonCodeV1Schema e recusam duplicatas. Validade sintática não registra nem ativa um código.

Fixture pure-v1 preservada; pure-v2 acrescenta as revisões explícitas e manifesto próprio. Testes cobrem divergências de contexto mesmo com A1 recalculado, troca de prova OUT, referências materiais, duplicações e reasonCodes inválidos. Controles positivos preservam equivalência de conjuntos e a exigência de HITL persistido.

## Evidência executada

73 testes passaram; zero falhas, skips ou cancelamentos. Typecheck contracts e typecheck restrito API/testes passaram com --noEmit. git diff --check passou. Comandos exatos, saídas, configuração e 11 hashes estão nos [resultados brutos](oraculo-s1-review-fixes-2026-09-22/results.json). Os hashes foram conferidos novamente antes deste registro.

A evidência anterior de 59 testes permanece histórica; esta rodada corresponde à árvore corrigida. NODE_ENV=test; TSX_TSCONFIG_PATH=tsconfig.base.json. DATABASE_URL, SHADOW_DATABASE_URL, REDIS_URL e NODE_OPTIONS removidas do ambiente dos comandos. Sem instalação, migration, serviço, integração ou deploy.

## Limites

O avaliador continua applied=false. Aprovação sintética válida permanece REVIEW_REQUIRED com HITL_PERSISTENCE_NOT_IMPLEMENTED. Não há prova de autoridade viva, persistência, isolamento transacional, recuperação ou concorrência. Não foram executados CI completo nem testes integrados de banco. Os marcadores de mapper FT03 continuam pendentes. Nenhum gate integrado é encerrado por estes testes.
