# Diagnóstico real do provider no intake IMOB — 2026-11-16

Status: **PARCIAL**. Executor: Codex, sem subagentes. Branch local `feat/imob-guided-property-draft`, HEAD `70e66db4e7eea727f0f3567d8291595b1f86243b`. Stage vazio. Instruções preexistentes e originais da tarefa anterior preservados. Este pacote não altera código de produção, UX, modelos, configuração global, oferta de avaliação ou ratificação P1.

## Conclusões comprovadas e fronteira da prova

1. **Há divergência entre web e API publicados.** O Render informa web live no merge da conversa guiada, mas API live num commit anterior à existência do intake `property_draft`. O bundle público foi lido e aponta para essa API antiga. O health responde staging, sem SHA. Isso prova incompatibilidade das versões informadas pelo controle de deploy; não é uma captura da requisição específica do usuário.
2. **A chamada real local ao OpenAI pelo intake/engine/runtime central recebeu erro de quota.** O objeto recebido contém `error.type=insufficient_quota`, `error.code=credit_balance_exhausted`, sem texto gerado. A conta/configuração local não é demonstrada como sendo a de staging.
3. **O adaptador OpenAI transforma esse erro em texto vazio e o runtime registra sucesso.** `OpenAIProvider.ts:30–50` lê o JSON, não verifica `response.ok` nem `json.error`, usa `choices?.[0]?.message?.content ?? ""` e um ID literal de fallback. `runCompletion` recebe a promise resolvida e emite `llm.completion.success`. O intake executa `JSON.parse("")` e devolve `outcome=invalid`, etapa **json_parse**. Não alcança o schema do modelo nem a validação de domínio. O engine local devolve o erro, sem proposta e com patch vazio.

**A causa exata da tentativa relatada em staging ainda não foi comprovada:** faltam a requisição/resposta HTTP autenticada e sua correlação com o runtime efetivo. Não se conclui que staging esteja sem créditos. São fatos distintos: divergência de deploy em staging e erro de quota/tratamento reproduzido localmente.

## Staging observado, sem reenviar a mensagem

| Superfície | Deploy live / SHA informado pelo Render |
| --- | --- |
| Web `eiah-web-staging` | `dep-dbtdtq7f3r2c73b08ol0` / `9821e4355d3d71268a1179477a9e98b3f18345d9`, live desde 2026-11-16T10:46:29Z. |
| API `eiah-api-staging` | `dep-dbqpojijnfac739dijt0` / `ba79d7063c929592209320e04c26903bed255ce7`, live desde 2026-11-12T11:03:19Z. |

O workspace Render foi confirmado pelo usuário antes das leituras. Somente serviços, deploys e logs foram consultados. O bundle `/assets/index-5XaTZwbE.js` contém a conversa guiada e `VITE_API_URL=https://eiah-api-staging.onrender.com/api`. SHA-256 do bundle: `35ada8f63c3b354c76001a4a862bb8f5e5276544e000c7039741fc817fbf7454`. HTML e health retornaram HTTP 200; health identifica `staging`, versão `0.0.0-dev`, sem commit.

Inspeção dos fontes versionados em `ba79d706…` confirma ausência de `property_draft` e `resolveImobPropertyCaptureTurn` na rota e no engine. O cliente novo valida `response.data.propertyCapture`; sua ausência pode produzir a mesma mensagem “Recebi uma interpretação inválida”. Não foi enviada a fixture à API antiga: o ramo consultivo não existe nesse código e a requisição poderia seguir o fluxo operacional comum. Não se usou parâmetro público para escolher provider, credencial fictícia ou bypass de sessão/entitlement.

Consultas independentes de logs por `imob.property_capture.intake`, `llm.completion` e request path `/api/imob/chat/resolve-turn` não retornaram registros na janela 2026-11-16T00:00:00Z–2026-11-17T00:00:00Z. Isso **não prova ausência de requisições** nem recupera a resposta original. `staging-snapshot.json` registra fontes, filtros e limites. A falha de leitura do health do host de fallback `dev.api.eiah.ai` não diz respeito ao destino configurado no bundle publicado.

## Caminho real inspecionado

| Etapa | Implementação e configuração |
| --- | --- |
| Navegador | `useImobFrontDoorForms.ts` → `apiResolveImobTurn` → POST `${VITE_API_URL}/imob/chat/resolve-turn`, com `intake=property_draft`, mensagem, draft, histórico, origem e proposta pendente. Timeout cliente 30 s. |
| Rota atual | `apps/api/src/routes/imob.ts:1701`: gates de tenant/revogação/instalação/membership/workspace, `imob.chat.use`, `REAL_ESTATE_CORE` e schema de transporte antes do ramo consultivo. |
| Perfil e seleção | `getAgentProfile(tenant,workspace,"EIAH",prisma)` consulta disponibilidade e perfil persistido; usa perfil canônico como fallback quando aplicável. A rota não expõe seleção pública de provider/modelo. O perfil real do workspace de staging não foi acessado. |
| Engine/intake | `resolveImobPropertyCaptureTurn` → `interpretImobPropertyCapture`, antes de casos, recipes, dispatch e persistência. Timeout intake 20 s. |
| Runtime central | `executeLlmStep` aplica knowledge policy e masking obrigatório; registra providers apenas quando as respectivas variáveis de chave existem; chama `runCompletion`. |
| Roteamento | `LLMRouter` escolhe metadata interna `provider`, prefixo do modelo ou OpenAI por padrão. Esta rota fornece o modelo do perfil, sem override HTTP. Não chama `executeCapability` nem seu mecanismo de fallback. |
| Repetição | `runCompletion` usa `retry` e `withTimeout`. A configuração local efetiva foi 45 s por tentativa, máximo de 5 invocações, atraso base 150 ms e máximo 10 s. Os logs efetivos mostram backoffFactor=1 e jitterRatio=0; os valores textuais de origem eram 1.6 e 0.3, lidos por `parseInt`. |
| Pedido de saída | Prompt IMOB pede objeto JSON com intent/confidence/changes/proposalRef/question/topics/unsupported. OpenAI recebe mensagens system/user, `max_tokens=1000` e temperatura padrão do adaptador 0.7. Não há response_format/schema JSON no corpo HTTP desse adaptador. |
| Extração e validação | OpenAI extrai `choices[0].message.content`; a rota passa apenas outputText. Intake remove cercas Markdown externas, faz JSON.parse, schema estrito, catálogo/valores e evidência literal; resultado de transporte é novamente validado no adaptador web antes de apresentar proposta. |

`withTimeout` e o timeout do intake fazem race de promises, sem abortar a chamada nativa. Não ocorreu timeout nesta tentativa; esse comportamento é registrado para dimensionar os limites, sem alteração nesta etapa.

## Execução integrada controlada, com provider real

O ambiente local não tinha variáveis de provider no processo e o Docker daemon permaneceu inacessível também fora do sandbox. A configuração já existente do checkout principal contém chave OpenAI não vazia e sem aparência de placeholder; Anthropic e Gemini estão ausentes. Nenhum valor secreto foi impresso ou copiado para o pacote. Não se configurou serviço novo.

Foi executado **um único pedido lógico**, com o perfil canônico EIAH existente (`gpt-4.1`, grounded_reasoning, provenance recommended), usando masking required como na rota. A fixture contém apartamento para locação em Balneário Camboriú, quartos/vagas vazios, nenhuma proposta pendente e a mensagem “São dois quartos e uma vaga. Pode me orientar no restante?”. Sua finalidade é reprodução, não gramática de produção.

O runner invoca os fontes reais `resolveImobPropertyCaptureTurn → interpretImobPropertyCapture → executeLlmStep → runCompletion → OpenAIProvider`. Não usa SDK diretamente, não substitui o provider por dublê e não aplica respostas fixas. O escopo/origem são sintéticos e existem só para correlação do rascunho em memória. A policy canônica passa pelo executor real; **não demonstra a resolução do perfil do workspace, autenticação HTTP, entitlement, billing gate, navegador nem staging**. Não é apresentado como teste completo do chat implantado.

Comando executado uma vez, fora do sandbox para permitir rede autorizada:

```bash
TSX_TSCONFIG_PATH=tsconfig.base.json node --import tsx ops/evidence/latest/imob-property-provider-diagnostic-2026-11-16/run-integrated.mjs > ops/evidence/latest/imob-property-provider-diagnostic-2026-11-16/openai-runtime.log 2>&1
```

| Provider | Configuração acessível | Chamada comprovada | Retorno | Parsing/schema | Intake → proposta |
| --- | --- | --- | --- | --- | --- |
| OpenAI | Chave local existente; modelo solicitado `gpt-4.1` do perfil canônico | Uma solicitação lógica, com resposta de erro recebida pelo adaptador real | `insufficient_quota` / `credit_balance_exhausted`; não houve saída de modelo | Extração vira string vazia; rejeição em **json_parse**; schema/domínio não alcançados | `invalid`, proposta null, patch vazio; fixture inalterada |
| Anthropic/Claude | Não configurado nos ambientes locais inspecionados; configuração de staging desconhecida | Não enviada | Não disponível | Não executado | BLOQUEADO por configuração |
| Google/Gemini | Não configurado nos ambientes locais inspecionados; configuração de staging desconhecida | Não enviada | Não disponível | Não executado | BLOQUEADO por configuração |

### Metadados reais e limitações da instrumentação

- Correlação local fornecida ao runtime: `imob-provider-diag-86f766e2-f44f-4869-8cb6-cef593e2b77b`. É trace do diagnóstico, **não ID HTTP da aplicação implantada**.
- Início do runner: 2026-11-16T11:06:04.968Z. Término do intake: 11:06:06.420Z. Executor: 981 ms; completion log: 979 ms.
- Provider adaptador: OpenAI. Modelo **solicitado**: gpt-4.1. Modelo efetivamente gerador não identificado: houve rejeição antes de geração. O campo model do runtime apenas repete a solicitação.
- Uso de tokens e custo: não informados (`null`), sem estimativa inventada. Finish reason real ausente; defaults internos não provam término de geração.
- `requestId="openai"` e `traceId="openai"` no resultado do executor são **fallbacks literais do adaptador**, não IDs de requisição fornecidos pelo provider.
- O probe HTTPS do runner não registrou status HTTP nem request-id de header. `node-fetch` 3.3.2 chama `send(parsedURL.toString(), options)` (src/index.js:94); o probe só reconhecia hostname no primeiro argumento como objeto/URL. Portanto `httpAttempts:[]` no registro original significa **transporte não medido**, e não “zero chamadas”. O registro e o runner executados foram preservados sem reescrita.
- Não houve retry do executor: o objeto de erro foi retornado como sucesso na primeira invocação resolvida e `retry()` encerra nesse ponto. Há um único par start/success. Essa contagem de invocação é inferida do fluxo e do resultado, **não medição independente de todos os requests físicos**. Não houve fallback para outro provider. Não se repetiu a chamada para corrigir a instrumentação.

## Correção mínima proposta, não implementada

1. Alinhar API e web à mesma release aprovada, em etapa de deploy explicitamente autorizada, antes de testar HTTP autenticado. Nenhum deploy é feito aqui.
2. No adaptador OpenAI, verificar HTTP não exitoso ou `json.error` antes de extrair choices. Propagar erro tipado com categoria de quota/autorização, status e request-id quando disponível, sem credenciais nem erro bruto sensível. Assim o intake recebe falha de provider, em vez de string vazia supostamente bem-sucedida.
3. Tratar quota/autorização permanentes como não repetíveis pelo mecanismo central, preservando policy e limites. Não trocar provider/modelo ou tentar contornar saldo. Um futuro diagnóstico isolado pode corrigir o observador para aceitar URL string, mantendo o limite autorizado; nenhum endpoint público de seleção deve ser criado.

Não há evidência nesta tentativa para flexibilizar o schema de interpretação, alterar UX ou criar regex/frases obrigatórias. A obtenção de 2 quartos/1 vaga como proposta válida e a entrega ao engine web permanecem não demonstradas com provider real nesta execução.

## Resultados e artefatos

| Verificação | Resultado | Exit / contagem |
| --- | --- | --- |
| Caminho integrado local OpenAI | **REPROVADO** para a proposta funcional esperada | Exit 2; 1 pedido lógico, 0 propostas, patch vazio |
| Anthropic/Claude | **BLOQUEADO** | 0 pedidos; configuração local ausente |
| Google/Gemini | **BLOQUEADO** | 0 pedidos; configuração local ausente |
| Deploy/bundle/health de staging | **APROVADO** como diagnóstico de leitura | Divergência de SHAs e API base confirmadas; nenhum POST |
| HTTP autenticado/browser de staging | **NÃO EXECUTADO** | Sem sessão disponível, API sem ramo consultivo; logs da tentativa não recuperados |
| Suítes/builds anteriores | **NÃO EXECUTADO novamente** | Nenhuma repetição ou dublê substituindo a chamada real |

- `openai-integrated.json`: registro original sanitizado pelo runner, incluindo erro real, retorno do executor/intake e limitação do probe.
- `openai-runtime.log`: log original da execução única, preservado.
- `diagnostic-summary.json`: interpretação explícita dos resultados e lacunas, separada do registro original.
- `staging-snapshot.json`: deploys live, bundle público e consultas filtradas de logs, sem identidade de usuário, e-mails ou autenticação.
- `run-integrated.mjs`: runner local executado; contém apenas referência ao arquivo de configuração já existente, sem seus valores. Preservado para reprodução, sem nova chamada.
- `source-hashes.json`: hashes dos artefatos e fontes relevantes, sem hashes de credenciais.

Todos os artefatos deste diretório foram criados por esta execução para rastreabilidade e ficam preservados localmente. A serialização do runner remove chaves/Bearer e caminhos locais de retornos; o erro real registrado não contém dados de usuário. Metadados pessoais retornados pela descoberta de workspace não foram incorporados às evidências. Nenhum arquivo anterior foi apagado ou normalizado. Stage/commit/push/PR/merge/deploy não foram executados. Não houve gravação de imóvel, pagamento, ativação, concessão ou compra de créditos.
