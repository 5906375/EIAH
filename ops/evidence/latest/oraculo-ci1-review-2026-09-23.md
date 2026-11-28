# Oráculo SC — revisão CI1, 23/09/2026

Commit revisado: 24bba5a7e716f4bcc1671bda5b8052c4f29b07f8, branch work/oraculo-ci1-isolated. Revisão e correções locais, sem subagentes.

## Achados e tratamento

1. **R-CI1-01 corrigido:** oraculo_context autorizava o token, mas não exigia para o executor o vínculo com o solicitante e uma execução iniciada na mesma conexão/transação. Nova migração 20260923090000_oraculo_ci1_context_guard exige ambos; acesso direto ou de outro solicitante é recusado. Migração anterior preservada. Fluxo legítimo de aprovação e execução continua passando.
2. **R-CI1-02 corrigido:** checker do Evidence Index confundia menção histórica em “O que prova” com declaração de artefato. Menções narrativas deixam de exigir arquivo atual; links explícitos e evidenceRef continuam obrigatórios. Referências path@commit são verificadas com git cat-file no objeto indicado, incluindo recusa de commit/arquivo inexistentes. Nenhum arquivo fictício ou referência histórica removida para obter aprovação.
3. **R-CI1-03 preparado, pendente de ratificação:** 28 candidatos RV e dois refinamentos FT03 estão registrados como proposed, com matriz e testes. Não foram conectados ao executor; não produzem C5 nem autorizam enforcement. Hold negativo integrado continua sem C5 final. A ativação exige ratificação humana autenticada e PR dedicado conforme o catálogo canônico.

## Validação executada

- 77 testes de contratos/avaliação/proposta e regressões selecionadas de Pré-DUIMP passaram.
- 32 testes integrados em PostgreSQL descartável passaram; run 7ba82d00-fb62-4de8-99f0-32a0fd186fd1, com limpeza registrada pelo harness.
- Dois typechecks passaram; 8 testes do checker de evidências e 10 do checker do catálogo passaram.
- Checkers de Evidence Index e reason-code-canon passaram após as correções; git diff --check passou.
- review-checks.json preserva também as falhas intermediárias; review-recheck.json registra os checkers corrigidos. Não houve repetição da suíte integrada após alterações exclusivamente no checker/documentação, pois SQL/executor/teste integrado permaneceram iguais.

Evidências no repositório: ops/evidence/latest/oraculo-ci1-validation/review-checks.json, review-recheck.json, review-file-hashes.json e 7ba82d00-fb62-4de8-99f0-32a0fd186fd1/results.json. O relatório anterior e seus resultados históricos foram preservados.

## Próxima decisão e limites

Revisar a matriz em docs/ops/oraculo-negative-mapper-proposal.md: ratificação dos 30 tokens/destinos somente para SIMULATION, incluindo verificação não satisfeita como DENIED e incoerência temporal como REVIEW_REQUIRED. RV26 não é FAILED; RV27 exige prova de ausência de efeito; falhas de autoridade não negam credenciais. Após ratificação, preparar ativação dedicada e implementação/testes de C3/C5 negativos e recuperação de holds.

Ainda faltam integração dos escritores operacionais e autoridade global, transporte/autenticação reais, ensaio da cadeia histórica de migrações, provisionamento de papéis fora do harness e validação de rollout/CI. G3/G5 e C0 integrado permanecem abertos. Sem push, merge em main, deploy ou efeitos externos. Testes locais não declaram prontidão operacional. Pré-DUIMP permanece separado.
