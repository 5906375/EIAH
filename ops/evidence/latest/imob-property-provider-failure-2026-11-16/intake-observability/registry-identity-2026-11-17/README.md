# Registry LLM compartilhado — validação focal TWDG de 25/11/2026

**PASS no alcance focal local comprovado.** Codex, sem subagentes. Baseline validada: `b50e7e3759d9fa56bbb9e356d6f3798d2c7e2ed3`; branch `staging/candidate-20261107-post-imob`. Consolidação e commit local autorizados pelo responsável humano em 25/11/2026. Esta evidência materializa seletivamente o caminho canônico já utilizado pela frente; não importa os demais deltas de Asset Destination.

## Correção e alcance

Único delta de produção em [tsup.config.ts](../../../../../../packages/core/tsup.config.ts): `splitting: false` → `splitting: true`. Origem histórica `e22ff58d4c9e5dfd4b74b1572ca51e87649c68a7`; não houve cherry-pick/merge desse histórico. O compartilhamento dos chunks impede cópias independentes do registry entre as entradas ESM consultadas. A entrega deve manter o dist completo, incluindo chunks.

| Validação efetivamente produzida nesta baseline | Resultado | Exit |
| --- | --- | --- |
| Build oficial Core | PASS | 0 |
| Build API, incluindo typecheck oficial | PASS | 0 |
| Aplicabilidade dos builds reutilizados | PASS: 181 sourcemaps, 527 fontes correspondentes | 0 |
| Registry, executor compilado e completion | 5/5 probes, zero falhas/ignorados | 0 |
| Consumidores | 7/7 probes, zero falhas/ignorados | 0 |
| Preflight estático do consumidor | 25 pontos assert.* preservados, seis caminhos e raiz file: válidos | 0 |

Consumidores: 25 entrypoints, 104 módulos, 78 chunks e 169 bindings. Cobertura: entradas/exports, grafo transitivo, smoke formal, herança dos quatro providers, LLMProviderError via registry/router/completion, RetryExhaustedError/unwrap da causa e WorkerTopologyConfigError. Registry e consumidores reportaram zero tentativas de rede e zero chamadas reais. Somente o trecho emitido do executor e folhas revisadas foram executados, com construtores/transportes sintéticos; a aplicação completa não foi iniciada. As contagens são probes agregados, não contagens dinâmicas de todas as chamadas assert.*.

## Execuções e proveniência

Os resultados foram reutilizados sem repetir builds, typecheck ou harnesses durante esta consolidação. Builds da raiz: `timeout 120s pnpm --filter @eiah/core build` e `timeout 120s pnpm --filter @eiah/api build`, com variáveis sensíveis removidas, downloads desabilitados e dependências existentes compatíveis. Registry e consumidor foram executados de `apps/api` por Node ESM, limite individual 120s, usando os harnesses existentes e adaptações temporárias registradas. O módulo temporário do consumidor foi removido depois da execução.

- [Resultados consolidados e limites](validation.json).
- [Registry completo](registry-results.json) e [consumidores completos](consumer-results.json).
- [Comandos, horários, exits e adaptações](executions.json).
- [Logs dos builds](builds.log.txt), [logs dos harnesses aprovados](harnesses.log.txt) e [falhas de preparação](preparation-failures.log.txt).
- [Origem, transformações e hashes](provenance.json); [hashes dos arquivos publicados](SHA256SUMS).

Originais integrais permanecem no acervo externo `32-complemento-preservacao-20261103/twdg-incremental-20261125/core-validation`, dentro da preservação WSL existente. Prefixos privados de caminhos foram normalizados para marcadores; não são comandos diretamente copiáveis sem substituir esses marcadores. Os JSONs de harness preservam metadados do template histórico (como buildsExecuted e texto de contagem de hashes); os horários, escopos e contagens medidos estão nos registros de execução e validation.json. Não são nova execução nem nova certificação de dependências.

## Falhas históricas preservadas

1. Registry: exit 1, assertion `Capture actual formal completion diagnostic`; LOG_LEVEL=silent configurado pelo executor suprimiu o evento. Resolvido por rodada autorizada com LOG_LEVEL=info, 5/5 exit 0.
2. Consumidor: exit 1, ERR_INVALID_URL. A substituição global de import.meta.url também alterou o literal usado para adaptar a raiz do smoke. Resolvido por conferência estática e execução autorizada do harness temporário via file:, mantendo as assertions e o mecanismo original do smoke com raiz absoluta válida. Resultado 7/7 exit 0.

Os logs publicados das falhas omitem somente frames extensos contendo código em base64; causas, exits e resolução permanecem explícitos. Hashes dos originais integrais constam da proveniência. Não se atribuem essas falhas de preparação à produção.

## Limitações obrigatórias e governança

- Inspeção estática ampla e execução das folhas revisadas; ausência de certificação integral de todos os consumidores da plataforma.
- Ausência de homologação da nova imagem Docker, de staging e de validação operacional.
- Typecheck oficial API exclui testes; não elimina ressalvas de outras configurações históricas.
- Preservações incrementais de 342 arquivos ficam no mesmo disco D:, sem proteção contra sua perda física.
- Deployment e ativação operacional não autorizados. Freezes, holds, No-Go Ledgers, security-review-blocked e bloqueios das demais frentes preservados.
- Publicação, PR e integração dependem de autorização específica e preflight TWDG atualizado. PR #541 é aberto e misto (294 caminhos); não constitui veículo isolado desta correção. Nenhuma alteração nessa PR ou em suas worktrees foi feita.

Este pacote comprova somente as execuções locais registradas. Não declara conformidade global das worktrees, CI remoto aprovado ou prontidão produtiva.
