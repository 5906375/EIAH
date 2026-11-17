# Correção local do compartilhamento do registry — 2026-11-17

**EVIDENCIADO somente no alcance local demonstrado.** A configuração autorizada
`packages/core/tsup.config.ts:28` foi alterada de `splitting: false` para
`splitting: true`. Nenhuma outra fonte/configuração da aplicação mudou.
O fluxo real de 2 quartos/1 vaga continua **PARCIAL, NÃO APROVADO**.
Codex, sem subagentes. Sem stage, commit, push, PR, merge ou deploy.

## Resultado do incremento autorizado

O corpo emitido de `ensureProvidersRegistered` registra `openai` pelo import de
`@eiah/core/llm/LLMRegistry`. O mesmo executor compilado chama o `runCompletion`
real de outra entrada; o completion invoca exatamente uma vez o provider dublê.
O `this` do dublê é o mesmo objeto lido no registry direto e retornado pelo router.
O diagnóstico agora mostra `adapter_dispatch`, `attempt=1` e `completion.success`;
zero `completion.error`, zero tentativas de rede e zero chamadas reais.
Não se registram conteúdo do prompt, output bruto ou credenciais.

Os grafos transitivos das entradas registry/router/completion contêm uma única
alocação, em `packages/core/dist/chunk-ZNSZSEHU.js`. As quatro entradas consultadas
(incluindo helpers de diagnóstico) alcançam 14 módulos distintos, sendo 10 chunks,
com 24 arestas de importação relativa. Todos existem. Imports ESM reais a partir
do resolver da API carregaram as dependências, sem aliases TS.
Sete correspondências de sourcemap confirmam as fontes relevantes no novo grafo.

| Validação | Resultado | Exit | Executados/aprovados/reprovados/ignorados | Alcance |
| --- | --- | --- | --- | --- |
| Build oficial core | APROVADO | 0 | — | clean oficial, declarações e tsup ESM com splitting |
| Build oficial API | APROVADO | 0 | — | typecheck oficial e tsup; nenhum outro pacote precisou de build |
| Harness compilado existente adaptado | APROVADO | 0 | 5/5/0/0 probes | Registro, identidade pelo router, chamada pelo completion, único registry e chunks/receita |
| Gate oficial Evidence Index | APROVADO | 0 | 8/8/0/0 | 975 referências; fora do sandbox autorizado porque o gate executa subprocesso git |
| Provider real, API completa, HTTP/DB e navegador | NÃO EXECUTADO | — | — | Fora desta autorização; não aprova o fluxo real |

Builds executados, nesta ordem, da raiz, sem variáveis de credenciais no processo:

```bash
env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u GEMINI_API_KEY -u DEEPSEEK_API_KEY pnpm --filter @eiah/core build
env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u GEMINI_API_KEY -u DEEPSEEK_API_KEY pnpm --filter @eiah/api build
```

O comando ESM do harness é o mesmo documentado no histórico abaixo, executado de
`apps/api`; agora salva `correction-results.json`, sem sobrescrever `results.json`.
Os ajustes indispensáveis em `check.mjs` seguem os imports até os chunks para
validar sourcemaps/alocações e exigem a identidade/invocação que antes falhavam.
Não se criou outro harness, runtime ou registry. O corpo extraído do executor
permanece sem alterações; construtores, logger do executor e ambiente são dublês.
A API completa, masking e o intake/domínio não são exercitados.

## Entrega dos chunks e limites

`apps/api/Dockerfile.prod:23` executa o build recursivo oficial de API/dependências
no builder. O `COPY --from=builder /app/packages ./packages` (linha 37) leva a
árvore completa de pacotes ao runtime, incluindo todos os chunks gerados do core.
API dist e os node_modules também são copiados. A `.dockerignore` exclui dist do
contexto de entrada; isso não exclui o dist gerado dentro do builder do COPY entre
estágios. A resolução nativa local confirma os imports da API para o dist do core.

O job `publish_api_image` de `.github/workflows/release.yml` referencia esse
Dockerfile com contexto na raiz. A observação histórica já preservada em
`../operational-comparison.json` também identificava esse caminho no serviço Docker;
ela não foi recolhida novamente. `.github/workflows/deploy.yml` declara seu rollout
como scaffold `DEPLOY_NOT_IMPLEMENTED`; não é prova de entrega operacional.

Verificou-se localmente o grafo consumido pela API e a receita que inclui seus
chunks. **Não houve build de imagem Docker, ensaio em rootfs de container, CI remoto,
consulta nova a staging nem inspeção do artefato implantado.** Não se afirma que o
ambiente remoto contém a correção ou que o Dockerfile passou ponta a ponta agora.

Impacto identificado: `splitting` vale para todas as entradas do core e passa a
compartilhar outros módulos também. A entrega deve manter o dist completo com os
chunks; copiar apenas entradas isoladas deixa de ser suficiente. A receita lida
já copia toda a árvore, sem exigir ampliação de delta. Outros consumidores do
core não foram homologados nesta etapa.

## Evidências, preservação e estado

- `correction-results.json`: 5 probes, caminhos/grafos/arestas, único chunk do
  registry, eventos sanitizados, sourcemaps e hashes de fontes/outputs/receita.
- `correction-executions.json`: comandos, horários de início e observação de término,
  exits, hashes anteriores das cinco evidências existentes e ciclo dos artefatos.
- `correction-core-build.txt` e `correction-api-build.txt`: stdout/stderr originais
  locais dos builds, sem transformação. Não são pacotes sanitizados de publicação.
- `results.json`, `verification.json` e `harness-initial.json` anteriores permanecem
  intactos. O conteúdo original deste README foi preservado integralmente abaixo
  como histórico. O reprodutor recebeu somente a adaptação necessária autorizada.
- `CLAUDE.md`, `CODEX.md` e `changes.diff` continuam com os hashes originais.
  Outputs ignorados dos builds ficam para reprodução local; nenhum temporário,
  backup, stash, worktree ou mecanismo duplicado de preservação foi criado.

Suítes anteriores não relacionadas foram reaproveitadas, sem repetição. O typecheck
focal anterior continua REPROVADO (2 diagnósticos focais antigos +16 de dependências);
o build oficial API aprovado exclui testes e não remove essa ressalva.
P1ReconciliationRecurring, finanças, filas, schemas, modelo, fallback e launcher
não foram alterados. A causa histórica anterior à instrumentação permanece desconhecida.

---

## Histórico integral — diagnóstico anterior à correção

# Identidade do registry entre entradas compiladas — 2026-11-17

Status do intake real: **PARCIAL**. Hipótese de duplicação: **CONFIRMADA LOCALMENTE**.
Agente: Codex, sem subagentes. Nenhuma correção de produção aplicada.

## Achado

Os outputs formais existentes duplicam a instância de `LLMRegistry` nas entradas
`packages/core/dist/llm/LLMRegistry.js`, `LLMRouter.js` e `completionEngine.js`.
Cada arquivo contém uma alocação independente `new LLMRegistry()` com seu próprio Map.
O bundle API importa `llmRegistry` e `runCompletion` de entradas externas distintas.
Registrar na primeira não disponibiliza o provider ao registry privado da segunda.

Com o corpo emitido de `executeLlmStep`/`ensureProvidersRegistered` e construtor
OpenAI dublê, o registro de `openai` ocorreu e foi conferido por identidade de objeto
na entrada direta. O `resolveProvider` da entrada formal do router não o encontrou.
A chamada do executor ao `runCompletion` formal também falhou antes de despacho:
`provider_resolution_failed`, categoria `internal`, `attempt=0`.
O erro interno comparado pelo harness foi exatamente `Provider not found: openai`;
não se serializou erro arbitrário. Modelo solicitado: `gpt-4.1`, sem override de provider.

Isso demonstra um defeito de empacotamento suficiente para produzir o padrão do
incidente instrumentado fornecido pelo usuário, correlação
`ae39fd91-2478-4fdd-9602-22b898288472` (16/11, 15h57min01s, São Paulo).
Esse evento de staging é contexto recebido, **não nova coleta**. O teste não lê o
artefato implantado nem prova sozinho sua identidade com o output local. A causa
da tentativa histórica anterior à instrumentação continua desconhecida.
Não há evidência nova de rejeição do modelo pela OpenAI nem de créditos de staging.

## Arquivos e símbolos

| Arquivo | Símbolo/configuração | Papel |
| --- | --- | --- |
| `packages/core/tsup.config.ts:28` | `splitting: false`, `bundle: true`, múltiplas entradas `src/llm/*.ts` | Repete dependências com estado em cada entrada |
| `packages/core/src/llm/LLMRegistry.ts:23` | `llmRegistry = new LLMRegistry()` | Instância pretendida como compartilhada |
| `packages/core/src/llm/LLMRouter.ts:21` | `resolveProvider` | Consulta o registro incorporado ao seu bundle |
| `packages/core/src/llm/completionEngine.ts:29` | `runCompletion` → `resolveProvider` | Consulta outro registro incorporado, antes de retries/despacho |
| `apps/api/src/orchestrator/llmExecutor.ts:176` | `ensureProvidersRegistered` | Registra pelo import direto de `LLMRegistry` |
| `apps/api/tsup.config.ts` | core externo; providers/MCP em `noExternal` | Preserva imports de core separados na API emitida |
| `apps/api/dist/index.js:35010` | imports `runCompletion` e `llmRegistry` | Resolução ESM efetivamente usada nesta verificação |
| `apps/api/dist/index.js:36538` | corpo emitido do executor | Exercitado por extração sem alteração dos bytes |

## Verificação e resultado real

Executado a partir de `apps/api`, Node v22.17.1, sem tsx/aliases para fontes:

```bash
node --input-type=module -e 'globalThis.resolveFromApi = specifier => import.meta.resolve(specifier); await import("../../ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/check.mjs")'
```

| Validação | Resultado | Exit | Executados/aprovados/reprovados/ignorados | Falha/pendência |
| --- | --- | --- | --- | --- |
| Primeira execução do harness | BLOQUEADO | 1 | 0/0/0/0 | `createRequire.resolve` não seleciona exports ESM `import`; corrigido somente o verificador |
| Identidade compartilhada nas entradas formais | REPROVADO | 1 | 3/1/2/0 verificações | Registro direto passa; router e executor→completion não encontram o mesmo provider |
| Conferência de fontes embutidas em sourcemaps | APROVADO | 1 agregado | 7/7 correspondências | Exit agregado permanece 1 pelo invariante quebrado; não há comando separado com exit 0 |
| Provider real, HTTP/DB, navegador e fluxo completo | NÃO EXECUTADO | — | — | Sem nova autorização para chamadas reais; fluxo continua sem aprovação |
| Gate oficial Evidence Index no sandbox | BLOQUEADO | 1 | Diagnóstico direto: 8/7/1/0 | `spawnSync git EPERM` no teste de referência a commit; checker ainda não executado |
| Gate oficial Evidence Index fora do sandbox autorizado | APROVADO | 0 | 8/8/0/0 | Checker aprovou 971 referências; outputs e exits em `verification.json` |

O exit 1 final representa a **quebra do invariante do produto**; o defeito foi
reproduzido. Não é aprovação de runtime/fluxo real. As três verificações são
probes/asserts do harness, não casos adicionados ao runner oficial de testes.
As sete conferências de sourcemap são pré-condições, não somadas aos três probes.
Asserções de segurança e captura dos diagnósticos também passaram dentro do mesmo
processo: zero invocações do adaptador dublê, zero tentativas bloqueadas de rede,
nenhum evento de despacho/sucesso, arquivos protegidos inalterados.

`results.json` contém horários, comando, caminhos ESM resolvidos, hashes dos outputs
e fontes, correspondências de sourcemap, eventos sanitizados e limites.
`harness-initial.json` é **resumo identificado**, não stderr original, da falha inicial
do verificador. `check.mjs` é o reprodutor diagnóstico, não gate oficial de CI.
`verification.json` preserva stdout/stderr e exits das três execuções documentais
(oficial bloqueada, diagnóstico direto e oficial autorizada). Somente o caminho
literal do repositório foi substituído por `<REPO>` nos outputs; sem omitir falhas.

### Cobertura efetiva e isolamento

- O registry, router, completion e helpers de diagnóstico são imports reais dos
  outputs formais pelo resolver ESM nativo da API. Não são mocks nem fontes TS.
- O trecho do executor é extraído do bundle API existente, sem mudanças no trecho,
  executado em VM com as mesmas dependências core. Construtores dos providers,
  logger do executor e ambiente de registro são dublês explícitos. Não se iniciou
  o processo completo da API. Masking não é exercitado por este diagnóstico.
- A VM fornece somente `OPENAI_API_KEY=synthetic-test-only`; nenhuma chave real é
  lida. O processo não carrega dotenv e remove suas variáveis de provider antes
  dos imports. HTTP/HTTPS, conexão TCP/TLS e fetch estão bloqueados durante o teste.
- Sourcemaps conferem o executor emitido e as sete cópias relevantes de fontes
  registry/router/completion contra os arquivos locais. Nenhum build foi necessário.
- HEAD local `97c23a9bca690f5cd6b0fdc909c7359ed4ea25d6`, branch
  `chore/imob-intake-provider-diagnostics`. Comparação read-only
  `git diff f6617e1f2ded9ac0d5c8b0c1336b450b3de6d999 HEAD --` nos sete arquivos de
  produção listados em `sourceFiles` do reprodutor: exit 0, diff vazio.
  Isso relaciona as fontes/configuração examinadas ao merge informado, sem
  certificar o build/ambiente remoto.

## Smoke anterior e validações reaproveitadas

`../packaging-preparation.mjs` reutiliza `../../package-smoke.mjs` e sua aprovação
em `../published/packaging-smoke-final.log` permanece válida no alcance original.
O smoke verifica exports/declarations, branding de falhas entre módulos e
transporte OpenAI injetado, mas só importa `runCompletion` e verifica seu tipo.
Não registra um provider na entrada usada pelo executor para depois chamar o
completion compilado. A alegação anterior de identidade entre bundles refere-se
à identidade/branding dos **erros**, não à unicidade do **registry**.

Sem reexecução: providers 5/5, runtime/consumidores 8/8, intake/rota 16/16,
ProviderBoundary 1/1 e builds contracts/core/providers/API aprovados, todos exit 0,
conforme o pacote pai. Typecheck focal anterior continua REPROVADO exit 1:
2 diagnósticos antigos focais +16 de dependências, nenhum introduzido no recorte
comparado. O novo achado não invalida esses alcances nem aprova o fluxo real.

## Menor delta proposto — NÃO APLICADO

```diff
--- a/packages/core/tsup.config.ts
+++ b/packages/core/tsup.config.ts
@@
-  splitting: false,
+  splitting: true,
```

Permitir compartilhamento de módulos entre entradas ESM no build do core, mantendo
o único registry de domínio existente. O delta textual é de uma linha; seu alcance
de empacotamento é todo o core, portanto exige validação antes de aprovação.
Não se propõe registro global, outro runtime, nova run por turno, novo provider,
alteração de modelo, schema, seleção, fallback, retries, finanças ou launcher.

Após autorização para implementação, a verificação focal deve exigir que registro,
router e completion vejam **o mesmo objeto** e que o dublê receba a chamada.
Integrar essa asserção ao smoke formal existente, evitando suite paralela duplicada.
Inspecionar o output de um build core necessário para conferir o compartilhamento
e a inclusão dos chunks no artefato de entrega. Reavaliar o empacotamento API
somente no alcance afetado. Esta proposta ainda não foi aplicada/buildada; não é
correção validada. Provider real e reteste de staging permanecem outra etapa com
autorização específica de ambiente, provider/modelo, quantidade, retries/fallback
e custo conhecido.

## Preservação e alterações desta retomada

Somente este subdiretório de evidências e a nova entrada do Evidence Index foram
criados/alterados. O plano existente `../../../imob-property-capture-context-2026-11-14/stage-commit-plan.md`
foi reutilizado como histórico, sem executar sua seleção já publicada nem alterá-la.
`CLAUDE.md`, `CODEX.md` e `changes.diff` têm hashes preservados em `results.json`.
Nenhuma alteração de fonte/configuração, build, stage, commit, push, PR, merge,
deploy, ambiente externo ou dado de domínio. Sem subagentes.

Os cinco arquivos deste diretório são evidência permanente desta execução e devem
ser preservados para reprodução/revisão. Não foram criados backups, stashes,
worktrees ou temporários; não há limpeza própria pendente. Outputs anteriores,
originais e evidências históricas permanecem intactos. P1ReconciliationRecurring
e a oferta de avaliação não foram reabertos.

---

# Consumidores compilados e entrega local — etapa posterior de 2026-11-17

Resultado prático: o recorte de consumidores compilados inspecionado passou;
**validação da imagem BLOQUEADA por daemon Docker indisponível**. Status desta
etapa: **PARCIAL**. Não se declara homologação geral do core, staging ou fluxo real.
Branch/HEAD preservados: `chore/imob-intake-provider-diagnostics`, `97c23a9b`.
Agente Codex, sem subagentes. Nenhuma nova fonte/configuração de produção alterada.

## Consumidores e cobertura

| Consumidor | Inclusão e relação com core | Cobertura desta etapa |
| --- | --- | --- |
| `@eiah/api` | API dist consome imports externos do core; Dockerfile oficial copia API dist e packages | AST das importações estáticas/dinâmicas, exports nomeados e grafo transitivo; API não executada |
| `@eiah/providers` | Pacote copiado e também inlined no bundle API por `noExternal`; folhas compiladas consomem LLMProvider/erro/logger | Imports reais das quatro classes por arquivos `.js`; construtores sintéticos, herança comum e transporte OpenAI injetado |
| `@repo/mcp-runner` | Manifest declara core; nenhum import runtime direto de core foi encontrado nas fontes MCP; cinco fontes MCP incorporadas ao sourcemap da API | Presença na API conferida estaticamente; entrada standalone não executada e dist standalone local ausente |
| `@eiah/cli` | Manifest depende de core; Dockerfile próprio, fora da imagem API | Identificado por manifest/receita, sem execução/build |
| `@eiah/workers/action-runner` | Manifest depende de core; Dockerfile próprio, fora da imagem API | Identificado por manifest/receita, sem execução/build |
| `@eiah/workers/maintenance-worker` | Manifest depende de core; receita própria; seu tsup inclui core com `noExternal` | Identificado por manifest/configuração/receita, sem execução/build |
| `@eiah/workers/run-worker` | Manifest depende de core; app não copiado pelo Dockerfile API | Identificado como consumidor separado, sem execução/build ou inferência de imagem própria |

O escopo de entrega testado é a árvore local consumida pela **imagem API**.
Identificar CLI/workers não equivale a homologar seus artefatos ou receitas.
Não se gerou dist de outro pacote para ampliar a etapa.

O parser AST de TypeScript foi utilizado como leitor de JavaScript emitido,
sem executar fontes TS da aplicação. API e cinco arquivos JS de providers revelaram
**25 entradas públicas do core**. Sua resolução ESM nativa a partir da API e a
presença de **169 ocorrências de bindings nomeados** foram conferidas estaticamente.
O grafo relativo alcançou **104 módulos, 78 chunks e 250 arestas**, todos presentes.
Esse grafo inclui o barrel e módulos com DB/BullMQ/Redis/dotenv: estes ficaram
**somente na inspeção estática**, sem carregar serviços ou conexões.
Dependências externas do grafo são enumeradas no JSON; esta etapa não homologa
todos os pacotes externos nem executa cada export do core.

## Execução efetiva e efeitos colaterais

Antes dos imports, revisaram-se as folhas e suas dependências: LLM declara classes,
Maps/funções e logger pino; retry/topologia são funções/classes sem serviço ativo.
O grafo das folhas executadas é checado para impedir imports de DB, BullMQ,
ioredis ou dotenv. Providers só recebem chaves sintéticas; transporte é injetado.
HTTP/HTTPS, TCP/TLS e fetch ficam bloqueados durante a execução. Variáveis de
credenciais/URLs de DB/Redis são retiradas do processo sem copiar seus valores.

Barrels `packages/core/dist/index.js`, `packages/providers/dist/index.js` e a API
completa não foram importados. O barrel de providers emitido por tsc contém
imports relativos sem extensão; a API o empacota. O entry standalone do MCP aponta
para `src/index.js`, ausente localmente, e não foi usado. Essas limitações existentes
não são apresentadas como regressões do splitting nem motivaram mudanças adicionais.

O novo wrapper `consumer-packaging-check.mjs` reutiliza o `../../package-smoke.mjs`
original sem modificá-lo. Adapta só nesta invocação raiz, fixture, URL de node-fetch
e a antiga premissa `instanceof=false`: após splitting o teste deve exigir o
**mesmo construtor**. O teste de branding e os checks sintéticos de quota/IDs do
smoke original continuam executados.

Execução adicional comprova:

1. As quatro classes de provider herdam a mesma `LLMProvider` compilada.
2. Um OpenAIProvider real com transporte dublê, registrado no registry formal,
   é retornado por identidade pelo router; completion propaga sua recusa como
   `instanceof LLMProviderError`, com uma invocação de transporte sintético.
3. O erro de retry permanece `instanceof RetryExhaustedError` entre imports da
   entrada. Completion reconhece esse erro e devolve exatamente sua causa tipada
   original, comprovando o catch dependente da identidade entre chunks.
4. A folha de topologia produz `WorkerTopologyConfigError` reconhecido por outro
   import da entrada, usando apenas um objeto de ambiente sintético explícito.

Há três invocações de transporte injetado: quota e sucesso no smoke reutilizado,
mais quota pelo novo caminho do completion. Há também uma rejeição transitória
de provider dublê, sem transporte, para exercitar o unwrap do retry. Zero tentativas
de rede bloqueadas e zero chamadas reais. Nada foi salvo no domínio.
O processo do harness configura `LLM_RETRIES=1` e delays/jitter zero, sem alterar
configuração da aplicação. Não é nova validação de política de retry com orçamento
maior; a prova anterior dessa política continua reaproveitada no seu alcance.

O reprodutor anterior de registro pelo executor emitido **não foi repetido**:
reutilizam-se seus 5/5 e uma chamada dublê. Todos os 43 hashes que ancoram aquela
prova foram conferidos antes do novo smoke. Nenhum build core/API foi repetido.

Comando executado de `apps/api`:

```bash
node --input-type=module -e 'globalThis.resolveFromApi = specifier => import.meta.resolve(specifier); await import("../../ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/consumer-packaging-check.mjs")'
```

| Verificação | Resultado | Exit | Executados/aprovados/reprovados/ignorados | Limite/pendência |
| --- | --- | --- | --- | --- |
| Consumidores, grafo e smoke compilado | APROVADO | 0 | 7/7/0/0 probes | 2 grupos estáticos + smoke existente + 4 grupos runtime focais; não é suite oficial/global |
| Gate oficial Evidence Index atualizado | APROVADO | 0 | 8/8/0/0 | 978 referências; execução autorizada fora do sandbox para subprocesso git |
| Registro pelo executor emitido | APROVADO, reutilizado | 0 anterior | 5/5/0/0 anteriores | 43 hashes conferidos, sem repetir execução |
| `docker image ls` no sandbox | BLOQUEADO | 1 | — | Socket negado pelo sandbox |
| Mesmo inventário fora do sandbox autorizado | BLOQUEADO | 1 | — | `Cannot connect to the Docker daemon at unix:///var/run/docker.sock` |
| Build offline, filesystem e smoke da imagem | NÃO EXECUTADO | — | — | Pré-requisito bloqueado: daemon inacessível; não foi possível conferir cache/imagens locais |
| Provider real / HTTP/DB / quartos e vaga | NÃO EXECUTADO | — | — | Fora deste recorte, sem aprovação operacional |

## Imagem: procedência e próximo passo mínimo

O inventário usou `docker image ls --no-trunc --format '{{json .}}'`, somente leitura.
O erro persistiu fora do sandbox autorizado. Portanto, existência e procedência de
uma imagem correspondente à árvore corrigida continuam **DESCONHECIDAS**. Nenhuma
imagem antiga foi aceita como prova, nenhum filesystem foi inspecionado e nenhum
container/harness foi executado em imagem. Não se iniciou o daemon, não se alterou
infraestrutura e nenhum artefato Docker preexistente foi modificado.

Sem daemon, a tentativa de build ficou bloqueada antes da invocação do builder;
não houve pull, instalação, download ou transmissão de contexto com secrets.
A receita `apps/api/Dockerfile.prod` continua copiando packages inteiro do builder,
incluindo chunks, mas isso permanece **verificação da receita**, sem imagem efetiva.
Próximo passo mínimo: tornar o daemon local acessível e verificar procedência/cache
de bases, frontend e dependências antes de retomar o build oficial com isolamento
externo efetivo, sem pull/segredos. Faltando qualquer recurso local, encerrar sem
download. Depois, inspecionar filesystem e executar somente smoke isolado sem rede.
Nenhuma mudança adicional de correção é proposta pelos resultados atuais.

## Evidências e preservação desta etapa

`consumer-packaging-results.json` registra manifests, imports/exports, grafos,
revisão dos imports executados, identidades, resultados reaproveitados e hashes.
`delivery-executions.json` registra comandos, exits, outputs, bloqueio Docker e
hashes das nove evidências preexistentes. Ambos são registros de execução real.
README recebeu somente este acréscimo; demais evidências anteriores e o reprodutor
5/5 permanecem intactos. O wrapper novo e estes registros ficam como evidência
permanente, não runtime ou gate novo de produção.

Nenhum temporário/container/imagem foi criado ou precisa de limpeza. Stage
permanece vazio; CLAUDE.md, CODEX.md, changes.diff e a alteração anterior de
splitting foram preservados. Nesta etapa, alteram-se somente este README,
Evidence Index e os três arquivos novos citados. Sem subagentes ou publicação.
O typecheck focal anterior continua **REPROVADO**, com diagnósticos preexistentes;
a validação focal não aprova tipagem global, staging ou o fluxo real de 2 quartos/1 vaga.

---

# Diagnóstico somente de leitura da conexão Docker — 2026-11-17

Status: **PARCIAL; imagem continua BLOQUEADA**. Escopo limitado a contexto,
endpoint, presença de variáveis de conexão, socket e estado observável das unidades.
Codex, sem subagentes. Branch/HEAD/stage e alterações locais preservados.

## Causa observável

- Contexto selecionado: `default`; endpoint confirmado por inspect:
  `unix:///var/run/docker.sock`, `SkipTLSVerify=false`.
- `DOCKER_HOST`, `DOCKER_CONTEXT`, `DOCKER_CONFIG`, `DOCKER_TLS`,
  `DOCKER_TLS_VERIFY`, `DOCKER_CERT_PATH` e `DOCKER_API_VERSION` estão ausentes.
  `XDG_RUNTIME_DIR` está definido; seu valor foi omitido. Não foram lidos arquivos
  de credenciais, certificados, auths ou conteúdo de configuração Docker.
- `/var/run/docker.sock` e `/run/docker.sock` não existem; `stat` fora do sandbox
  autorizado confirmou `No such file or directory` em ambos (exit 1).
- Consulta autorizada ao systemd, fora do sandbox: `docker.service` e
  `docker.socket` estão `LoadState=loaded`, `ActiveState=inactive`, `SubState=dead`,
  `UnitFileState=disabled`. A leitura passou com exit 0; isso não aprova disponibilidade.
- Há um contexto não selecionado `desktop-linux`, com endpoint
  `npipe:////./pipe/dockerDesktopLinuxEngine`. Só foi lida sua metadata; não se
  trocou contexto nem se testou disponibilidade do Docker Desktop.

Assim, o endpoint local selecionado está sem socket e suas unidades estão paradas.
Não se determinou por que pararam nem se outro daemon está disponível.
Não se atribui este resultado à ausência de imagem ou de cache, que seguem desconhecidos.

## Comandos, saídas e limites

| Verificação | Resultado | Exit | Testes exec./aprov./reprov./ignor. | Observação |
| --- | --- | --- | --- | --- |
| Contexto por `docker context ls --format` | APROVADO | 0 | — | Campos Name/Current/DockerEndpoint identificam default selecionado |
| `docker context inspect default --format` | APROVADO | 0 | — | Endpoint Unix confirmado, sem conteúdo sensível |
| Ambiente e metadados por Python | APROVADO | 0 | — | Saída estruturada/redigida; ausências de socket representadas por ENOENT |
| Estado systemd no sandbox | BLOQUEADO | 1 agregado | — | `Failed to connect to bus: Operation not permitted` |
| `systemctl show docker.service docker.socket ...` fora do sandbox | APROVADO, leitura | 0 | — | Ambas inactive/dead e disabled |
| `stat -Lc ... /var/run/docker.sock /run/docker.sock` fora do sandbox | BLOQUEADO | 1 | — | Socket ausente também fora do sandbox |
| Imagem/build offline/rootfs/smoke em container | NÃO EXECUTADO | — | — | Diagnóstico encerrou no pré-requisito concreto, sem repetir consultas equivalentes |
| Referências do Evidence Index atualizado | APROVADO | 0 | — | Checker direto: 979 referências; testes unitários/builds/smokes anteriores não repetidos |
| Integridade documental/arquivos protegidos e diff | APROVADO | 0 | — | 12 evidências anteriores preservadas; 43 hashes de artefatos intactos; stage vazio |

A tentativa inicial `docker context show` devolveu help e não informou o contexto
nesta CLI; o comando combinado com listagem de nomes terminou exit 0. Esse exit
agregado **não** foi usado como prova de contexto. A listagem com campo Current e
o inspect posteriores são as evidências efetivas. Comandos e outputs completos
permitidos, incluindo limites de exits agregados, estão em
`docker-connection-diagnostic.json`; a coleta de ambiente persiste somente campos
selecionados, sem seus valores sensíveis/customizados.

## Ação mínima necessária — não executada

Para o endpoint `default` selecionado, um operador autorizado precisa iniciar
`docker.service` no host e disponibilizar o socket resultante a esta sessão.
Comando de host sugerido: `sudo systemctl start docker.service`.
Esta retomada **não executou** start/enable, mudança de contexto, chmod/chown,
configuração, instalação ou download. A indicação de disabled não exige habilitar
automaticamente o serviço no boot para este teste pontual.

Somente após o socket ficar acessível, retomar inventário/procedência da imagem e
cache local, depois build oficial sem pull/rede/segredos quando necessário.
Existência e procedência da imagem corrigida permanecem não verificadas. Não houve
tentativa redundante de listar imagens, build, inspeção de filesystem ou execução
em container nesta retomada. Também não houve acesso a provider ou início de
API, workers, bancos ou filas.

## Evidência e preservação

Foi criado somente `docker-connection-diagnostic.json`, acrescentada esta seção
ao README e indexada a evidência real no Evidence Index. O JSON registra hashes das
12 evidências preexistentes. Nenhuma foi reescrita além deste acréscimo documental.
Não se criou harness, branch, backup, imagem, container ou temporário.
Registry 5/5, consumidores 7/7 e builds aprovados foram reutilizados sem execução;
o typecheck focal permanece reprovado. Stage vazio e arquivos protegidos preservados.
O fluxo real de 2 quartos/1 vaga continua pendente e **NÃO APROVADO**.

---

# Docker disponível: procedência e inspeção da imagem — 2026-11-17

Retomada após o operador iniciar Docker. O inventário agora respondeu com exit 0.
**Status: PARCIAL. Nenhuma imagem correspondente à correção foi validada.**
As observações anteriores de daemon parado permanecem históricas, não estado atual.
Codex, sem subagentes. Branch/HEAD e alterações locais preservados; stage vazio.

## Procedência e inspeção efetiva

O inventário local lista imagens de API anteriores a 17/11. As duas mais recentes
são `pf77-eiah-api:77c91444-nocache` (27/10, 07h13min40s, São Paulo) e
`pf77-eiah-api:77c91444` (27/10, 07h10). A terceira consultada,
`eiah-api-runtime-esm:latest`, é de 06/10. Não há revisão OCI informada nessas
três imagens. O texto `77c91444` é parte das tags, não prova independente de build.

A imagem mais recente inspecionada é:
`sha256:943466e904acced1d61060af2ebbc21b3602c9b37ce5cfa87293873a8714548e`.
Foi criado um único container **parado**, por ID local conhecido, com
`--network none --entrypoint /bin/true`. Não houve start/run/exec do container.
Quatro arquivos foram lidos via `docker cp ... -` (tar em memória, sem extração
em disco, sem conteúdo bruto exibido):

| Artefato na imagem | Resultado da comparação |
| --- | --- |
| `/app/packages/core/tsup.config.ts` | `splitting: false`; SHA diferente da configuração local corrigida |
| `/app/packages/core/dist/llm/LLMRegistry.js` | SHA diferente, uma alocação própria de registry e nenhum import relativo de chunk |
| `/app/packages/core/dist/llm/completionEngine.js` | SHA diferente, uma alocação própria de registry e nenhum import relativo de chunk |
| `/app/apps/api/dist/index.js` | SHA diferente do bundle local aprovado |

Portanto, esta imagem **não corresponde** aos artefatos corrigidos. Foram
inspecionadas essas entradas antigas, sem alegar inventário completo de seu dist
ou ausência de qualquer chunk em toda a imagem. Elas não têm os imports dos chunks
compartilhados da correção. Hashes, tamanhos e resultados estão no JSON.
O container criado nesta execução foi removido (exit 0); imagens e containers
preexistentes permaneceram intactos. Não se executou smoke sobre a imagem antiga
como se fosse validação da correção.

## Bloqueio concreto do build oficial offline

`node:22-bookworm` está presente localmente, ID
`sha256:177e8051ee1a65d22c52db66c943eb84238dcac7f7ea84ef24f5ea1466af3b87`.
Mas a base runtime requerida pelo Dockerfile oficial, `node:22-bookworm-slim`,
retornou **`No such image`**, exit 1. Docker buildx local: v0.23.0.

O procedimento parou nesse pré-requisito. Não foi invocado build, pull ou download.
`--network=none` de um build delimita rede dos comandos RUN e, sozinho, não garante
ausência de resolução externa de imagens/frontend. Não se invocou um builder que
pudesse tentar buscar a base ausente. A ausência foi comprovada para a referência
no image store local; não se afirma que todo cache interno de BuildKit foi auditado.
Suficiência dos caches de frontend/apt/pnpm permanece desconhecida, sem tentativa
de contornar o primeiro bloqueio ou modificar Dockerfile, manifests ou lockfile.

Próximo passo mínimo: disponibilizar `node:22-bookworm-slim` no image store local
por artefato offline confiável e retomar o preflight do build oficial. Se outro
recurso obrigatório não estiver local, encerrar sem download. Depois de obter
imagem com procedência da árvore corrigida, inspecionar seus chunks e só então
executar o smoke isolado com rede desabilitada, sem iniciar serviços.

## Comandos e resultados

| Verificação | Resultado | Exit | Comparações exec./iguais/diferentes/ignoradas | Cobertura |
| --- | --- | --- | --- | --- |
| `docker image ls --no-trunc --format` | APROVADO | 0 | — | Daemon disponível e inventário local |
| Primeiro inspect de três imagens | REPROVADO, template auxiliar | 1 | — | Duas linhas válidas; labels nil da terceira interrompem formato, sem falha do produto |
| Inspect corrigido da terceira imagem | APROVADO | 0 | — | Template protege labels ausentes; sem ler env/segredos |
| `docker image inspect node:22-bookworm` | APROVADO | 0 | — | Base builder presente |
| `docker image inspect node:22-bookworm-slim` | BLOQUEADO | 1 | — | Base runtime local ausente |
| Leitura do filesystem da imagem antiga | APROVADO, leitura | 0 | 4/0/4/0 | Quatro cp exit 0; conteúdo comparado por hash/estrutura |
| Correspondência da imagem antiga à correção | REPROVADO | 0 do processo de inspeção | 4/0/4/0 | Não é regressão dos artefatos locais; alvo antigo rejeitado |
| Criação/remoção do container parado | APROVADO | 0/0 | — | Sem entrypoint executado, sem serviços |
| Build oficial / chunks corrigidos na imagem / smoke isolado | NÃO EXECUTADO | — | — | Build bloqueado no preflight, nenhuma imagem corrigida disponível |
| Checker direto do Evidence Index atualizado | APROVADO | 0 | — | 980 referências; sem repetir testes unitários ou smokes |

`docker-image-validation.json` registra inventário, metadados permitidos, exits,
inspeção estática, hashes e limites. Não há conteúdo bruto de conversas, arquivos
copiados ou configuração de ambiente das imagens. O primeiro erro do template
ficou preservado; seu exit 1 não foi atribuído ao runtime da imagem.

## Preservação

Registry 5/5 e consumidores 7/7 não foram repetidos. Nenhum build de pacote local
foi repetido; a imagem antiga não recebeu smoke. O typecheck focal anterior
permanece REPROVADO, com diagnósticos preexistentes. O fluxo real de 2 quartos/1 vaga
continua pendente e NÃO APROVADO; não há aprovação de staging ou publicação.

Somente este acréscimo ao README, o novo JSON e sua entrada no Evidence Index foram
alterados/criados. O JSON ancora por hash as 13 evidências anteriores, sem backups
ou preservações duplicadas. Nenhuma alteração adicional de produção, stage,
commit, imagem preexistente ou configuração Docker. O único container temporário
foi removido; não há arquivo temporário ou limpeza própria pendente.

## Caminho efetivo de build/deploy da API staging — leitura focada

Registro: `staging-delivery-path-review.json`. Nesta etapa não se executaram
comandos Docker, builds, testes, inventários ou novas inspeções da imagem antiga.
As evidências e os resultados anteriores foram reutilizados.

Uma consulta MCP `get_service` somente de leitura ao serviço já conhecido
`srv-db20abei0phs73cqbcgg` confirmou a configuração atual de `eiah-api-staging`:
repositório `5906375/EIAH`, branch `main`, `autoDeploy=no`, `rootDir` vazio,
runtime `docker`, `dockerfilePath=apps/api/Dockerfile.prod`, `dockerContext=.`
e `dockerCommand` vazio. Portanto, **o caminho do Dockerfile examinado corresponde
ao serviço efetivo**, com contexto na raiz e CMD `node apps/api/dist/index.js`.
Isso não comprova identidade dos bytes do Dockerfile implantado, revisão live
ou presença remota da correção local ainda não publicada.

O serviço também declara pré-deploy:
`/app/node_modules/.bin/prisma migrate deploy --config /app/packages/db/prisma.config.ts`.
O comando foi apenas lido, nunca executado. Nenhuma variável de ambiente ou
credencial do serviço foi consultada; o JSON contém somente campos permitidos.

Não foi encontrado Blueprint Render entre os caminhos rastreados examinados.
A receita versionada é o Dockerfile, seus manifests/lockfile e `.dockerignore`;
os parâmetros operacionais acima vieram do serviço. O job `publish_api_image` em
`.github/workflows/release.yml` usa o mesmo Dockerfile/contexto para publicar em
GHCR, mas não demonstra rollout no Render. `.github/workflows/deploy.yml` continua
scaffold com `DEPLOY_NOT_IMPLEMENTED` e `exit 1` explícito.

O Dockerfile habilita Corepack, instala pacotes APT, executa
`pnpm install --frozen-lockfile --ignore-scripts` e
`pnpm --filter @eiah/api... run build`. O `packageManager` fixa `pnpm@10.12.4`.
O filtro alcança contracts, db, core, providers, mcp-runner e API. O build de db
declara `pnpm prisma generate`, tsup e declarações; o schema pede engines binários
`native` e `debian-openssl-3.0.x`. Não se importaram esses módulos nem se executou
geração. O runtime instala OpenSSL e copia node_modules, packages inteiro e
artefatos da API. `.dockerignore` exclui dist e node_modules locais: os builds já
aprovados no host não substituem a compilação no builder limpo.

### Bloqueio comprovado e dependências ainda não verificadas

Reaproveitado de `docker-image-validation.json`: `node:22-bookworm-slim` ausente
no image store consultado (inspect exit 1), builder `node:22-bookworm` presente.
É o **primeiro bloqueio comprovado**, não prova de que seja o único. Permanecem
sem verificação de suficiência local:

- frontend `docker/dockerfile:1.7` e sua resolução pelo builder;
- pnpm 10.12.4 no cache do Corepack;
- índices/pacotes APT de ambos os estágios e camadas reutilizáveis correspondentes;
- dependências do lockfile, store pnpm, ferramentas de build e pacotes nativos;
- engines/geração Prisma e viabilidade do build recursivo com install scripts
  desabilitados, sem configuração real;
- links do workspace e artefatos finais necessários ao runtime/pré-deploy.

Um `apt-get update` sem camada reutilizável exige acesso ao repositório: apenas
ter arquivos `.deb` não torna esse RUN offline. `--network=none` limita os RUNs,
mas não garante sozinho ausência de resolução externa de bases/frontend.

### Validação ainda necessária e procedimento mínimo proposto

1. Disponibilizar a base runtime por importação offline confiável ou download
   posteriormente autorizado. Verificar/prover os demais recursos acima somente
   no alcance necessário; não supor que o download da base encerre a preparação.
   Sem cache, seriam necessários downloads do frontend, pnpm, índices/pacotes
   APT, dependências do lockfile e engines Prisma. Para manter o Dockerfile
   inalterado e o build offline, os RUNs APT precisam de camadas reutilizáveis.
2. Com todos os recursos locais e o builder impedido de acessar a rede, construir
   pela receita oficial/contexto raiz, registrando hashes da árvore corrigida,
   plataforma e ID da imagem. Comando apenas proposto:
   `docker build --pull=false --network=none -f apps/api/Dockerfile.prod -t eiah-imob-registry-packaging:local .`.
   Essas flags sozinhas não isolam resolução externa. Na ausência de qualquer
   recurso, parar; nenhum desses comandos foi executado nesta leitura.
3. Inspecionar a nova imagem parada: dist core/API, exports, todos os chunks
   transitivos relevantes e destinos dos links; incluir presença de CLI Prisma,
   config, schema e migrations do pré-deploy, sem executar migrações.
4. Se isolável, executar o harness sintético existente nessa nova imagem, com
   entrypoint específico e rede none, sem configuração real de provider e sem
   iniciar serviços. Registrar separadamente inspeção estática e execução real.

| Verificação desta etapa | Resultado | Exit | Testes exec./aprov./reprov./ignor. | Limite |
| --- | --- | --- | --- | --- |
| Instruções, Git e receitas/manifests/evidências por leitura focada | APROVADO | 0 | — | Não valida execução do build |
| Leitura agrupada incluindo `.npmrc` opcional | REPROVADO, leitura auxiliar | 1 | — | `.npmrc` raiz ausente; demais arquivos lidos; não é falha do produto |
| MCP `get_service` do serviço conhecido | APROVADO | não se aplica | — | `isError=false`; configuração atual, sem inventário ou envs |
| Base runtime local, resultado anterior reutilizado | BLOQUEADO | 1 anterior | — | Nenhuma consulta Docker repetida |
| Build oficial / chunks e harness na imagem corrigida | NÃO EXECUTADO | — | — | Leitura somente; dependências ainda não verificadas |

Status do empacotamento continua **parcial**. Registry 5/5 e consumidores 7/7
reutilizados sem reexecução. Typecheck focal anterior continua REPROVADO por
diagnósticos preexistentes. Fluxo real de 2 quartos/1 vaga pendente, NÃO APROVADO.
Codex, sem subagentes, downloads, provider real, migrações ou publicação.
Somente este acréscimo, o JSON sanitizado e o índice foram alterados; nenhum
temporário criado, nenhuma mudança adicional de produção ou stage.

Checker direto de referências `node --import tsx scripts/checkEvidenceIndex.ts`:
exit 0, 981 referências, sem repetir sua suíte unitária. `git diff --check`: exit 0.
Conferência SHA-256 focal: 25 arquivos anteriores/protegidos intactos e prefixo
histórico deste README preservado integralmente; stage vazio. Não há temporários
ou limpeza pendente nesta etapa.

## Build oficial autorizado com downloads — imagem corrigida local

**PARCIAL: build APROVADO; filesystem e smoke na imagem continuam sem validação.**
Registros novos: `corrected-image-build.txt` (transcrição real de stdout/stderr)
e `corrected-image-validation.json` (procedência, exits, bloqueio e limites).
São os únicos arquivos novos: faltava uma execução do build oficial da árvore
corrigida. As evidências de preflight/imagem antiga continuam intactas.

Reutilizaram-se este README, `check.mjs`, `consumer-packaging-check.mjs`, o
`package-smoke.mjs` por eles referenciado, `docker-image-validation.json`,
`staging-delivery-path-review.json` e o plano de preparação existente como histórico.
Não se executou sua seleção antiga de stage. Os 43 hashes do registro 5/5 e os
111 hashes dos consumidores 7/7 conferiram sem diferenças (exit 0); nenhum smoke
ou build do host foi repetido. Não havia harness específico de imagem adequado
nas buscas focadas. Os existentes dependem também de caminhos ausentes no runtime;
nenhum adaptador foi criado antes de poder inspecionar a nova imagem.

Branch: `chore/imob-intake-provider-diagnostics`.
HEAD: `97c23a9bca690f5cd6b0fdc909c7359ed4ea25d6`. Stage inicialmente vazio.
O input incluiu a alteração local já autorizada `splitting: true`, SHA-256 do
`packages/core/tsup.config.ts`:
`2e7a9d9a80222a4b38330afc30f86eebc6e8e2ca01d7ade6410980c58cd0196b`.
Dockerfile, manifests, registries e lockfile não foram modificados.

Da raiz, uma única tentativa, com rede de build normal e downloads autorizados:

```bash
DOCKER_BUILDKIT=1 docker build --pull=false --progress=plain -f apps/api/Dockerfile.prod -t eiah-imob-registry-packaging:97c23a9b-splitting-20261117t115212z .
```

Saídas capturadas por `tee` com `set -o pipefail`; exit **0**. Não se forneceram
env-file, secrets, credenciais de provider ou build args. A tag exclusiva foi
conferida antes (inspect exit 1, `No such image`), sem sobrescrever tags anteriores.
Docker respondeu `server=20.10.12 os=linux arch=amd64`, exit 0.

### Procedência e recursos efetivamente usados

- Imagem local: `eiah-imob-registry-packaging:97c23a9b-splitting-20261117t115212z`.
- ID: `sha256:f1828dc119705930e8b9ef16edf7592948a4e394a64aad1edec0f0624c47f720`.
- Metadata inspect exit 0: criada em `2026-11-17T08:55:38.625710586-03:00`,
  `linux/amd64`, `RepoDigests=[]`; nenhuma publicação.
- Frontend `docker/dockerfile:1.7` resolvido em
  `sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e`, camada em cache.
- Builder `node:22-bookworm` local reutilizado, ID
  `sha256:177e8051ee1a65d22c52db66c943eb84238dcac7f7ea84ef24f5ea1466af3b87`;
  metadata posterior informa `node@sha256:a25c9934ff6382cd4f08b6bc26c82bf4ea69b1e6f8dabfb2ead457374127c365`.
  A linha FROM no log não explicita digest. Corepack-enable/APT builder em cache.
- Runtime slim obtido: `node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee`.
  A ausência anterior deixou de impedir este build. APT/OpenSSL runtime executou.
- Corepack baixou pnpm 10.12.4 da fonte configurada. Instalação frozen-lockfile:
  591 pacotes adicionados/reutilizados, zero downloads de dependências reportados
  pelo pnpm; o download do próprio pnpm é separado dessa contagem.
- Build recursivo contracts/db/core/providers/mcp-runner/API aprovado; Prisma
  Client 7.2.0 gerado sem migração. Não se mediu separadamente cache/download
  de engines. Core emitiu chunks e API passou no typecheck oficial/tsup do build.
- Os COPYs finais e a exportação da imagem terminaram. Esses logs não substituem
  a inspeção independente do filesystem nem a resolução efetiva dos chunks.

É uma imagem do working tree local, com HEAD e delta registrados, pela mesma
receita/contexto configurados no Render anteriormente consultado. Não comprova
equivalência integral de conteúdo, ambiente ou execução com Render/staging.

### Bloqueio da inspeção e execução não realizada

A ferramenta recusou a criação do processo fora do sandbox destinado a criar
um container próprio **parado**, com rede none/entrypoint Node para o harness,
e ler caminhos permitidos por `docker cp`/tar em memória. Erro retornado:
`CreateProcess ... Rejected("rejected by user")`, sem motivo adicional.
**O processo não iniciou, não há exit code de inspeção e nenhum container foi
criado por esse comando.** Não se atribui a recusa a defeito da imagem nem se
infere quem ou qual regra gerou a decisão. Nenhuma tentativa equivalente ou
outro caminho de execução foi usado depois da recusa.

| Verificação | Resultado | Exit | Testes exec./aprov./reprov./ignor. | Cobertura/pendência |
| --- | --- | --- | --- | --- |
| Integridade das provas do host reutilizadas | APROVADO | 0 | — | 43 +111 hashes; sem repetir smokes |
| Daemon e disponibilidade da tag exclusiva | APROVADO | 0 /1 esperado | — | Daemon disponível; tag inicialmente ausente |
| Build oficial com downloads autorizados | APROVADO | 0 | — | Compilação recursiva, COPYs e exportação local |
| Metadata da imagem nova/base builder | APROVADO | 0 | — | ID/data/plataforma/digests, sem envs |
| Filesystem parado, exports, links e grafo de chunks | BLOQUEADO | não existe | — | Processo recusado pela ferramenta antes de executar |
| Harness sintético dentro da imagem/rede none | NÃO EXECUTADO | — | 0/0/0/0 | Depende da inspeção; nenhum adaptador criado |
| API completa, providers reais, migrações e serviços | NÃO EXECUTADO | — | — | Fora do escopo autorizado |

Logo, o critério de aprovação desta etapa **ainda não foi atendido**. Não se
executaram nesta imagem trecho do executor, módulos core completos ou a API.
Presença/resolução dos chunks finais, registry e identidade dos erros continuam
pendentes no alcance da imagem, sem invalidar as provas anteriores do host.

### Preservação e próximo passo mínimo

A imagem nova e os caches/downloads autorizados ficam preservados. Nenhum
container manual de inspeção/smoke ou temporário foi criado; não há limpeza
própria pendente. Imagens/containers preexistentes não foram alterados. Codex,
sem subagentes, chamadas de provider, serviços, migrações ou publicação.

Próximo passo: disponibilizar a execução recusada de inspeção desta imagem por
ID e concluir o harness isolado reutilizando os checks. **Não é necessário repetir
o build/downloads nem inspecionar a imagem antiga.** Só depois, ajustar e revisar
a seleção de publicação do plano existente para o delta/evidências atuais,
sem executar stage, commit, push ou deploy nesta etapa.

Typecheck focal anterior permanece REPROVADO por diagnósticos preexistentes;
o typecheck oficial de build não inclui os testes. O fluxo real de 2 quartos/1 vaga,
com proposta, confirmação, orientação e salvamento explícito, continua pendente
e NÃO APROVADO. Não há homologação geral do core ou aprovação em staging.

## Retomada corrigida — inspeção e harness dentro da entrega aprovados

Após a orientação do operador, o comando foi reapresentado com script em arquivo,
regex Python raw/triple-quoted e sem dupla interpretação de escapes por JavaScript
e shell. O novo `image-packaging-validation.py` cobre a lacuna demonstrada: adaptação
mínima dos harnesses existentes ao filesystem da imagem e ciclo do container com
`try/finally`. Não cria outro registry, runtime ou regra da aplicação. O controlador
Node e as versões adaptadas são gerados apenas em memória e copiados ao container.

```bash
python3 ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/image-packaging-validation.py --image sha256:f1828dc119705930e8b9ef16edf7592948a4e394a64aad1edec0f0624c47f720
```

**Exit 0; APROVADO NO RECORTE LOCAL da imagem.** Não houve novo build ou download.
O resultado anterior de recusa permanece histórico, superado pela retomada real
em `corrected-image-validation.json`, `imageValidationResumptions` e
`imagePackagingConclusion`. A imagem continua sem publicação e o intake real
continua parcial. Verificação preliminar `--syntax-only`: exit 0, apenas parser
dos scripts adaptados, sem imports de produção ou smoke no host.

### Inspeção antes de iniciar qualquer processo no container

Container próprio `5ec71054998c9be3f312b9d373d225469aa07082d40d73f5f6804137f6035278`,
criado a partir do ID da imagem, com `--network none --entrypoint node` e cwd da API.
Metadata inicial: `false none []` — parado, rede none, zero mounts. Somente depois
da inspeção e da disponibilização dos harnesses houve `docker start --attach`;
o comando iniciado é o controlador sintético, nunca o CMD da aplicação.

Leituras `docker cp`/tar em memória confirmaram dist core/API/providers,
`splitting:true`, manifests/exports, links core/db da API e presença de CLI,
config, schema e migrations Prisma, sem executar Prisma ou ler envs. Hashes e
metadados permitidos estão no JSON, sem gravar os arquivos brutos no host.
O scanner de cláusulas estáticas alcançou 25 entradas, 103 módulos, 78 chunks e
240 arestas. A análise AST posterior no container também contempla importações
dinâmicas e ampliou o alcance para 104 módulos e 250 arestas, todos presentes;
as contagens delimitam parsers diferentes, sem resultados contraditórios.
Existe uma única alocação do registry, em `packages/core/dist/chunk-ZNSZSEHU.js`.

### Disponibilidade e reutilização dos harnesses

Os dois harnesses originais **não estão embutidos na imagem**: as consultas aos
seus caminhos retornaram exit 1 esperado, antes de copiar qualquer apoio. Foram
então disponibilizados e conferidos por SHA-256 **no container ainda parado**.
Copiaram-se somente `check.mjs`, `consumer-packaging-check.mjs`, `results.json`
histórico, `package-smoke.mjs` e três módulos de apoio/adaptação em memória.
Não houve volumes, secrets, cópia de dist/node_modules do host ou alteração da imagem.

Adaptações limitadas: verificações de arquivos protegidos do host ficam na prova
de integridade externa; manifests CLI/workers ausentes da imagem API não entram
no inventário de runtime; metadados de cobertura refletem imagem; hashes incluem
somente artefatos existentes nela. A fonte esperada do executor e a receita Docker
são fixtures de comparação, sem import/execução. Os trechos do executor não foram
alterados. Fontes core realmente copiadas pelo Dockerfile são comparadas aos mapas.

### Execução efetiva e cobertura

O controlador executou os dois harnesses em processos Node separados, com ambiente
mínimo/sintético, rede none e nenhum mount. O primeiro carrega registry/router/
completion reais dos módulos compilados da imagem e executa o trecho emitido do
executor em VM: construtores de provider/logger/ambiente explícitos são dublês.
Registro, resolução e chamada compartilham o mesmo objeto, com exatamente uma
chamada sintética. Não se executa a API completa ou seu masking.

O segundo reutiliza o smoke formal e importa só folhas previamente revisadas.
Confirma 25 entradas/169 bindings, grafo AST de 104 módulos/78 chunks/250 arestas,
herança dos quatro providers, `LLMProviderError`, `RetryExhaustedError` com unwrap
da causa pelo completion e `WorkerTopologyConfigError`. Transportes são injetados.
Registry 5/5 e consumidores 7/7 **desta imagem** passaram; os smokes do host não
foram repetidos. Zero tentativas de rede bloqueadas, chamadas reais ou serviços.
API, barrel core, barrel providers e componentes DB/filas permaneceram estáticos.

| Verificação da retomada | Resultado | Exit | Exec./aprov./reprov./ignor. | Cobertura |
| --- | --- | --- | --- | --- |
| Sintaxe das adaptações existentes | APROVADO | 0 | — | Sem smoke/import da aplicação no host |
| Inspeção do container parado | APROVADO | 0 | — | Artefatos, exports, links, grafo estático e registry único |
| Presença original dos dois harnesses | APROVADO como diagnóstico | 1/1 esperados | — | Ausentes da imagem; disponibilizados por cópia restrita |
| Cópia e hashes dos apoios | APROVADO | 0 | — | Conferidos antes do start; sem módulos compilados do host |
| Registro/executor/completion compilados | APROVADO | 0 | 5/5/0/0 probes | Trecho exato em VM e imports reais do core da imagem |
| Consumidores/erros/chunks na imagem | APROVADO | 0 | 7/7/0/0 probes | AST amplo e runtime só de folhas seguras |
| Attach/controlador e estado final | APROVADO | 0 | — | `false 0 none []`; nenhum serviço operacional |
| Remoção em finally | APROVADO | 0 | — | Container próprio removido; imagem preservada |
| API completa/provider real/fluxo funcional/staging | NÃO EXECUTADO | — | — | Não há aprovação desses alcances |

O `finally` remove o container próprio mesmo diante de falha na inspeção/harness;
nesta execução removeu-o após o sucesso. Apoios e resultados temporários dentro
dele foram eliminados com o container; resultados permanentes já estavam no JSON.
Nenhum temporário do host ou cleanup próprio pendente. Imagem e caches ficam
preservados; recursos preexistentes não foram alterados.

Próximo passo mínimo de preparação: revisar a seleção do plano existente para o
delta `packages/core/tsup.config.ts` e estas evidências, incluindo conferência do
conteúdo publicável, sem aplicar a seleção histórica de 40 caminhos. Não executar
stage/commit/publicação. Typecheck focal anterior REPROVADO preservado; proposta,
confirmação, orientação e salvamento explícito de 2 quartos/1 vaga continuam
pendentes e NÃO APROVADOS. Codex, sem subagentes.

Conferência final: checker direto do Evidence Index exit 0, 984 referências,
sem suíte unitária; `git diff --check` exit 0 e stage vazio. Integridade SHA-256:
27 arquivos anteriores/protegidos intactos, prefixo histórico do README e conteúdo
anterior do índice preservados (29 caminhos conferidos). Um pós-processamento
documental inicial falhou exit 1 por `str.removeprefix` indisponível no Python
local; substituição por slice compatível passou exit 0, antes de registrar a
conclusão final. Não houve repetição de inspeção, smoke ou build por esse ajuste.

## Publicação local — preservação bruta e normalização de whitespace (2026-11-17)

Retomada autorizada somente para o formato documental e o commit local. A seleção
anterior de 21 caminhos conferiu byte a byte com o plano e o stage; HEAD permaneceu
97c23a9b. `git diff --cached --check` retornou exit 2 com 15 ocorrências, todas em
`corrected-image-build.txt`, linhas 150, 158, 165, 169, 184 e 221–230. A aprovação
anterior de diff da worktree não abrangia esse log então não rastreado; a falha do
stage foi preservada, sem desativar checks ou hooks.

Reutilizado o mecanismo `packaging.losslessLogs` documentado no README do pacote
pai e no histórico do plano: gzip sem perda com mtime=0, nome vazio no header e
compresslevel=9. Antes de sobrescrever o `.txt`, foi criado e descomprimido
`corrected-image-build.txt.gz`; os 58.799 bytes restaurados coincidiram integralmente
com o bruto. O gzip é a única preservação bruta e o único caminho adicional desta
etapa, no mesmo diretório de evidências, incluído na seleção final de 22 caminhos.
Não se criou diretório, manifesto, script permanente ou backup paralelo.

| Representação | Bytes | SHA-256 |
| --- | --- | --- |
| Transcrição bruta, recuperável do gzip | 58799 | `ff0b59ca1935647f4adc23b3ee1a5a09f46dd24cf71837ae54b626a50e2c0d73` |
| Arquivo `corrected-image-build.txt.gz` | 10154 | `25369a4d6bd1d220350a6c826e8d493e3d90df8f3f0f7f585a77e28ef0ec1741` |
| Representação normalizada `corrected-image-build.txt` | 58763 | `69980ea658d36e4170c165b9e3fab4d17610864b967b88854be55846a7b17a7e` |

Transformação exata, aplicada uma vez aos bytes brutos:

```python
b'\n'.join(line.rstrip(b' \t') for line in raw.replace(b'\r', b'').split(b'\n'))
```

Foram removidos 31 bytes CR de transcrição e cinco espaços finais; zero tabs.
Somente as 15 linhas listadas mudaram. Os 686 LF foram preservados; nenhuma linha,
mensagem, resultado, falha ou exit code foi removido ou reordenado. O texto publicado
é uma representação normalizada, não a captura byte-original. Outros logs, harnesses,
fontes, artefatos compilados, imagem e resultados de execução permaneceram intactos.

`corrected-image-validation.json` → `build.logSha256` identifica agora o texto
normalizado; `packaging.losslessLogs` e `packaging.normalizedLog` registram os dois
formatos, hashes, transformação, proveniência e a falha anterior. Comando original
de captura, exit 0 do build e conclusões históricas do JSON foram mantidos. A tabela
do plano é atualizada somente para estas evidências alteradas e para o gzip.

O único delta de produção continua `splitting:false` → `true`. Registry no host e
na imagem 5/5 e consumidores 7/7 em cada ambiente são resultados reutilizados; zero
novos builds, smokes, comandos Docker, serviços ou chamadas de provider nesta etapa.
CLAUDE.md, CODEX.md e changes.diff continuam excluídos e preservados. Typecheck focal
anterior REPROVADO; API completa, staging e fluxo real de quartos/vaga não aprovados.
Codex, sem subagentes. Gzip permanente necessário à auditoria, sem temporários próprios.

Conferências documentais desta retomada: preservação/descompressão e transformação
registrada reproduzível passaram com exit 0. Checker existente
`node --import tsx scripts/checkEvidenceIndex.ts`: sandbox exit 1 por sete referências
históricas reportadas ausentes; mesmo comando fora do sandbox exit 0, 986 referências.
Sem alteração dessas referências nem do checker. Consulta auxiliar inicial a
cat-file usou caminho@revisão, retornou 128 e não foi usada como diagnóstico válido;
o checker existente verifica revisão:caminho. A conferência final do stage ocorre
após atualizar seletivamente seus bytes; estes resultados não a antecipam.
