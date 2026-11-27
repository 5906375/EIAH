# Oráculo S1 — validação pura local

Data: 22/09/2026. Agente Codex, sem subagentes. Autorização: Carlos autorizou implementar o corte e executar validação local isolada na conversa. Status evidenciado somente para o recorte puro abaixo. G3/G5 e C0 integrado continuam abertos.

Baseline: e75cf1924043c44147e73329e47aec934b81b3d0, mais alterações locais não commitadas. Node v22.17.1; tsx 4.21.0; TypeScript 5.9.3; Zod 3.25.76. O arquivo de resultados registra comandos exatos, saídas, configuração de typecheck restrito e hashes dos arquivos testados.

## Resultado

- Typecheck contracts --noEmit: passou.
- Typecheck restrito dos módulos e testes novos --noEmit: passou.
- Testes Oráculo + regressões selecionadas PRE_DUIMP: 59 passaram, zero falhas.
- git diff --check: passou; não equivale a validação de semântica.

Veja [resultados brutos](oraculo-s1-pure-validation-2026-09-22/results.json). Execução por node --import tsx --test; NODE_ENV=test e TSX_TSCONFIG_PATH=tsconfig.base.json. DATABASE_URL, SHADOW_DATABASE_URL, REDIS_URL e NODE_OPTIONS removidas do ambiente dos comandos. Nenhum .env carregado, build de DB, instalação, migration, serviço ou integração real executado.

## Alterações

Schemas Oráculo C1–C5/E1/tracking separados, export aditivo, canonicalização FT02 e projeções H1/HI/HD/HA, avaliação interna pura e fixtures sintéticas. Os schemas e canonicalização existentes de PRE_DUIMP não foram alterados. Digests H1 da fixture foram produzidos independentemente por Python para dados ASCII/integer/UTC; HA tem vetor SHA-256 conhecido. O manifesto verifica bytes e inclui conteúdo dos snapshots sintéticos; não é trust root produtivo.

O avaliador devolve applied=false e nunca emite C5 APPLIED. Findings RVxx são referências documentais, não ativação de reasonCodes produtivos. NOT_VERIFIED e coerência temporal preservam marcadores explícitos de mapper pendente. Aprovação sintética válida continua REVIEW_REQUIRED enquanto HITL persistido não existir. Variante básica não é fallback da variante HITL.

## Limites e decisões de adapter

Referências locais de case/operação/visita/requester usam id+revision; reviewedObservationRefs usa observationId imutável. Esses adapters não mudam enums genéricos. Para a fixture pura, criteria é sim-empty-return-criteria revision 1; a configuração de critérios/fonte da integração futura exige versão explícita. A origem de inspeção vem de binding fornecido no snapshot sintético, nunca de placa ou semelhança de texto.

O avaliador consome um snapshot interno sintético explicitamente fornecido, não body HTTP autorizado. Não comprova fonte de autoridade viva, persistência, concorrência, recuperação, efeitos físicos ou go-live. O serializador recebe valores já parseados: detecção de chaves JSON repetidas pertence ao futuro transporte. retryAfter segue pendente de unidade/limites e não é aceito neste recorte de tracking. A prova de devolução é adapter local de fixture, não novo contrato genérico de evidência. Nenhum fechamento integral de AC01–AC25 é declarado.

## Histórico de validação

Primeira tentativa falhou por chave de fechamento ausente no novo schema; corrigida. Rodada seguinte: contracts typecheck e 57 testes passaram. Revisão acrescentou normalização temporal herdada, typecheck API restrito, integridade de manifesto e teste HD. Resultado final abaixo é da árvore com essas correções. Não houve execução dos testes de DB, concorrência, integração ou CI completo por estarem fora do corte autorizado.
