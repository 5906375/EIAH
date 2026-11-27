# Instrumentação local mínima — provider_unavailable no intake IMOB

2026-11-16; status **PARCIAL**; agente Codex, sem subagentes. Base local `a047a1b20a6dd0558fbe3a374b49e7aa4480a475`, branch `fix/llm-provider-failure-propagation`. Autorização: instrumentação local e testes afetados com dublês/transporte sintético, sem rede externa/providers reais, mudanças financeiras, stage ou publicação.

## Incidente preservado

A consulta anterior identificou web/API live em `64fe82daca311d171532c9f65511d8cab30df3ad`, bundle apontando para a API staging, HTTP da aplicação 200 e intake provider_unavailable/unavailable às 14h22min03s de São Paulo. Correlação HTTP `99c62fed-6785-40f0-a8fb-ea4bf94e5f3b`. A associação com a mensagem é temporal; o intake histórico não carregava essa correlação nem o erro original. Essa consulta é contexto fornecido/reaproveitado, **não nova coleta ou prova causal desta execução**. A instrumentação não recupera o erro perdido e não comprova quota, autenticação ou outra causa naquela tentativa. Vínculo à organização/projeto abastecido continua administrativo e separado, sem leitura de segredos.

## Delta e fronteiras

- `apps/api/src/routes/imob.ts`: callback property_draft reutiliza o header de resposta estabelecido pelo middleware HTTP; transmite traceId ao engine e ao executor, sem UUID substituto. Logger existente acompanha resolução do perfil e falha controlada antes do executor.
- `ImobPropertyCaptureDeps` / `interpretImobPropertyCapture`: correlação interna opcional nos diagnósticos, classificação interna segura do erro genérico e mesmos resultados públicos. `resolveImobPropertyCaptureTurn` já encaminha deps integralmente; não precisou de patch. Validação determinística continua emitindo json_parse/model_schema/field_validation/evidence_mismatch ou accepted, com correlação quando disponível. Não se registram draft, prompt, resposta bruta ou proposta.
- `executeLlmStep`: entrada com etapa policy_check, provider_registration e falhas pré-completion classificadas pela etapa. prompt_preparation identifica erro de preparação quando ocorrer; o avanço para completion identifica a passagem dessa etapa. Preserva correlação durante masking. Completion possui seu próprio desfecho, evitando duplicar sua falha no executor.
- `runCompletion`: resolução de provider passa a estar dentro do bloco de diagnóstico, sem mudar a seleção ou a exceção relançada. Registra resolução, despacho com índice de tentativa e um desfecho final. Erros genéricos não são serializados; recebe-se somente categoria interna e código fixado pela etapa. Retry/timeout e elegibilidade existentes continuam iguais.
- `OpenAIProvider.chatCompletion`: eventos transport_attempt, response_received e, quando falhar, transport_failure/response_parsing/response_validation. O primeiro ocorre imediatamente antes da invocação do transporte, após construir o body; o recebimento exige retorno do transporte. Duração, status do provider e header real x-request-id somente quando disponíveis. O observador não registra body/headers e suas falhas não alteram o adaptador. Essa instrumentação de transporte **não foi estendida a Anthropic/Gemini/DeepSeek**.
- `LLMProviderError.ts`: reutilização do contrato tipado existente, identificadores limitados e helper para erros genéricos controlado pela etapa; sem nova taxonomia de retry, timeout ou billing. Esses códigos internos de log não são novos reason codes públicos.

As transições adicionais de executor/transporte são delimitadas por metadata.source=imob-property-capture-intake. A remoção do erro bruto no log de completion e a captura da falha de resolução protegem seu ponto compartilhado. Falhas conhecidas de provider mantêm categorias/elegibilidade anteriores. Não se fabricam modelo efetivo, request ID, tokens ou custo. provider/model nos eventos anteriores à resposta indicam seleção/solicitação, não geração comprovada. modelUsed só é acrescentado ao sucesso quando retornado pelo contrato de resposta.

## Resultados reais e reaproveitamento

Comandos/horários/exits: [executions.json](executions.json). Ambiente de teste TSX_TSCONFIG_PATH=tsconfig.base.json, fontes TS canônicas. As suítes de provider/runtime bloqueiam https.request e removem as variáveis de credenciais do ambiente do próprio processo de teste; usam transporte injetado ou o contrato público pelo registry. Não consultam valores de segredos nem configuram serviços. O teste de rota extrai o callback real e injeta dependências, sem servidor HTTP, banco ou escrita de domínio.

| Verificação | Resultado | Exit | Exec./aprov./reprov./ignor. | Evidência |
| --- | --- | --- | --- | --- |
| Primeira execução agregada afetada | APROVADO | 0 | 3/3/0/0 **entradas de arquivo**, sem contagem individual | [affected-tests-first.log](published/affected-tests-first.log) |
| Providers após última edição | APROVADO | 0 | 5/5/0/0 casos | [providers-final.log](published/providers-final.log) |
| Runtime/consumidores após última edição | APROVADO | 0 | 8/8/0/0 casos | [runtime-final.log](published/runtime-final.log) |
| Intake/rota após última edição | APROVADO | 0 | 16/16/0/0 casos | [intake-final.log](published/intake-final.log) |
| ProviderBoundary no sandbox | BLOQUEADO | 1 | Teste não chegou a executar; listen EPERM no pipe tsx | [provider-boundary-sandbox.json](provider-boundary-sandbox.json) |
| ProviderBoundary oficial fora do sandbox autorizado | APROVADO | 0 | 1/1/0/0 caso | [provider-boundary.log](published/provider-boundary.log) |

A edição posterior à primeira execução agregada eliminou a duplicação de falha de completion no executor, posicionou a marca de transporte depois da construção do body e melhorou a conferência da correlação no harness, acrescentando parsing/schema correlacionados. Isso justificou as três execuções finais; o agregado anterior é histórico, não aprovação posterior dessa edição. Não somar seus arquivos aos 29 casos finais.

Cobertura inclui falha pré-executor com segredo sintético em mensagem/propriedades arbitrárias, política, provider não registrado, retry genérico existente, quota sem repetição, recuperação transitória, ausência de sucesso para recusa, IDs presentes/ausentes, referência de idempotência, ausência de replay/fallback após geração concluída, transporte recusado versus resposta HTTP recebida, parsing/schema inválidos, sucesso até proposta, preservação de draft/proposta e ausência de executionRequest. Os testes da API usam exclusivamente a fronteira/registry autorizados; o gate não foi alterado.

Na execução inicial não houve arquivos de teste novos: os novos casos pertencem a arquivos já registrados no script bloqueante test:llm-provider-failure e em test:ci-unit-suite (job CiUnitSuite). Package scripts, workflow e manifesto permanecem intactos; resultados anteriores de registro continuam válidos para os mesmos caminhos. A primeira conferência auxiliar de evidências terminou exit 1 por procurar a chave inexistente test:unit (KeyError), sem executar ou reprovar testes; o registro em verification-first.json preserva essa falha. A conferência foi corrigida para o nome real existente, sem alterar scripts/CI. Gates de UI, builds, contratos públicos e suítes inalteradas não foram repetidos. Os builds antigos não certificam empacotamento das fontes agora alteradas; não foi executado novo build/typecheck naquela autorização focal inicial; a preparação posterior abaixo registra os resultados novos. O typecheck anterior reprovado continua histórico e não é substituído pelos testes atuais.

## Exemplo sanitizado

Formato coberto pelas asserções da falha de perfil; **não é log recuperado do incidente**:

```json
{"component":"imob-property-capture","traceId":"http-synthetic-correlation","stage":"profile_resolution","failure":{"category":"internal","code":"profile_resolution_failed"}}
```

O diagnóstico final correlacionado do intake conserva provider_unavailable/unavailable. HTTP da aplicação continua 200; eventual failure.httpStatus ou providerHttpStatus identifica HTTP do provider, sem converter um no outro. Campo ausente não recebe status, modelo, duração financeira ou ID fictícios.

## Proveniência e artefatos

Os logs originais dos testes são stdout/stderr UTF-8 capturados diretamente, sem normalização posterior. O original de provider-boundary.log concatena os dois fragmentos retornados pela ferramenta. Todos os 14 originais .log deste diretório ficam **locais, excluídos da entrega**; as cópias publicáveis estão em published/. results.json → publication.logs registra SHA-256 antes/depois e a contagem exata de cada tratamento: caminho literal do repositório substituído por <REPO> e payloads inline de código do checker em data-URL omitidos. Não se omitiram respostas de provider, erros necessários ao diagnóstico, ANSI ou quebras de linha; arquivos sem ocorrência são cópias idênticas. Não são apresentados como logs originais.

Os campos log dos registros de execução e evidenceSha256 de results.json continuam sendo proveniência histórica local; para publicação, resolvê-los pela tabela publication.logs. provider-boundary-sandbox.json e verification-first.json são resumos identificados como tais, não stderr original. O manifesto de fontes source-hashes.json descreve a fase inicial; seus nove fontes/testes continuam idênticos. O hash documental anterior é histórico. preparation-manifest.json ancora a seleção atual inteira, exceto ele próprio, com referências ao HEAD para scripts reutilizados. Nenhum original anterior foi apagado ou reescrito. Não há temporário próprio pendente de limpeza; caches automáticos e dist gerados pelos builds ficam excluídos, sem limpeza genérica.

## Procedimento futuro proposto — não autorizado/executado aqui

1. Autorizar separadamente publicação/deploy da instrumentação e conferir SHAs de web/API e API do bundle.
2. **Antes de qualquer chamada real**, obter autorização com finalidade, ambiente, provider/modelo efetivo permitido, uma solicitação lógica planejada, limites reais de retries/fallback e estimativa/teto de custo quando disponível. Uma solicitação lógica pode gerar várias tentativas; não prometer uma única chamada física. Não introduzir fallback nem mudar limites para o diagnóstico.
3. Usar somente cadastro e contexto sintéticos; capturar x-trace-id da resposta HTTP sem copiar autenticação, mensagem, rascunho ou resposta bruta para logs. Não confirmar/gravar imóvel.
4. Consultar os eventos pela mesma correlação: perfil → executor/policy/registry → resolução → despacho → transporte → resposta/parsing/validação → completion → conclusão do intake. Contar transport_attempt por attempt e comparar request IDs reais quando fornecidos. Despacho ao registry não prova rede. A resposta recebida não prova interpretação aceita. Timeout do intake não cancela fisicamente a chamada; eventos posteriores precisam permanecer na análise.
5. Parar após a solicitação autorizada e relatar a etapa/categoria comprovada ou a lacuna restante. O vínculo financeiro da credencial exige prova administrativa separada, sem inferência a partir de nome de variável ou erro de quota.

Sem provider real pós-patch, navegador, HTTP com banco, CI remoto ou deploy nesta etapa. Causa específica de staging continua não comprovada. Oferta de avaliação, P1 e regras financeiras preservadas. O restante do contrato transversal permanece PROPOSTA.


## Preparação posterior — resultados recuperados, sem repetir verificações válidas

A autorização posterior limitou a retomada a tipagem/empacotamento afetados e plano. Não mudou fonte de produção nem teste depois das aprovações 5/5, 8/8, 16/16 e 1/1. Os três wrappers/relatórios reaproveitam os verificadores históricos versionados, sem reescrever os originais; não integram o runtime ou o CI da aplicação.

| Verificação | Resultado | Exit | Alcance e evidência publicável |
| --- | --- | --- | --- |
| Typecheck inicial no sandbox | BLOQUEADO | 1 | spawnSync git EPERM antes da comparação/compilação; published/preparation-typecheck.log |
| Typecheck focal fora do sandbox autorizado | REPROVADO | 1 | 17 raízes (16 anteriores + teste proprietário providers), baseline virtual fresca de a047a1b; 2 diagnósticos antigos focais +16 de dependências, zero introduzido; preparation-typecheck.json e published/preparation-typecheck-outside.log |
| Build oficial core | APROVADO | 0 | Recuperado de processo concluído; published/core-build.log |
| Build oficial providers | APROVADO | 0 | Recuperado de processo concluído; published/providers-build.log |
| Smoke de módulos dist — primeira tentativa | REPROVADO | 1 | Erro do verificador ao importar caminho absoluto de node-fetch a partir de data-URL; adaptação somente do verificador para pathToFileURL; published/packaging-smoke.log |
| Smoke de módulos dist — final | APROVADO | 0 | Exports novos, declarações, identidade entre bundles e transporte OpenAI sintético com etapas correlacionadas; published/packaging-smoke-final.log |
| Build oficial API | REPROVADO | 2 | Processo terminou na tipagem, com 24 diagnósticos; tsup não executou. Primeiro: TS2305, imobPropertyCaptureRequestSchema ausente no contrato compilado local; published/api-build.log |

Os dois diagnósticos focais TS2551 são os acessos antigos a blockers em createImobStructuredForms.test.ts (linhas 986 e 1305), presentes também na baseline virtual. Os 16 de dependências ficam íntegros. A comparação focal não certifica tipagem integral nem classifica automaticamente os 24 erros do build da API. Estático: packages/contracts/src/index.ts exporta imobPropertyCapture; o dist/index.d.ts local consultado não exporta. O build API usa dist e parou nessa dependência compilada. Não se executou baseline do build completo, não se reconstruíram contratos e não se repetiu o build API. **Bloqueio de publicação:** preparar a dependência compilada existente e conferir o build API em etapa autorizada; não corrigir fontes antigas ou gates para esconder o problema.

Registros: preparation-executions.json, packaging-executions.json e preparation-typecheck.json. O checker focal reutiliza ../typecheck-deltas.mjs com saída neste pacote, 17ª raiz e resolução de módulo em memória; o smoke reutiliza ../package-smoke.mjs com caminho atual da fixture e os novos símbolos/etapas. O smoke não equivale a iniciar a API empacotada.

A [comparação operacional](operational-comparison.json) preserva as consultas Render já concluídas, sem novas consultas após as retomadas: API live em 64fe82d, consumidor runs desabilitado e nenhum worker separado visível no workspace acessível. Intake usa EIAH; runs usam agente da execução e política de capacidade, embora executor/registry/router/adaptador sejam compartilhados. Variáveis de provider não verificadas. Não alteramos topologia e não inferimos causa da indisponibilidade.

### Entrega e menor sequência posterior

O [plano existente reutilizado](../../imob-property-capture-context-2026-11-14/stage-commit-plan.md) contém 40 caminhos: 26 normais e 14 cópias de logs ignoradas, todos explícitos; originais e CLAUDE.md/CODEX.md excluídos. O conjunto é coerente para um único commit, e o bloqueio local de empacotamento API foi posteriormente removido pelo build autorizado descrito abaixo. Stage, commit e publicação continuam sem execução/autorização nesta etapa.

1. Autorizar e concluir somente a preparação da dependência compilada de contratos e o build API necessário; preservar os resultados atuais.
2. Depois de autorização específica para Git/publicação e gates, publicar o conjunto e entregar o artefato à eiah-api-staging. Web não mudou; nenhum worker de runs separado foi identificado para receber deploy. Não habilitar consumidor como tentativa de correção.
3. Conferir o SHA implantado/API do bundle. Antes de chamada real, obter autorização específica de finalidade, ambiente, provider/modelo, uma solicitação lógica, retries/fallback e custo/teto disponível. Só então executar a fixture sintética, correlacionar HTTP → perfil/policy → resolução/despacho → transporte/resposta → validação/intake, e não salvar imóvel. Timeout não cancela fisicamente o transporte.

Status continua PARCIAL. Causa histórica e vínculo financeiro não comprovados; nenhum reteste real ou alteração financeira/configuração. Outros contratos transversais continuam PROPOSTA; P1 e oferta de avaliação preservados.

A conferência auxiliar final inicialmente sinalizou as três fixtures deliberadas Bearer synthetic-private dos testes de sigilo (exit 1 da conferência, não dos testes). Foram reconhecidas por igualdade exata como dados sintéticos já revisados; nenhum arquivo-fonte, gate ou padrão genérico foi enfraquecido. O resultado distingue essas três ocorrências de credenciais reais e permanece limitado ao conjunto selecionado.


## Dependência compilada e API — autorização posterior concluída

Somente a sequência autorizada foi executada: `pnpm --filter @eiah/contracts build` → conferência estática dos exports/declarations gerados → `pnpm --filter @eiah/api build`. Ambos terminaram com exit **0**; o segundo incluiu tipagem oficial e empacotamento tsup. Não restaram diagnósticos nesse build. Registros em packaging-executions.json, [dependency-preparation.json](dependency-preparation.json), [contracts-build.log publicável](published/contracts-build.log) e [api-build-after-contracts.log publicável](published/api-build-after-contracts.log).

O script oficial contracts executa tsc -p tsconfig.json. Seus outputs em packages/contracts/dist são ignorados por dist/ do .gitignore e ficam fora da entrega. O barrel/declarations gerados agora contêm schema, política, campos e tipos IMOB requeridos. Nenhuma fonte, export ou configuração foi alterada para isso. O hash do diff rastreado antes/depois dos dois builds coincidiu, conforme dependency-preparation.json. Esses processos já concluídos foram apenas recuperados nas retomadas, sem repetição.

A falha API anterior (exit 2, 24 diagnósticos) e todos os logs originais continuam preservados como históricos. O bloqueio de dependência local foi removido; isso não reclassifica automaticamente cada diagnóstico anterior nem prova a causa de staging. O typecheck focal anterior permanece **REPROVADO** (2 antigos focais +16 dependências, nenhum introduzido no recorte comparado), sem nova execução e sem ser substituído pelo build oficial da API, que exclui testes.

Seleção atual: **40 caminhos — 26 normais e 14 cópias publicáveis de logs ignorados**. Originais locais excluídos; hashes/tratamento seguem publication.logs e preparation-manifest.json. Nenhum build core/providers, smoke, teste ou consulta Render foi repetido. Preparação local para stage/commit pronta para revisão e autorização; publicação, CI remoto, reteste real, HTTP/banco e navegador continuam separados/não validados. Sem stage, commit, push, deploy, migrations, infraestrutura ou provider real.
