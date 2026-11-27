# Propagação de falha IMOB — Δ1–Δ3 autorizado

Data: 2026-11-16. Executor: Codex, sem subagentes. Status técnico **PARCIAL**.
Branch `feat/imob-guided-property-draft`, HEAD `70e66db4e7eea727f0f3567d8291595b1f86243b`. Sem stage/commit/push/deploy. CLAUDE.md e CODEX.md preservados.

## Escopo e autorização

O usuário autorizou concluir somente Δ1 (falha interna compartilhada), Δ2 (identificadores e consumidores pertinentes) e Δ3 (tipagem/empacotamento do recorte). O restante da proposta em `docs/architecture/agent-chat-runtime.md` continua **PROPOSTA**. Não há autorização geral de fallback, orçamento de tentativas, cancelamento, billing ou deploy.

Este diretório reúne os registros anteriores à pausa e da retomada. Logs originais e falhas intermediárias não foram reescritos ou apagados. Comandos novos, horários, sinais e **exit codes reais** constam de `delta-executions.json`. Arquivos anteriores sem código preservado não são promovidos a comprovação de aprovação.

## Causa e correção por camada

O diagnóstico real anterior recebeu OpenAI `insufficient_quota / credit_balance_exhausted`; o adaptador devolveu texto vazio, completion registrou sucesso e intake falhou em json_parse. A correção local verifica transporte/status/error antes da extração, lança LLMProviderError sanitizado e interrompe quota financeira sem retry. Rate limit/transitórios seguem os limites existentes; não há fallback novo.

O executor propaga a exceção. Intake mantém unavailable, patch vazio e proposta vigente; falha não vira conteúdo para parser/schema. O engine fornece a mensagem do contrato IMOB. O adaptador do formulário preserva draft/proposta/contexto e encerra a espera pelos mecanismos existentes. Não grava imóvel nem encaminha o turno para outro domínio.

Não se ampliaram timeout, cancelamento físico ou falha interna transversais. O erro de integração por identidade ausente é uma guarda pós-geração, não recusa de provider nem erro transitório.

## Identificadores e compatibilidade

| Campo | Origem/semântica |
| --- | --- |
| completionId | ID do corpo retornado pelo provider, quando existente. id permanece compatibilidade legada de completion, vazio se ausente |
| providerRequestId | Header x-request-id real, quando fornecido; ausência não é preenchida por outro identificador |
| traceId / telemetryRef | Correlação interna recebida nos metadados; não substituída por completion ID |
| requestId legado | Referência já usada pelo breakdown: completion ID real preferido, header real quando não há completion ID; nunca literal openai. Não é prova de ID de request do provider |
| model / modelRequested | Modelo solicitado |
| modelUsed | Modelo confirmado no retorno, ou ausente. Resposta determinística não comprova provider/modelo utilizado |
| usage | Uso recebido ou null. Nenhuma estimativa de custo foi criada |

Consumidores conferidos: generateText, executeLlmStep, normalizeCapabilityResult, executeCapability/recordCapabilityUsage e a chave de idempotência usada por recordRunUsageBreakdown. O writer financeiro não foi alterado. Os testes usam seu dublê para conferir os argumentos e a estabilidade de `(runId, requestId, meterType)`; **não demonstram unicidade/concorrência em banco**.

Uma capacidade com run/tenant/workspace e geração concluída sem identidade utilizável lança CapabilityUsageIdentityUnavailableError antes de registrar uso ou retornar sucesso. O erro tem retryable=false e generationCompleted=true; o catch da capacidade o relança imediatamente, sem próxima rota. Teste com plano que possui fallback confirma uma geração somente. A falha ocorre depois de runCompletion; não reentra em seu retry. Leitura dos callers consultados: orchestrator relança erros sem correspondência à regra de contexto ausente; runWorker registra falha no catch final. Não é auditoria transversal de filas/redrive.

**Bloqueio financeiro separado:** suportar metering durável de consumo sem identidade real exige definir a identidade/chave financeira e reconciliação apropriadas. Isso não foi implementado. Não se declara custo zero, estorno ou ausência de cobrança. O writer existente ainda possui defaults/estimativas próprios para uso ausente; essas regras não foram alteradas nem homologadas por este trabalho. O intake de cadastro não chama esse writer, reservas ou chargeRun.

## Validações reais da retomada

| Comando/registro | Resultado | Exit | Contagem e alcance |
| --- | --- | --- | --- |
| pnpm test:llm-provider-failure / delta-first.log | APROVADO | 0 | 9/9, 0 falhas/ignorados; transporte sintético, código real de runtime/intake; consumidores com imports de billing substituídos |
| Seleção runtime: rate limit e IDs / delta-ids-final.log | APROVADO | 0 | 3/3 após últimas edições de guarda/log; sem reexecução dos seis casos inalterados |
| Seleção executeCapability / delta-capability.log | APROVADO | 0 | 1/1; caminho determinístico real, sem chamada de provider ou query financeira |
| Contratos tsc --noEmit / delta-contracts.log | APROVADO | 0 | Tipagem do pacote de contratos; sem emissão |
| @eiah/core build / delta-core-final.log | APROVADO | 0 | Build oficial, incluindo declarações e novos símbolos; sucede core-build após mudança no log |
| @eiah/providers build / delta-providers-build.log | APROVADO | 0 | Build oficial; fontes de provider não mudaram depois, resultado reaproveitado |
| Smoke dist / delta-package-final.log | APROVADO | 0 | Imports/declarations, identidade de erro entre entradas, recusa sintética e IDs; não executa aplicação empacotada completa |
| Registro oficial CI / delta-ci-final.log | APROVADO local | 0 | checkOrphanTests ok:true; não é CI remoto |
| Evidence Index / delta-evidence-index-outside.log | APROVADO local | 0 | 961 referências; consulta histórica fora do sandbox após EPERM |
| Integridade textual / delta-whitespace.log | APROVADO | 0 | git diff --check; sem stage |
| Typecheck focal final / delta-final-types.log | REPROVADO | 1 | 16 raízes; 2 diagnósticos antigos focais, 16 de dependências, 0 introduzidos |
| Typecheck inicial / delta-first-types.log | BLOQUEADO pelo sandbox | 1 | spawnSync git EPERM; preservado; refeito fora do sandbox autorizado |

O primeiro gate de referências, `delta-evidence-index.log`, terminou 1 e apresentou sete referências históricas como ausentes. A consulta isolada ao Git demonstrou `spawnSync git EPERM` no sandbox; com autorização, o mesmo gate fora do sandbox terminou 0 e confirmou 961 referências. Não houve alteração das referências históricas nem do gate para obter aprovação. A falha original foi preservada.

`delta-typecheck.json` contém baseline HEAD virtual e estado inicial da retomada. `delta-typecheck-final.json` contém o estado final e reutiliza essa baseline, com mesmo HEAD/configuração. Nenhum worktree/stash/checkout alternativo foi criado. A comparação usa versões HEAD dos arquivos modificados e módulos vazios para raízes novas ausentes no HEAD, mantendo as mesmas dependências/configuração. É baseline focal virtual, não typecheck integral de checkout limpo.

O erro introduzido de presentationSnapshot foi removido declarando a propriedade que o adaptador já produz; asserção não mudou. Permanecem TS2551 em createImobStructuredForms.test.ts:986 e :1305 (`blockers` versus `blocker`), presentes também no HEAD virtual. Os 16 diagnósticos de dependências foram preservados integralmente no log/JSON, não corrigidos nem certificados. O typecheck termina 1, sem esconder os erros antigos.

Resultados anteriores reaproveitados: intake-tests-direct.log (13/13, exit 0), adapter-tests-direct.log (15/15, exit 0), gates render-only/runtime-entrypoint/presentation e suas limitações já registradas na proposta. O ajuste final do adaptador é somente de tipo; não alterou sua execução. A revalidação dos três casos após a guarda final cobre a parte afetada do conjunto de nove; não somar execuções repetidas como testes distintos. O resultado anterior de sete casos é histórico, sucedido pelos nove.

## Fixture e proveniência

`apps/api/src/tests/fixtures/openai-credit-balance-exhausted.json` deriva de `runtime.syntheticRawResponse.error` em `../imob-property-provider-diagnostic-2026-11-16/openai-integrated.json`, SHA-256 `f77384445eebd224b210fb2d9101e79e7a0b46d7b4a9462172df0b454333bbd7`. Mantém type/code; message/param foram omitidos. O original permaneceu intacto. Status HTTP e IDs usados nos testes são sintéticos; não foram recuperados da tentativa real. Nenhum teste desta retomada chamou provider real.

## Artefatos, integridade e limites

- `delta-executions.json`: cada comando e sua saída de processo; labels diferentes preservam as execuções anteriores.
- `delta-*.log`: saídas originais, incluindo sandbox, falhas e resultados reaproveitados.
- `delta-typecheck*.json`: diagnósticos completos e comparação focal; não são aprovação integral.
- `validate-deltas.mjs`, `typecheck-deltas.mjs`, `package-smoke.mjs`: runners locais com propósito explícito. O typecheck foi estendido para reutilizar a baseline na rodada final; os resultados anteriores não foram sobrescritos.
- `results.json`: consolidação factual, referências e limitações. `source-hashes.json`: fontes finais e artefatos pertinentes, exceto o próprio manifesto.

Todos os artefatos deste diretório permanecem locais para revisão/rastreabilidade. Os builds formais ficam nos dist ignorados dos pacotes, não em src; não houve limpeza de arquivos anteriores, novos backups ou normalização dos logs. Logs contêm caminhos locais e configurações exclusivamente sintéticas de teste; não contêm chaves reais. A fixture foi minimizada como descrito; os logs originais não foram sanitizados silenciosamente.

**Não validado:** CI remoto, HTTP com banco, navegador, provider real após o patch, fluxo de quartos/vaga com geração real, aplicação empacotada completa, ciclo financeiro/concorrência real. A causa da tentativa específica de staging continua não comprovada; a quota local não comprova quota em staging. Web/API foram observadas incompatíveis; alinhamento e reteste permanecem separados e exigem autorização própria. Oferta de avaliação e ratificação P1 preservadas.

## Preparação de stage/commit — sem execução

A seleção revisável está no [plano existente reutilizado](../imob-property-capture-context-2026-11-14/stage-commit-plan.md), cujo histórico foi preservado. São **71 caminhos únicos: 39 adições normais e 32 logs ignorados**, sujeitos a autorização e conferência futura dos bytes staged. Nenhum stage/commit foi executado.

Os originais `provider-tests-direct.log` (4 linhas com espaços finais) e `provider-tests-final.log` (2) ficam locais e fora da seleção. As cópias `provider-tests-direct.log.gz` e `provider-tests-final.log.gz` preservam seus bytes integralmente, inclusive espaços finais, com gzip mtime=0. Não houve sanitização, truncamento ou normalização desses logs. Hashes do original e da cópia estão em results.json → packaging.losslessLogs. A descompressão foi comparada byte a byte, sem reexecutar testes.

O manifesto source-hashes.json contém os bytes atuais dos 70 outros caminhos da entrega; exclui somente a si próprio. A fotografia anterior de 62 hashes foi preservada em previousSnapshot, incluindo os dois originais locais. Essa seção é histórica, não uma lista para stage. As referências a esses originais representam proveniência; as cópias gzip são seus correspondentes entregáveis.

O manifesto do diagnóstico real anterior permanece intacto. Oito fontes agora corrigidas coincidem com o HEAD daquela execução; o hash histórico do Evidence Index coincide com o índice antes da nova linha da correção. Essas nove diferenças são esperadas e não devem ser atualizadas no pacote histórico. Os seis artefatos que ele lista continuam com os hashes originais; seu próprio manifesto também integra a seleção atual.

A verificação de publicação consultou os arquivos textuais selecionados e o conteúdo descomprimido dos dois logs. Não encontrou padrões de chaves de API, tokens Bearer/GitHub, AWS access key ou chave privada. A leitura dos registros confirmou fixture sintética e ausência de valores de credenciais. Permanecem caminhos locais, referências a arquivo de configuração sem seu conteúdo e identificadores públicos de deploy/correlação. Não é auditoria exaustiva de segredos. O runner real é evidência histórica e não foi executado nesta preparação. A sanitização original pelo runner e a minimização da fixture estão descritas acima e no pacote de diagnóstico; nenhuma sanitização nova foi aplicada.

Somente plano, README, consolidação e manifesto de entrega foram ajustados nesta preparação, além das duas cópias gzip. Fontes e testes mantêm os hashes já validados. Nenhum resultado de teste/build foi invalidado. O gate global de referências registrado precede esta preparação; a integridade das referências da seleção foi conferida por leitura, sem repetir o gate ou certificar bytes staged ainda inexistentes.
