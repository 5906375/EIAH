# Cadastro IMOB guiado — validação local com dublês

Data: 2026-11-14. Status funcional: **PARCIAL**. Executor: Codex, sem subagentes.
Branch: `fix/imob-property-draft-context`. HEAD preservado: `d60655c4fd344dca39fbbdb90d2e46bbd44a3b78`.
Nenhum stage, commit, push, PR, merge, deploy, chamada paga ou gravação real nesta execução. Oferta de avaliação não alterada.

## Resultado e causas

O intake anterior aplicava diretamente os dados interpretados. Agora interpretar propõe alterações; somente a confirmação contextual da proposta vigente aplica exatamente suas alterações ao mesmo rascunho. Salvar o imóvel continua sendo outra ação explícita do formulário.

A falha restante em `published/intake-first.log` era a expectativa incorreta do rótulo `Vagas`, enquanto o catálogo real define `Vagas de garagem`. Corrigiu-se a asserção para exigir o rótulo completo, sem flexibilizar validação. Os outros 11 testes desse log passaram e foram reutilizados. O caso corrigido passou isoladamente em `intake-reproduction.log`.

A última edição corrige uma lacuna local: quando uma correção elimina todas as diferenças propostas, a proposta anterior precisa ser limpa. O intake devolve `proposal:null`, sem patch; o adaptador limpa sua referência. `intake-withdrawal.log` e `adapter-withdrawal.log` confirmam que uma confirmação posterior não reaplica a versão anterior e nenhum campo muda. Ambos terminaram com exit 0 e foram recuperados após a interrupção, sem repetição.

**A causa do retorno inválido em staging continua não comprovada.** Não há nesta tarefa resposta bruta do provider nem logs de staging que permitam identificar a etapa real. A estrutura de exemplo do prompt foi explicitada e foram acrescentados diagnósticos finitos de etapa/outcome, sem registrar prompt, saída bruta, credenciais ou dados do imóvel. Isso permite diagnóstico futuro autorizado; não demonstra resolução do incidente de staging.

## Fluxo e reutilização

- Contrato e prompt pertencem ao IMOB; o engine prioriza o cadastro ativo e consulta o intake também para interpretar retomada livre. Nenhuma regra cognitiva foi acrescentada ao `ChatAgentLauncher`.
- A rota existente `/imob/chat/resolve-turn`, `intake=property_draft`, mantém os gates de sessão, tenant/workspace, membership, permissões e entitlement e o executor central `executeLlmStep`, com perfil/modelo e masking já governados.
- O intake recebe o rascunho atual, histórico limitado, proposta vigente e estado ativo/pausado. O provider recebe campos, opções reais, preenchidos/ausentes e contexto sem credenciais ou identificadores de autorização; para campos fora da captura recebe apenas presença, sem valor de proprietário/documentos.
- A proposta usa o descritor existente de revisão (`ref`, `contextRef`, `draftRef`), adaptado ao formulário não salvo, e o estado já existente das mensagens/formulários. A função compartilhada de hash preserva a ordem e os dados usados pela revisão de propostas CRM. Cinco testes focais existentes validaram essa reutilização.
- Catálogo, schemas e validador real do formulário protegem campos, tipos, opções e patch integral. A referência correlaciona escopo autenticado, origem, revisão, valores e mudanças. **Não é assinatura, autorização, consumo durável nem proteção criptográfica contra cliente hostil**; a autoridade e a gravação continuam nos fluxos existentes.
- Propor, perguntar, recusar e esclarecer não alteram campos. Novos dados criam nova referência e exigem nova confirmação. Edição manual invalida a proposta inteira; respostas tardias são descartadas após mudança de sessão/usuário/tenant/workspace/domínio/conversa/origem/formulário/thread/caso/turno ou revisão, inclusive editar e desfazer.
- Pausa/retomada e confirmação são interpretações do provider contextual. Não há atalhos de igualdade de frase para conversa livre. Dublês controlam o significado nos testes; não comprovam entendimento de um provider real.

## Diff efetivo de código

`changes.diff.gz` contém, após descompressão, o diff bruto dos dez caminhos abaixo, separado dos logs e da documentação. O `changes.diff` original permanece somente local e fica fora da entrega. `source-hashes.json` identifica os arquivos ao encerrar a tarefa; não equivale a novo commit.

| Arquivo | Alteração |
| --- | --- |
| `packages/contracts/src/imobPropertyCapture.ts` | Contrato de proposta, origem, confirmação e apresentação do IMOB. |
| `apps/api/src/services/imob/imobAgentContract.ts` | Interpretação contextual, etapas separadas e schema explícito do retorno. |
| `apps/api/src/services/imob/intake/imobPropertyCaptureIntake.ts` | Proposição, validação, confirmação integral, recusa/pausa/retomada e diagnóstico seguro. |
| `apps/api/src/services/imob/crm/imobProposalReviewContinuity.ts` | Extração reutilizável da correlação existente, preservando seu cálculo. |
| `apps/api/src/routes/imob.ts` | Escopo da sessão e observação de etapa/outcome no intake existente. |
| `apps/web/src/components/agents/chatLauncherEngine.ts` | Intake antes do roteamento, incluindo retomada sem frase obrigatória. |
| `apps/web/src/features/imob/structured/useImobFrontDoorForms.ts` | Proposta sem editar, aplicação integral confirmada, invalidação e descarte tardio. |
| `apps/web/src/features/imob/structured/types.ts` | Proposta efêmera na mensagem estruturada existente. |
| `apps/api/src/tests/imob-property-capture-intake.test.ts` | Casos de intake/rota com dependências injetadas. |
| `apps/web/src/features/imob/structured/createImobStructuredForms.test.ts` | Casos do adaptador/engine com estado em memória. |

Os testes permanecem nos dois arquivos já registrados no manifesto e na suíte oficial; nenhum arquivo de teste órfão foi criado. `CLAUDE.md` e `CODEX.md` mantêm exatamente os hashes encontrados antes do trabalho, sem novas edições.

## Resultados reais

Contagens `executados/aprovados/reprovados/ignorados`; não somar tentativas históricas como testes distintos. Comandos completos, códigos e reaproveitamento em `results.json`.

| Verificação | Resultado | Exit | Contagem / limite |
| --- | --- | --- | --- |
| Intake inicial (`published/intake-first.log`) | REPROVADO histórico | 1 | 12/11/1/0; rótulo incorreto na asserção. |
| Reprodução corrigida (`intake-reproduction.log`) | APROVADO | 0 | 1/1/0/0; reutiliza os outros 11 casos aprovados. |
| Remoção de todas as diferenças (`intake-withdrawal.log`) | APROVADO | 0 | 1/1/0/0; proposta limpa e confirmação posterior sem patch. |
| Adaptador inicial (`published/forms-first.log`) | REPROVADO histórico | 1 | 0 testes; variável duplicada na fixture, corrigida. |
| Adaptador afetado (`forms-second.log`) | APROVADO | 0 | 11/11/0/0. |
| Guardas de confirmação (`adapter-confirmation-guards.log`) | APROVADO | 0 | 2/2/0/0; patch parcial/ampliado/ref anterior e edição durante confirmação. |
| Remoção no adaptador (`adapter-withdrawal.log`) | APROVADO | 0 | 1/1/0/0. |
| Correlação CRM existente (`review-correlation-regression.log`) | APROVADO | 0 | 5/5/0/0; referência, draft e escopo. |
| Contratos (`contracts-typecheck.log`) | APROVADO | 0 | `tsc --noEmit`, sem diagnósticos. |
| Typecheck focal final (`typecheck-final.log`) | APROVADO no recorte | 0 | 12 raízes com vite-env; 0 diagnósticos focais, 17 de dependências excluídos. |
| Build web (`published/web-build.log`) | APROVADO | 0 | 897 módulos; avisos de ES2024, Browserslist antigo e chunk grande. |
| Whitespace do diff | APROVADO | 0 | `git diff --check`; stage vazio. |
| Provider real, navegador, HTTP com banco | NÃO EXECUTADO | — | Sem prova semântica real ou operacional. |

Total focal atual: 13 casos de intake, 14 de adaptador e 5 de correlação aprovados **em execuções seletivas**, não em uma nova suíte integral. A última alteração de produção afeta somente o ramo do intake que retira todas as diferenças; sua cobertura foi executada nos dois níveis. O build já aprovado é do cliente, não inclui esse módulo de servidor e não foi repetido. O typecheck focal foi concluído após essa edição. Alterações posteriores foram somente testes/documentação.

## Verificações reaproveitadas

Do pacote `../imob-property-capture-context-2026-11-14/`: `forms-tests.log` (180/180 na árvore anterior; os sete casos afetados foram substituídos/revalidados nesta tarefa, sem alegar nova execução integral dos 173 restantes); `no-db-gate.log` (2/2, autorizado fora do sandbox na execução original); `launcher-gate.log`, `entrypoint-gate.log` e `snapshot-gate.log` (exit 0, `ok:true`). Scripts/regras, arquivo do launcher e schemas do snapshot não mudaram. O gate de snapshot verifica estrutura do contrato e existência dos fontes, não o comportamento novo do adaptador, coberto pelos testes focais.

Não foram repetidos os gates anteriores nem executada nova consulta de CI/P1. A ratificação `weekly_cycle_evidence_too_old` permanece preservada; este pacote não aprova CI remoto. O Evidence Index foi atualizado somente após os artefatos físicos; a integridade dos caminhos novos foi conferida por leitura, sem repetir a suíte do índice.

## Limitações e reteste futuro

Status PARCIAL: provider real, navegador/mobile, jornadas de paridade e HTTP com banco não validados nesta tarefa; tipagem integral não certificada. Diagnósticos de dependências excluídos e avisos do build permanecem fora desta correção. Não se atribui regressão ou causa de staging sem evidência.

Em reteste futuro autorizado no navegador: iniciar cadastro parcial; informar características/perguntar sem mudar campos; corrigir a proposta; confirmar contextual e verificar somente os campos propostos; editar manualmente e tentar confirmar proposta antiga; recusar/hesitar; retirar todas as diferenças e tentar confirmar; pausar/retomar livremente; mudar de conversa durante resposta. Salvar deve continuar exigindo a ação separada do formulário. Este roteiro **não foi executado**.

## Artefatos e estado local

Este diretório foi criado nesta execução para evidência auditável. Logs originais, inclusive falhas e typecheck anterior, foram preservados sem substituição ou alteração. Para a entrega foram preparadas três cópias sanitizadas, identificadas abaixo. Dados dos testes são sintéticos; não foram registradas credenciais ou respostas reais. O build regenerou a saída derivada ignorada `apps/web/dist`; nenhum arquivo preexistente foi apagado. Não foram criados worktree, stash ou backup. Nenhuma limpeza genérica foi realizada. Os processos iniciados foram recuperados e terminaram; nenhum node/pnpm/tsc ativo foi observado no namespace local ao encerrar.

Documentação/evidências permanecem locais, sem stage. HEAD e alterações preexistentes em CLAUDE/CODEX preservados. Os hashes dos arquivos destinados à entrega estão em `source-hashes.json`; o próprio inventário não se inclui para evitar autorreferência. Hashes de CLAUDE/CODEX preservados ficam em `results.json`, como fatos locais fora da entrega.

## Preparação da entrega — sem stage/commit

Preparação conferida em 2026-11-16, preservando as datas e os resultados das execuções de 2026-11-14.

Reutiliza-se o plano existente em `../imob-property-capture-context-2026-11-14/stage-commit-plan.md`: a seção inicial passa a reger somente este incremento; o plano anterior é preservado abaixo como histórico. Seleção exata: **29 caminhos únicos, 16 normais e 13 logs ignorados**, todos explícitos no plano e em `results.json` → `packaging`. Os logs anteriores reaproveitados e o helper de tipagem já estão em HEAD e não são adicionados novamente. Os dois testes continuam registrados no manifesto e no script oficial do CI, sem alteração de workflow/package/manifesto nesta entrega.

O diff bruto tinha 27 linhas vazias de contexto com marcador de espaço. Para preservá-lo byte a byte e evitar whitespace no arquivo novo staged, entrega-se `changes.diff.gz` (gzip nível 9, mtime=0), cuja descompressão coincide exatamente com o diff bruto atual. O original `changes.diff` fica local, excluído da lista; não foi normalizado.

| Fonte original local, excluída da entrega | Cópia destinada à entrega | Tratamento exato |
| --- | --- | --- |
| `intake-first.log` | `published/intake-first.log` | 2 substituições do prefixo absoluto do workspace por `[WORKSPACE]`; remoção de espaços finais em 2 linhas vazias do diagnóstico. |
| `forms-first.log` | `published/forms-first.log` | 6 substituições do mesmo prefixo por `[WORKSPACE]`; nenhuma remoção de espaços finais. |
| `web-build.log` | `published/web-build.log` | 1 substituição do mesmo prefixo por `[WORKSPACE]`; remoção de espaço final em 1 linha vazia do trecho de código mostrado pelo build. |

Nenhuma cópia substitui o original local. A ordem, conteúdo relevante, contagens, falhas históricas e status foram preservados; não houve rerun. `results.json` registra SHA-256 original/publicado e transformações por arquivo. Os outros dez logs entram sem alteração. Busca por chaves privadas, formatos de tokens, bearer, atribuições longas de segredo, URI de banco com credencial e e-mails não encontrou credencial real no escopo revisado; uma ocorrência é a fixture preexistente `synthetic-test-only`. Isso não equivale a auditoria exaustiva de segredos.

O inventário de hashes foi atualizado explicitamente para cobrir os 28 arquivos entregues além do próprio inventário (inclui plano, cópias sanitizadas e diff comprimido; exclui originais locais e instruções fora da entrega). Antes desse empacotamento, os 29 hashes anteriores coincidiam. Nenhum código, teste, CI, build ou resultado executado foi alterado nesta preparação.


## Incremento de coleta conversacional — 2026-11-17

Status **PARCIAL**. Executor: Codex, sem subagentes. Checkout efetivo: `EIAH_IMOB_ASSET_DESTINATION`, branch `chore/imob-intake-provider-diagnostics`, HEAD `f0da60cd2a8a1e8204ae25f33f1251ca2d665c0d`. Stage vazio. Este registro é um incremento posterior; os resultados e ressalvas históricos acima não foram reescritos.

### Comportamento e limites

- `Cadastrar imóvel` abre deterministicamente o modo guiado antes da classificação do Front Door, sem LLM. A definição completa existente fica oculta; um campo por vez é projetado a partir de `buildPropertyCreateForm`. Tipo, Cidade e Endereço vêm da fonte compartilhada de requisitos; destinação permanece opcional. Anexos aparecem somente na revisão.
- A descrição inicial é opcional. O intake existente propõe alterações, sem editar valores; a confirmação contextual aplica a proposta vigente uma vez. Seleções canônicas, perguntas sequenciais, zero válido, erro, pular/retomar, correção, pausa, cancelamento e revisão seguem caminhos determinísticos. Não há novo parser genérico de linguagem livre.
- O formulário completo e o handler/endpoint de criação existentes são reutilizados na revisão. Salvar exige ação explícita; o servidor consulta a sessão do ator autenticado e valida os requisitos mesmo se o cliente omitir/adulterar a referência do modo. O save guiado não passa por classificação ou intake de unidades. O schema legado fora de sessão guiada aberta continua permissivo. O cadastro em lote e as entradas legadas não canônicas foram preservados.
- O controle usa `MemoryEvent`, escopo autenticado, referência UUID emitida no servidor e advisory lock transacional por tenant/workspace/ator. Há no máximo um cadastro guiado aberto por esse ator no workspace. Trocar `formId` não renova elegibilidade. Valores/proposta reutilizam os schemas da captura para proteger revisão e continuidade; não há nova tabela de rascunho, registry, migration ou schema de domínio concorrente.
- A admissão consome a interpretação antes de `executeLlmStep`; a transação termina antes do transporte. Falha, timeout, resposta inválida e resultado desconhecido não renovam. O percurso continua `intake → executeLlmStep → runCompletion → provider`, com política interna de uma tentativa (`retry.ts` conta tentativas totais). Os quatro adaptadores usam fetch direto, sem SDK/retry interno; o modo guiado impede seguir redirects. Testes sintéticos medem o despacho e o transporte. A formulação é **até uma tentativa de transporte autorizada por sessão**, sem promessa financeira.
- Snapshot da mesma aba espelha valores atuais e revisão de `useImobFormState`; o servidor revalida a sessão. Histórico de outro dispositivo não restaura rascunho/autoridade. Pausa preserva valores, pulados e consumo. Persistência de controle indisponível bloqueia interpretação; coleta canônica continua, sem ganhar autorização de save pela UI.
- A abertura tem timeout e marcador de origem preservado durante espera/resultado desconhecido. Repetir sincroniza a mesma referência. Cancelamento recebido antes da abertura grava estado terminal sob o mesmo lock. Resposta antiga não substitui cadastro mais recente, não reabre cancelado e não restaura interpretação consumida. O teste `coleta guiada v1 abertura: cancelar antes/depois da admissão impede resposta tardia de substituir cadastro mais recente` passou como teste raiz 194 na suíte final, cobrindo os dois ordenamentos.
- Nenhuma regra foi adicionada a `ChatAgentLauncher.tsx`.

### Resultados recuperados e finais

Contagens são testes executados/aprovados/reprovados/cancelados; ignorados = 0 nas execuções citadas. Resultados de versões anteriores são reaproveitados apenas quando o caminho não mudou. Não somar reexecuções como casos distintos.

| Validação | Resultado | Exit | Contagens / evidência |
| --- | --- | --- | --- |
| Formulários após a correção da abertura | APROVADO | 0 | 197/197/0/0 — `collection-opening-forms-regression.log` |
| Intake guiado após a correção da abertura | APROVADO | 0 | 10/10/0/0 — `collection-opening-intake-regression.log` |
| Ciclo de abertura focal | APROVADO | 0 | 4/4/0/0 — `collection-opening-lifecycle.log`; incluídos nos 197 |
| Runtime de tentativa única | APROVADO | 0 | 2/2/0/0 — `collection-runtime-final.log`; transitório, metadados sem autoridade e timeout |
| Completion/adaptadores sintéticos | APROVADO | 0 | 2/2/0/0 — `collection-providers-final.log`; OpenAI + Anthropic/Gemini/DeepSeek, sem rede |
| Formulário de criação, reaproveitado | APROVADO | 0 | 19/19/0/0 — `collection-property-tests.log` |
| Persistência/histórico, reaproveitado | APROVADO | 0 | 15/15/0/0 — `collection-persistence-tests.log` |
| Intake legado, reaproveitado | APROVADO | 0 | 16 casos legados dentro da execução 22/22 de `collection-intake-second.log`; guiados revalidados separadamente |
| Typecheck oficial API atual | APROVADO | 0 | `collection-opening-api-types.log` |
| Build web atual | APROVADO | 0 | `collection-opening-web-build.log`; avisos de target/Browserslist/chunks preservados |
| Builds contracts/core/providers | APROVADO | 0 | `collection-contracts-build.log`, `collection-core-build.log`, `collection-providers-build-final.log` |
| Gates render-only/entrypoint/snapshot | APROVADO | 0 | `collection-launcher-gate.log`, `collection-entrypoint-gate.log`, `collection-snapshot-gate.log`; fontes dos gates e launcher intactas |
| Typecheck focal após abertura | REPROVADO | 1 | `collection-typecheck-opening.json`: 0 introduzidos, 2 diagnósticos antigos em testes +32 de dependências presentes no baseline |
| Typecheck web integral anterior | REPROVADO | 2 | `collection-web-types.log`; não certificado pelo build web nem pela comparação focal |
| PostgreSQL/multiprocessos, provider real, navegador/mobile, save real | NÃO EXECUTADO | — | Fora das verificações autorizadas; sem alegação de homologação operacional |

A comparação usa o checker existente de `imob-property-provider-failure-2026-11-16/typecheck-deltas.mjs`, adaptado aos caminhos alterados, e HEAD virtual sob as mesmas opções, sem checkout. A primeira comparação encontrou três diagnósticos novos em testes; foram corrigidos e a comparação final mostrou zero introduzidos. A tipagem oficial API encontrou um literal de mensagem estreito demais no novo fallback, corrigido e revalidado com exit 0. Os dois erros `blockers` já aparecem na evidência histórica `intake-observability/preparation-typecheck.json`; o baseline atual confirma ambos. Diagnósticos de dependências permanecem preservados, não filtrados para aprovação.

### Falhas iniciais, cancelamentos e retomada

A primeira versão produziu 127 aprovados, 5 falhos e 53 cancelados (exit 1). Sua saída completa não foi preservada no primeiro retorno da ferramenta. A reprodução posterior do teste HEAD, carregado em memória contra a implementação, reproduziu exatamente 127/5/53: `collection-legacy-fixture-reproduction-final.log`.

As cinco falhas foram: paridade proprietário→imóvel; texto livre/lote; clarificação de unidades; unidade singular livre; reutilização da unidade singular. As fixtures antigas tratavam todo `intake` como `property_units`, inclusive a nova abertura `property_draft`; por isso não devolviam o contrato guiado. O teste raiz 133 aguardava essa abertura antes de liberar sua promessa de intake, resultando em `Promise resolution is still pending but the event loop has already resolved`; os 53 casos seguintes foram cancelados pelo runner. Isso não prova perda de WSL. As asserções legadas de unidade/lote continuam presentes, iniciadas pela entrada legada não exata; a paridade canônica usa agora o engine guiado real com dependências sintéticas e revisão explícita.

A revisão também encontrou uma lacuna real de transporte: abertura sem timeout/continuidade de referência. Ela foi corrigida com os testes focais e a regressão 197/197 acima. A execução intermediária 192/192 permanece evidência da versão anterior, sem substituir a execução atual.

Leituras de baseline/reprodução receberam `spawnSync git EPERM` dentro do sandbox; foram reexecutadas fora dele com autorização. Um primeiro loader de reprodução falhou antes dos testes, corrigido com loader assíncrono compatível. Logs dessas falhas foram preservados. As mensagens `Reconnecting /5` e `failed to load workspace requirements` foram relatadas pelo usuário; o workspace permaneceu acessível nas conferências. Não foi atribuída causa à extensão nem ao WSL, e não houve restart, reinstalação ou encerramento de processos alheios.

### Pendências e preservação

**Atomicidade entre processos NÃO COMPROVADA.** O código emprega transação e advisory lock PostgreSQL, mas o dublê transacional prova apenas sequência, consumo e guardas. Não foi iniciado PostgreSQL nem feito teste operacional. Não há prova de save real, provider real, navegador, mobile ou CI remoto. A tipagem focal/integral não está inteiramente aprovada. São limitações objetivas; o incremento permanece parcial.

`collection-results.json` reúne checkpoints, comandos/exit codes registrados, reaproveitamento, hashes de fontes, arquivos alterados, preservação e Git. Cada lote recente registra estado/resultado em `collection-<nome>.json` e log correspondente, para retomada sem duplicação. Não restaram processos desta execução ativos na conferência final. Helpers e logs exclusivos em `/tmp/imob-guided-*` foram mantidos intencionalmente como apoio de retomada/revisão, com lista no acompanhamento; não houve limpeza genérica.

CODEX.md, CLAUDE.md, changes.diff original e os dois artefatos pós-deploy preexistentes foram conferidos por SHA-256 e preservados byte a byte. As sete linhas preexistentes do Evidence Index foram mantidas; o novo registro foi somente acrescentado. Não houve stage, commit, push, PR, merge, deploy, download, instalação, chamada real de provider, migration ou escrita em banco operacional. P1ReconciliationRecurring e o diagnóstico de registry não foram reabertos.

### Fontes alteradas neste incremento

- `apps/api/src/orchestrator/llmExecutor.ts`
- `apps/api/src/routes/imob.ts`
- `apps/api/src/routes/imobCrmRouter.ts`
- `apps/api/src/services/imob/crm/imobCrmTurnEngine.ts`
- `apps/api/src/services/imob/imobAgentContract.ts`
- `apps/api/src/services/imob/imobChatConversationManagement.ts`
- `apps/api/src/services/imob/imobTurnResolver.ts`
- `apps/api/src/tests/imob-property-capture-intake.test.ts`
- `apps/api/src/tests/llm-provider-failure.test.ts`
- `apps/web/src/components/agents/chatLauncherEngine.ts`
- `apps/web/src/features/imob/persistence/imobPersistence.test.ts`
- `apps/web/src/features/imob/structured/ImobFrontDoorPart.tsx`
- `apps/web/src/features/imob/structured/createImobStructuredForms.test.ts`
- `apps/web/src/features/imob/structured/createImobStructuredForms.ts`
- `apps/web/src/features/imob/structured/types.ts`
- `apps/web/src/features/imob/structured/useImobFormState.ts`
- `apps/web/src/features/imob/structured/useImobFrontDoorForms.ts`
- `apps/web/src/pages/app/imob/propertyCreateForm.test.ts`
- `apps/web/src/pages/app/imob/propertyCreateForm.ts`
- `packages/contracts/src/imobPropertyCapture.ts`
- `packages/core/src/llm/completionEngine.ts`
- `packages/core/src/llm/types.ts`
- `packages/providers/src/AnthropicProvider.ts`
- `packages/providers/src/DeepSeekProvider.ts`
- `packages/providers/src/GeminiProvider.ts`
- `packages/providers/src/OpenAIProvider.ts`
- `packages/providers/tests/openai-provider-failure.test.ts`
- `apps/api/src/services/imob/intake/imobPropertyGuidedCapture.ts`
- `apps/api/src/tests/fixtures/imob/guided-property-capture.fixture.ts`


## Revisão do diff e validação transacional isolada — 2026-11-19

Status **PARCIAL**. Claude Code, sem subagentes. Checkout `EIAH_IMOB_ASSET_DESTINATION`, branch `chore/imob-intake-provider-diagnostics`, HEAD `f0da60cd2a8a1e8204ae25f33f1251ca2d665c0d`, stage vazio. Nenhuma fonte de produção foi alterada. Alterações desta etapa: o teste novo `apps/api/src/tests/imob-property-guided-admission.integration.test.ts` e esta seção. Não foi criado banco/container, não houve conexão a banco, migration, download, provider real, stage ou commit.

### Achados da revisão (estática + reprodução em dublê em memória, mesmo código de produção)

| ID | Severidade | Situação | Resumo |
| --- | --- | --- | --- |
| F-01 | Alta | Comprovado (dublê) | Sessão guiada ativa e abandonada trava o ator: `resolve-turn` não guiado responde 409 `IMOB_PROPERTY_CAPTURE_ACTIVE` (`routes/imob.ts:1730-1734`) sem TTL; outra origem (novo `formId`/aba) não consegue retomar nem cancelar (`imobPropertyGuidedCapture.ts:79-93,99`), e o cancelamento por outra origem responde `cancelled` sem encerrar a sessão aberta; `POST /properties` legado também é bloqueado (`withGuidedPropertySave`, linhas 259-264). O web não trata esse 409. |
| F-02 | Média | Comprovado (dublê) | `cancel`/`pause` com revisão antiga são descartados como sincronização (checagem de revisão, linhas 116-118, precede o cancelamento, linha 132). Com a interpretação em voo a revisão sobe e o cancelar da UI (que envia a revisão do snapshot) não cancela. |
| F-03 | Dúvida | Sem teste | Resposta da interpretação é descartada se qualquer sincronização alterar a revisão durante o transporte (linha 198): o consumo permanece (seguro), a proposta se perde. Decisão de UX. |
| F-04 | Dúvida | Lacuna | Salvamento agora roda dentro de transação interativa com advisory lock (default Prisma 5 s) e serializa todo `POST /properties` do ator, inclusive legado. Funcionamento coberto pelo teste 11; carga/timeout não. |
| F-05 | Lacuna de teste | — | O harness de rota injeta `hasActivePropertyCapture: async () => false`; o guard 409 e o filtro JSON do Prisma só passam a ter cobertura real no teste de integração (7b). |
| F-06 | Dúvida | — | Não há limite por ator: cancelar e abrir com novo `formId` cria nova sessão e nova interpretação (consistente com "por sessão"; o legado já era ilimitado). |
| F-07 | Dúvida | — | `rows()` lê todas as sessões do ator, sem retenção nem índice em `metadata`. |
| F-08 | Informativo | — | Gatilho do modo guiado é a frase exata "Cadastrar imóvel" (`chatLauncherEngine.ts`, engine, não o launcher). As 10 entradas legadas dos testes web passaram a "cadastrar um imóvel"; no teste de paridade, 3→2 e `property_units` 1→0 refletem o save guiado sem LLM. Sem asserção removida em testes de API/provedores. |

Confirmado sem defeito na revisão: escopo tenant/workspace/ator em toda consulta; sessão de outro ator/escopo não é encontrada; omissão de `sessionRef`/modo guiado não contorna a validação do save; admissão commitada antes do transporte; `retry` com `retries = 1` executa uma única tentativa (`retry.ts`, `i < retries`); `redirect: "error"` nos quatro adaptadores; sem fallback de modelo/provedor em `llmExecutor`; `git diff --check` limpo; `ChatAgentLauncher.tsx` sem alteração. Limites: revisão estática do diff, sem execução de navegador/provider/banco real.

Correção recomendada (não aplicada): F-01 — ação explícita de encerramento da sessão aberta do ator (sem exigir a origem), expiração server-side tratada como terminal, `hasActivePropertyCapture` ignorando expiradas, tratamento do 409 no cliente e cancelamento que devolva o estado real. F-02 — resolver `cancel`/`pause` antes da checagem de revisão. Testes que verificariam: teste 7d (hoje `todo`) e novos unitários no dublê; harness de rota com `hasActivePropertyCapture` real; teste web do 409; teste de expiração.

### Verificações desta etapa

| Validação | Resultado | Exit | Observação |
| --- | --- | --- | --- |
| Reprodução F-01/F-02 em dublê (script no scratchpad da sessão, fora do repositório) | APROVADO como reprodução (defeitos confirmados) | 0 | Sem banco/rede. |
| Typecheck oficial API (`pnpm --filter @eiah/api typecheck`), inclui o teste novo | APROVADO | 0 | 0 diagnósticos. |
| Controles negativos da guarda do teste novo (sem URL; banco não descartável; sem `EIAH_DISPOSABLE_INFRA`; host remoto) | APROVADO (4/4 recusados antes de qualquer conexão) | 1 em cada, esperado | Nenhuma conexão tentada. |
| Teste transacional real | NÃO EXECUTADO | — | Sem PostgreSQL descartável nem autorização (a versão atual tem 18 testes; ver a seção de 2026-11-19, etapa 2). |
| Suítes anteriores (197, 10, 2, 2, 19, 15) | Reaproveitadas, não reexecutadas | — | Fontes de produção inalteradas nesta etapa. |

### Validação transacional isolada — procedimento (aguarda autorização)

**Estado do ambiente (leitura apenas):** daemon Docker parado; `psql` 12 somente cliente (sem servidor nem pgvector); a infraestrutura descartável de 2026-11-14 não existe mais (scratchpad removido) e seus scripts apontam para esse caminho. `DATABASE_URL` não está definida neste shell. Recurso ausente: PostgreSQL 16 + pgvector descartável (as migrations criam a extensão `vector`).

**Destino proposto:** contêiner `pgvector/pgvector:pg16` (mesma imagem de `docker-compose.dev.yml`), `--tmpfs` no diretório de dados, publicado só em `127.0.0.1` numa porta livre, banco `eiah_logistica_core_imobguided_<hex>`, senha aleatória em arquivo `0600` fora do repositório. Alternativa: PostgreSQL 16 + pgvector compilado em diretório exclusivo, como em 2026-11-14.

**Prova de isolamento:** ambiente limpo (`env -i`); parser da URL (host `127.0.0.1`, porta exclusiva, prefixo do banco); no servidor, `select current_database(), inet_server_port()` iguais ao esperado e `\l` mostrando só o banco da tarefa; contêiner identificado por nome gerado e rótulo `eiah.task=imob-guided-it`; guarda do próprio teste (`assertDisposableDatabase`: host local + prefixo `eiah_logistica_core_` + `EIAH_DISPOSABLE_INFRA=1`) e os quatro controles negativos acima.

**Reutilizado:** `assertDisposableDatabase`, `openPgClient`, `seedScope` (`apps/api/src/tests/support/verticalEvaluationRealDb.ts`, sem alteração); padrão de concorrência por sessões PostgreSQL independentes e espera por consulta ao servidor de `vertical-evaluation.concurrency.integration.test.ts`; `prisma migrate deploy` do pacote `@repo/db`; implementação real `resolveImobPropertyGuidedCapture`/`withPropertyCaptureLock`/`withGuidedPropertySave`.

**Preparação (após autorização):**

```bash
S=<scratchpad da execução>; RUN=$(openssl rand -hex 4); NAME=eiah-imob-guided-it-$RUN; DB=eiah_logistica_core_imobguided_$RUN
PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1])')
umask 077; printf 'POSTGRES_PASSWORD=%s\nPOSTGRES_DB=%s\n' "$(openssl rand -hex 16)" "$DB" > "$S/it-$RUN.env"   # não imprimir
docker run -d --name "$NAME" --label eiah.task=imob-guided-it --env-file "$S/it-$RUN.env" \
  -p 127.0.0.1:$PORT:5432 --tmpfs /var/lib/postgresql/data:rw,size=512m pgvector/pgvector:pg16
until docker exec "$NAME" pg_isready -U postgres -d "$DB" -q; do sleep 1; done
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' "$S/it-$RUN.env"); URL="postgresql://postgres:$PW@127.0.0.1:$PORT/$DB"
env -i PATH="$PATH" HOME="$HOME" DATABASE_URL="$URL" pnpm --filter @repo/db migrate:deploy
```

**Execução** (exit capturado no mesmo shell, sem pipe):

```bash
env -i PATH="$PATH" HOME="$HOME" TZ=UTC LANG=C.UTF-8 DATABASE_URL="$URL" EIAH_DISPOSABLE_INFRA=1 \
  TSX_TSCONFIG_PATH=tsconfig.base.json NODE_ENV=test \
  node --import tsx --test --test-concurrency=1 --test-force-exit \
  apps/api/src/tests/imob-property-guided-admission.integration.test.ts > "$S/it-run.log" 2>&1; echo "exit=$?"
```

**Limpeza** (só o que a execução criou): `docker rm -f "$NAME"` (nome gerado; confirmar rótulo antes), `rm "$S/it-$RUN.env"`; a imagem só é removida se não existia antes e se isso for autorizado. Os dados somem com o `--tmpfs`. Nada em bancos ou volumes compartilhados é tocado.

**Fixtures sintéticas:** tenants/workspaces/usuários `ev-*` criados por `seedScope`; segundo workspace e quatro escopos no caso 8; imóvel `Rua Sintética, 100` no caso 11; resposta do provider = JSON fixo do dublê. Nenhum dado real.

**Casos e asserções esperadas (versão da etapa 1: 15 testes; superada pela lista de 18 testes da etapa 2 abaixo):** 0 equivalência da chave do lock; 1 duas instâncias concorrentes → 1 transporte; 2 repetição após consumo → 0 novos; 3 nova instância → consumo permanece; 4 falha após commit → consumo persistido, 1 transporte total; 5 timeout e resposta tardia → estado idêntico; 6 rollback real (escrita revertida, 0 transportes, admissão legítima depois ainda possível); 7a cancelar com transporte em voo → transporte já autorizado completa, resposta descartada, estado `cancelled`; 7b cancelar antes → 0 transportes; 7c concorrente → coerente em qualquer ordem; 7d `todo` (F-02, deve falhar hoje); 8 isolamento e lock por ator; 9 abertura repetida/concorrente → 1 linha; 10 lock livre no despacho; 11 salvamento atômico e sem duplicidade.

**Limites:** instâncias A/B/C são clientes Prisma com pools próprios no mesmo processo Node (sessões PostgreSQL distintas), não processos do SO; falha entre commit e despacho é simulada por exceção, não por kill; sem rota HTTP, provider real, navegador ou carga; ordem de fila do lock não é assumida; READ COMMITTED padrão. Atomicidade só pode ser declarada comprovada após a execução real e leitura do resultado.

**Ainda ausente:** servidor PostgreSQL 16 + pgvector descartável; imagem/daemon Docker (download e início do serviço dependem de autorização); registro de script `test:*:integration` no `package.json` (não feito: altera configuração); CI.


## Correção focal dos achados — 2026-11-19, etapa 2

Status **PARCIAL**. Claude Code, sem subagentes. Mesmo checkout, branch `chore/imob-intake-provider-diagnostics`, HEAD `f0da60cd2a8a1e8204ae25f33f1251ca2d665c0d`, stage vazio. Sem Docker, download, migration, banco, provider real, commit ou deploy. `ChatAgentLauncher.tsx` sem diferença (0 linhas de diff).

### Situação final dos achados

| ID | Situação | O que foi feito / evidência |
| --- | --- | --- |
| F-01 | **Corrigido** (dublê); PostgreSQL pendente | `openPropertyCapture` localiza a sessão aberta do ator; o 409 passa a informar `details.sessionRef`/`status` (`routes/imob.ts`). Recuperação explícita: `cancel`/`pause` com `sessionRef`, sem exigir origem nem revisão, validados no tenant/workspace/ator; a sessão nomeada é a única afetada, resposta = estado persistido, terminal é idempotente e nunca reaberto, consumo não é renovado. Cancelamento por outra origem só grava o encerramento daquela origem e avisa que o outro cadastro pendente não foi alterado. Cliente: aviso único com ação "Cancelar cadastro do imóvel" (sem LLM, sem retry, sem erro genérico). **Política de expiração: não existe uma aplicável** (`DRAFT_TTL_MS` é de rascunhos de contrato, outro mecanismo) — nenhum prazo foi inventado; decisão necessária do owner: TTL/expiração para sessões de cadastro guiado e seu valor. Retomar o cadastro em outra aba (adoção do rascunho) não foi implementado. |
| F-02 | **Corrigido** (dublê); PostgreSQL pendente | Cancelar/pausar por referência são resolvidos antes da checagem de revisão, não aplicam rascunho/origem enviados, são idempotentes e respeitam estados terminais. Antes da admissão: zero transporte. Depois: o transporte já autorizado completa (não é recolhido), a resposta tardia é descartada e o consumo permanece. Reprodução antes/depois: `C_staleCancel` passou de `active` ("repita sua escolha") para `cancelled`. |
| F-03 | **Corrigido** (dublê) | O resultado não é mais descartado por simples avanço de revisão: é aplicado se origem, rascunho, pulados, foco e fase são os da admissão e não há proposta pendente; do contrário a proposta é descartada com aviso e estado vigente, sem segunda interpretação. Dado confirmado pelo usuário no intervalo é preservado. |
| F-04 | **Esclarecido + ajuste demonstrado** | Alcance do lock: por tenant/workspace/ator. Dentro da transação: leitura das sessões, validação, `createProperty` (consulta de owner, insert, evento de auditoria, shadow `findMany`/`create`) e atualização da sessão — somente PostgreSQL, sem chamada externa. O trabalho desnecessário era o caminho **legado/lote sem sessão guiada**, que passou a tomar lock e transação por causa do incremento; agora retorna ao caminho anterior (sem lock/transação) quando não há sessão aberta nem referência. Mantida a atomicidade autorização+gravação+encerramento quando há sessão. Timeout do Prisma não foi alterado. Depende do teste PostgreSQL: duração real da transação, espera sob contenção (P2028) e o caso 11. |
| F-05 | **Coberto** com a implementação real, em dublê | O harness de rota executa `openPropertyCapture` real contra a persistência em memória: sessão ativa e pausada → 409 com referência e sem chamar LLM; recuperação autorizada → 200; sessão encerrada e outro escopo não bloqueiam. A cobertura do filtro JSON do Prisma e do lock real depende do teste PostgreSQL (casos 7b e 12). |
| F-06 / F-07 | **Registrado, sem alteração** | Sem limite por ator para novas sessões e sem retenção/índice para `MemoryEvent` de controle: dúvidas de custo/volume que exigem decisão de produto/armazenamento; fora do escopo desta correção. |
| F-08 | **Confirmado** | As 10 entradas legadas foram trocadas de "cadastrar imóvel" para "cadastrar um imóvel" porque a primeira frase agora abre o modo guiado; asserções legadas preservadas. Teste novo `F-08`: "cadastrar imóvel" abre o guiado (cobertura própria: 10+ testes guiados) e "cadastrar um imóvel" não faz nenhuma chamada guiada, continuando no caminho legado. |

### Resultados (executados nesta etapa)

Contagens = executados/aprovados/reprovados/cancelados/ignorados.

| Validação | Resultado | Exit | Contagens / observação |
| --- | --- | --- | --- |
| API intake (`imob-property-capture-intake.test.ts`) | APROVADO | 0 | 34/34/0/0/0 (26 anteriores + 8 novos: F-01 ×3, F-02 ×2, F-03, F-04, F-05) |
| Web formulários (`createImobStructuredForms.test.ts`) | APROVADO | 0 | 202/202/0/0/0 (197 anteriores + 5 novos: F-01 ×4, F-08) |
| Regressão API afetada (turn-engine sem DB, conversation-management, write-authorization, agent-contract, mutation-service, llm-provider-failure) | APROVADO | 0 | 48/48/0/0/0 |
| Persistência/histórico + formulário de criação | APROVADO | 0 | 34/34/0/0/0 (15 + 19) |
| Typecheck oficial API (inclui o teste de integração) | APROVADO | 0 | 0 diagnósticos |
| Typecheck web integral | REPROVADO (preexistente) | 1 | 63 diagnósticos; conjunto idêntico ao baseline registrado (`collection-web-types.log`), 0 introduzidos |
| Build web | APROVADO | 0 | — |
| Gates render-only / entrypoint / snapshot | APROVADO | 0 | `ok: true`, `violations: []` |
| Guarda do teste PostgreSQL (4 controles negativos) | APROVADO | 1 em cada, esperado | Recusados antes de qualquer conexão |
| Teste PostgreSQL (`imob-property-guided-admission.integration.test.ts`) | **NÃO EXECUTADO** | — | Preparado: 18 testes, 0 `todo`/`skip`. Exige infraestrutura descartável autorizada. |

Reaproveitados sem reexecução (arquivos e caminhos não alterados): intake guiado de provider/adaptadores (providers 2/2 e completion), contratos e builds de packages. Os dublês provam sequência, guardas e estados; **não provam atomicidade entre processos nem em PostgreSQL**.

Versão correspondente (SHA-256, 16 primeiros caracteres): `imobPropertyGuidedCapture.ts` cf63431000d59c88 · `imobChatConversationManagement.ts` fa22be82a61e5f28 · `routes/imob.ts` 89ec82de31a50aec · `useImobFrontDoorForms.ts` 2411def9919f5f3c · `types.ts` 83d7c47c8c4a84c0 · `imob-property-capture-intake.test.ts` 46e68692a6791bbb · `createImobStructuredForms.test.ts` 1659f270f0495301 · `imob-property-guided-admission.integration.test.ts` 8458bf606f326600. Outros arquivos tocados: `fixtures/guided-property-capture.fixture.ts` (inalterado nesta etapa).

### Procedimento transacional atualizado (próxima etapa)

Mesmo destino, preparação, execução e limpeza da seção anterior. Mudam apenas as expectativas: **18 testes** (0, 1–6, 7a, 7b, 7c ×2 — cancelamento por origem e por referência —, 7d, 8–13), **18 aprovados, 0 reprovados, 0 `todo`, `exit=0`**. 7d agora é executável (F-02). Novos: 12 (recuperação por referência, escopos alheios, ação atrasada) e 13 (F-03 com sincronização e mudança real durante o transporte); o caso 11 passa a provar que o salvamento legado sem sessão não espera o advisory lock (F-04). O teste continua com as limitações já descritas (instâncias no mesmo processo, falha simulada por exceção, sem HTTP/provider real).

### Pendências e limitações

Atomicidade transacional **NÃO COMPROVADA**; teste PostgreSQL não executado. Navegador/mobile, provider real, salvamento real e CI remoto não executados. Decisão pendente do owner: expiração de sessões guiadas (F-01) e política de volume/limite por ator (F-06/F-07). Adoção/retomada de uma sessão perdida em outra aba não existe (apenas descartar). O registro do teste em `package.json` segue não feito. Nenhum teste de gate foi alterado.


## Validação transacional em PostgreSQL descartável — 2026-11-19, etapa 3

Status **PARCIAL** (cenários executados abaixo; limites no fim). Claude Code, sem subagentes. Branch `chore/imob-intake-provider-diagnostics`, HEAD `f0da60cd2a8a1e8204ae25f33f1251ca2d665c0d`, stage vazio. Sem commit, deploy, provider real nem banco operacional. Decisão do owner mantida: **sem expiração automática**; recuperação por cancelamento explícito autorizado; sem recuperação integral do rascunho em outra aba.

### Ambiente isolado

- Docker iniciado pelo usuário (`sudo systemctl start docker`). O resultado do preflight de reinício **não foi fornecido antes** do início; ao iniciar, o contêiner preexistente `eiah-postgres` (`unless-stopped`, operacional, porta 5433) subiu sozinho e permaneceu intocado. Nenhum outro contêiner preexistente foi alterado.
- Imagem **já presente localmente** (sem download): `pgvector/pgvector:pg16`, id `sha256:9b05db12a354…`, digest `pgvector/pgvector@sha256:ccc6e83d6e35…` (criada 2026-08-13).
- Contêiner `eiah-imob-guided-it-2baabcb7` (id `f7363c8f06db…`), rótulo `eiah.task=imob-guided-it-2baabcb7`, `--restart=no`, rede bridge padrão, porta publicada **só em `127.0.0.1:38679`**, dados em `tmpfs`, 0 volumes/binds, sem privilégio, `cap-drop ALL` (+5 capacidades de inicialização do PostgreSQL), 1 GiB, credenciais sintéticas em arquivo `0600`, sem herdar `DATABASE_URL`/chaves (`env -i`). Banco `eiah_logistica_core_imobguided_2baabcb7`.
- Destino confirmado antes das migrations: `current_database()` esperado; mesmo `system_identifier` pelo contêiner e pela porta do host; um único banco de aplicação; versão 16.15; vector 0.8.6. Guarda do teste: `assertDisposableDatabase` + `EIAH_DISPOSABLE_INFRA=1`.

### Migrations

**Primeira tentativa: falhou** (exit 1, nada aplicado, 0 tabelas): o Prisma recusa `SHADOW_DATABASE_URL` igual ao banco principal; o shadow padrão de `prisma.config.ts` aponta para o `eiah-postgres` operacional, por isso foi sobrescrito. Diagnosticado antes de repetir. **Segunda tentativa: exit 0**, 36 migrations existentes aplicadas, 36 finalizadas, 0 falhas, 80 tabelas; o banco `shadow` não foi criado. Sem migration nova, sem alteração de migrations antigas, sem reset. Logs: `transactional-migrations.log`.

### Testes (`imob-property-guided-admission.integration.test.ts`)

Execução 1 e execução 2 (a segunda após acrescentar o registro de espera pelo lock ao harness): **21 testes, 21 aprovados, 0 reprovados, 0 cancelados, 0 ignorados, 0 todo; exit 0 em ambas** (`transactional-run-1.log`, `transactional-run-2.log`). Observações do servidor (`pg_locks`) de sessões esperando o advisory lock em cada sincronização: `[1,1,2,1,2,1,2,1,2]`, máximo 2. Ao final: 0 conexões restantes, 0 deadlocks, 0 locks advisory pendentes.

Garantias demonstradas neste ambiente (cenários executados): uma única admissão entre duas instâncias concorrentes na mesma sessão; repetição, nova instância e abertura repetida/concorrente sem renovação; falha após o commit da admissão (simulada por exceção) e timeout/resposta tardia sem nova tentativa e sem alteração de estado; rollback real de escrita dentro da transação sem transporte e sem consumo; transação encerrada antes do transporte (advisory lock livre no despacho); cancelamento antes/depois da admissão e concorrente (por origem e por referência com revisão antiga) coerente com a ordem transacional; recuperação por `sessionRef` sem origem com escopo validado, ação atrasada sem atingir cadastro novo; cancelar/pausar idempotentes e sem aplicar rascunho antigo; proposta preservada em sincronização sem mudança e descartada em mudança incompatível; isolamento tenant/workspace/ator, inclusive o lock por ator; salvamento guiado atômico (falha após inserção reverte imóvel e sessão; reenvio não duplica).

### Corrida F-04 (save legado × abertura guiada)

**Contrato definido antes do resultado:** P1 ponto de autorização do save legado = leitura de sessão aberta em `withGuidedPropertySave` (snapshot READ COMMITTED, sem lock); P2 abertura confirmada antes dessa leitura bloqueia o legado; P3 abertura confirmada entre a leitura e a gravação deve resultar em ordem serial válida; P4 depois de a sessão ser visível, todo novo save legado é bloqueado e a sessão/consumo não são afetados.

**Resultado:** com sincronização controlada e conexões independentes (L pausado depois da autorização e antes da gravação; abertura confirmada; L liberado), a linha do tempo foi: leitura de L viu 0 sessões → abertura confirmada (sessão `active`, 0 imóveis) → gravação de L confirmada (txid da gravação > txid da sessão). Estado final igual ao da execução serial (legado, abertura) em outro escopo (1 imóvel; sessão `active`, `available`, revisão 0); o save legado não consumiu nem alterou a sessão (P3 ✔). Depois da sessão visível o novo save legado foi bloqueado, 0 imóveis a mais (P2/P4 ✔); sessão `paused` também bloqueia. Corrida livre (12 rodadas, duas instâncias): 12/12 com legado criado e sessão intacta; **o desfecho "legado bloqueado" não ocorreu organicamente** (coberto só de forma determinística em 14b). **Conclusão:** não há contorno da proteção nem desfecho fora de ordem serial; o save legado concorrente é linearizável e não ganha capacidade que não teria sem a sessão. **Observação não asserida (decisão do owner):** nesse intervalo o imóvel legado é confirmado enquanto há sessão guiada aberta, ou seja, o invariante forte "nenhum save legado confirma com sessão aberta" **não** vale desde a otimização do caminho legado (etapa 2). Se o owner o exigir, a menor correção é voltar o caminho legado a tomar o advisory lock e reler as sessões dentro dele antes de gravar (custo: serialização/transação para todo save legado do ator). Nenhum código de produção foi alterado nesta etapa.

### Alterações no harness

Teste 11: removido o requisito "o save legado não espera o lock" (substituído por criação legada funcional sem sessão aberta); acrescentados 14a/14b/14c (F-04) e o registro `LOCK-WAIT-EVIDENCE`; asserções de comportamento mantidas. Nenhuma alteração em produção, migrations, gates ou dependências.

### Limites e limpeza

Dois clientes Prisma com pools próprios no **mesmo processo Node** (sessões PostgreSQL distintas) — **não** são dois processos do sistema operacional. A falha entre commit e transporte e a falha do transporte foram **simuladas por exceção/promessa**, não por interrupção real de processo. Sem rota HTTP, provider real, navegador/mobile, staging ou CI remoto; sem mutação do código para provar sensibilidade dos testes. Atomicidade comprovada apenas nos cenários acima, em PostgreSQL 16.15, nível READ COMMITTED.

Limpeza: removidos somente o contêiner `eiah-imob-guided-it-2baabcb7` e os arquivos de credencial; verificação posterior: 0 contêineres/rótulos remanescentes, porta liberada, 18 contêineres e 95 volumes como antes, `eiah-postgres` ativo e intocado, imagem preservada. O Docker permaneceu ativo (iniciado pelo usuário; não foi parado globalmente). Logs sanitizados preservados em `transactional-*.log` e `transactional-environment.txt`; temporários da sessão permanecem no scratchpad.

## Validação integrada no navegador — 2026-11-19, etapa 4

Frontend real (Vite) → rotas HTTP reais da API (`app` de `apps/api/src/index.ts`, `NODE_ENV=test`, sem workers/filas) → PostgreSQL descartável (contêiner próprio, 36 migrations). **Somente o transporte do provider é simulado** e cada requisição é contada. Aprovação desta etapa = integração local com provider simulado; **não** é homologação com provider real nem staging. Chromium 149.0.7827.55 (Playwright headless); desktop 1280×900; mobile **emulado** (390×844, `isMobile`+toque, não é aparelho físico).

### Decisão F-04 (aceita pelo owner nesta etapa)
O ponto que **permite concluir** um save legado é a leitura de autorização em `withGuidedPropertySave`. Sessão guiada confirmada **antes** dessa leitura bloqueia o save legado; um save legado **já autorizado** pode concluir depois de uma abertura guiada concorrente; novas autorizações ficam bloqueadas enquanto houver sessão aberta. O invariante forte ("nenhum save legado confirma com sessão aberta") **não** é afirmado e **não** foi imposto: nenhum código de produção foi alterado para isso.

### Correções do harness (sem alteração de produção)
- `QA_ONLY`: o `env -i` do `run-spec.sh` descartava a variável (execução anterior rodou todos os cenários, ver "Execuções não válidas"). Agora é repassado explicitamente; o spec valida o filtro **antes** de abrir banco/navegador (id desconhecido, vazio ou repetido → exit 2, nada executado) e confere ao final que os cenários executados são exatamente os pedidos (senão exit 3). Verificado: `zzz`, vazio, `5e,5e`, `5e,9` → exit 2 e nenhuma linha no log do provider; `QA_ONLY=5e` executou só o 5e.
- Simulador de provider (`imobGuidedBrowserHarness.ts`): contratos **diferenciados** e restritos aos usados — (1) `POST /v1/chat/completions` com a mensagem de intake igual ao fixture → proposta determinística; (2) `POST /v1/responses` com `text.format.name = "imob_semantic_intent"` → **abstenção** válida pelo schema estrito (`needsClarification: true`, sem entidade/ação), formato Responses API (`output[].content[].output_text`); o simulador não inventa classificação, o produto segue o caminho documentado de `parser_fallback`. Tudo o mais (outro host/caminho/método, texto sem fixture, `/v1/responses` de validação de anexos ou intake de unidades) → **HTTP 501** explícito, registrado como `unsupported`; cada cenário passa a ter a verificação "nenhuma requisição fora dos contratos". O corpo do 501 não imita resultado do produto. Autoverificação na subida (7/7): host externo bloqueado, chat 200, intent 200 e formato, `/v1/responses` outro 501, texto sem fixture 501. Bloqueio de chamadas externas preservado (conexão TCP não loopback recusada e registrada; navegador só libera loopback).
- Spec: menu real (itens do menu lateral são `role="menuitem"`), ação "Imóveis → **Captar imóvel**" (única do grupo que chama `resolve-turn` não guiado; Editar/Arquivar/Anexar/Tokenização não chamam), contagem separada de interpretação guiada × classificador, verificações de escopo.
- Incidente anterior (registrado na etapa): 3 requisições reais a `api.openai.com` (HTTP 401, chave e texto sintéticos) antes de o bloqueio passar para o nível de rede; log preservado em `browser-integrated-2026-11-19/incident/api-incident-real-openai-calls.log` (sem credenciais; `*.log` exige `git add -f`).

### Resultado da rodada válida (`browser-integrated-2026-11-19/run-valid/`, tenant sintético novo, 0 imóveis na partida)

| Cenário | Resultado | Verificações |
|---|---|---|
| 1 Abertura | **REPROVADO** | 5/6 — falha: sem controle "Continuar sem IA" (P-01) |
| 2 Proposta inicial (IA simulada) | APROVADO | 7/7 — exatamente 1 invocação; confirmar aplica 1×; "sim" repetido não reaplica |
| 3 Coleta, um campo por vez | APROVADO | 14/14 — zero/pular/retomar/corrigir/inválido/ambíguo sem modelo |
| 4 Revisão e bloqueio sem obrigatórios | APROVADO | 7/7 — formulário completo só na revisão; servidor rejeita save sem obrigatórios mesmo com UI contornada |
| 6 Salvamento integrado | APROVADO | 7/7 — 201; linha no banco com valores/tenant/workspace; sessão `saved`; replay rejeitado 400 |
| 5a Reload | APROVADO | 6/6 |
| 5b Pausa/retomada | APROVADO | 3/3 |
| 5c Cancelar com revisão antiga; ação antiga × cadastro novo | APROVADO | 5/5 |
| 5d Resposta tardia | APROVADO | 5/5 |
| 5e Aba/origem perdida | **REPROVADO** | 11/12 — falha: abertura guiada em nova aba sem saída (P-02); 409, aviso, cancelamento explícito e escopo passaram |
| 7 Desktop + mobile (emulação) | APROVADO | 14/14 |

**11 cenários: 9 aprovados, 2 reprovados, 0 bloqueados, 0 não executados** (os mesmos 2 reprovados de `spec-4-partial/`, 9/11, preservado). Exit 1 (por P-01/P-02, defeitos de produto; não são falhas de harness). **Provider simulado: 4 interpretações guiadas (chat completions) + 1 consulta do classificador (`/v1/responses`, abstenção); 0 requisições não suportadas.** Tráfego externo: backend 0 bloqueios; navegador bloqueou 10 requisições a `fonts.googleapis.com` (nenhuma liberada). Zero `pageerror` nas duas viewports do cenário 7 (as demais abas não tiveram essa verificação).

**Persistência antes/depois do save explícito:** antes do save, sessão ativa e 0 imóveis (UI e servidor recusam save sem obrigatório: 400 ×2 sem criar imóvel); duplo clique → 1 POST (201), 1 imóvel (o segundo clique não gerou requisição; **não** se presume idempotência do servidor); depois: 1 imóvel com `apartamento`, Itajaí, `Rua Sintética, 100`, 2 quartos, 0 banheiros, 1 vaga, 85 m², tenant/workspace corretos; replay HTTP do mesmo save → 400 `IMOB_PROPERTY_GUIDED_INVALID`, sem duplicar. Mobile salvou o 2º imóvel (201). Estado final do banco da rodada: 2 imóveis.

**Cenário 5e — o que foi e o que não foi provado.** Provado: 409 `IMOB_PROPERTY_CAPTURE_ACTIVE` em ação IMOB não guiada ("Captar imóvel") com aviso e botão "Cancelar cadastro do imóvel"; o caminho do 409 não chama nenhum modelo (provider e classificador inalterados); nada é cancelado automaticamente; outro usuário do mesmo workspace com a referência da sessão do dono **não** a cancela (HTTP 200 sem efeito; sessão segue `active` no banco) e sem credencial a referência não opera; o titular cancela por referência (sem origem) e fica liberado — nova ação IMOB deixa de dar 409. **Não implementado:** recuperação integral do rascunho entre abas (o rascunho da sessão cancelada não é restaurado) e expiração automática (decisão do owner). Escopo entre tenants não exercitado (um tenant): NÃO verificado.

### Achados de produto (evidência; nada corrigido nesta etapa)

| Id | Achado | Evidência | Correção mínima proposta (não aplicada) |
|---|---|---|---|
| P-01 | A abertura instrui "…ou escolha Continuar sem IA", mas não há controle clicável; só o comando digitado funciona | cenário 1, `01-abertura.png`; check reprovado | Exibir "Continuar sem IA" como ação rápida na abertura (componente guiado em `ImobFrontDoorPart`; sem lógica no `ChatAgentLauncher`) ou ajustar o texto para "digite Continuar sem IA" |
| P-02 | "Cadastrar imóvel" em aba nova com sessão aberta de outra origem devolve 200 `clarify`, `guided: null`, "Esta sessão ou revisão não está vigente…"; o cliente mostra "Não consegui confirmar a abertura… Tente novamente" (repetir dá o mesmo resultado, sem ação de recuperação nem `sessionRef`) | cenário 5e, `13-abertura-em-nova-aba.png`, `diagnostics/inicio-guiado-outra-origem.txt` | No início guiado com outra sessão aberta, responder o mesmo 409 `IMOB_PROPERTY_CAPTURE_ACTIVE` com `details.sessionRef`, para reaproveitar o aviso e a ação já implementados (a viabilidade no caminho de início deve ser confirmada no código antes) |
| P-04 | O guard 409 de sessão aberta precede o ramo `claimOnly`, que é somente leitura e nunca escreve. Entradas realmente reivindicadas pelo IMOB deixam de ser reivindicadas enquanto houver sessão aberta; o cliente engole o erro do claim (`useImobFrontDoorForms.ts:727`, `if (options?.claim) return false`) e o Front Door segue o roteamento local, sem aviso | `diagnostics/claim-com-e-sem-sessao.txt`: "Isso já contratou o Marketing?" → sem sessão `claimed:true` (`agent_engagement`); com sessão 409; após cancelar `claimed:true` de novo. "Quero divulgar este apartamento do Batel." idem (`request_capability`) | Condicionar o guard a `body.claimOnly !== true` (o claim retorna antes de qualquer escrita; turnos não guiados continuam bloqueados). Teste a acrescentar: claim reivindicável com sessão aberta → 200 `claimed:true`; turno não claim → 409. Contrato esperado (comentário de `routes/imob.ts` e P11): `claimOnly` só responde `claimed:true/false`, sem efeitos |
| D-ROUTING-01 | "quero ver meus imóveis" recebe "Isso parece um caso jurídico." | Origem: roteamento local preexistente — `legalContextResolver.isLegalRoutingQuestion` casa "imóveis" e `isImobOperationalRequest` não reconhece "ver/listar"; o claim do IMOB é transversal e devolve `claimed:false` **com e sem** sessão (a hipótese anterior P-03, de que o 409 do claim causava a resposta jurídica, foi **retirada**). Não é provider, fixture nem fallback do harness (0 chamadas ao provider no turno) | Fora do escopo; requer decisão do owner (detector de consulta de imóveis no IMOB ou restringir a heurística jurídica). **Sem asserção que aceite a resposta**; registrado só como divergência em `results.json` (`divergences`), separada da aprovação do 5e |

Observação do item de claim: o efeito de P-04 no cliente **dentro** de uma coleta guiada ativa na mesma aba (o turno digitado vai para a coleta, não para o claim) não foi exercitado: NÃO verificado.

### Execuções não válidas ou descartadas (preservadas)
- `invalid-run-5e/` + `spec-5e.log`: execução **inválida para conclusão funcional**. `QA_ONLY=5e` rodou **todos** os cenários (o `env -i` descartou a variável) sobre banco já sujo por execuções anteriores; os "reprovados" dela são artefato de estado. Não use como evidência de comportamento.
- `aborted-5e-iterations/`: 6 execuções do 5e abortadas durante o ajuste do **próprio spec** (seletor do menu `button`→`menuitem`, ação "Editar imóvel" que não chama `resolve-turn`, `/v1/responses` ainda não suportado pelo simulador). Contêm só resultados/trace e logs, sem conclusão funcional.
- `spec-4-partial/`: resultado parcial anterior, 9/11, preservado.

### Arquivos desta etapa
Novos (não rastreados): `apps/api/src/tests/support/imobGuidedBrowserHarness.ts`, `scripts/qa/imob-guided-browser.mjs`, esta pasta `browser-integrated-2026-11-19/`. Sem alteração em código de produção nesta etapa. Scripts de diagnóstico em `diagnostics/`.

### Limites
Provider **simulado** (nenhum real); mobile é emulação de viewport; Vite dev (não build de produção); API em `NODE_ENV=test` sem workers/filas; um tenant; saída `diagnostics/menu-imoveis-acoes.txt` só cobre o grupo "Imóveis". Status: **PARCIAL** (9/11; 2 reprovações são defeitos de produto reportados).

## Correção focal de P-01, P-02 e P-04 — 2026-11-19, etapa 5

Autorizada pelo owner. Reutiliza contratos, componentes, handlers e testes existentes; sem subagentes, commit, push, PR, deploy ou provider real (simulado, tráfego externo bloqueado). **A decisão F-04 segue aceita e inalterada**; o roteamento jurídico de "quero ver meus imóveis" **não foi corrigido** (D-ROUTING-01 segue documentada e sem asserção que a aceite). Evidências em `browser-integrated-2026-11-19/stage5-fixes/` (`run-valid/`, `unit-and-gates/`, `focused-iterations/`).

### O que o código mostrou antes de mudar
- **P-01:** o servidor já envia `propertyGuided.quickReplies` (`["Continuar sem IA","Revisar cadastro","Cancelar cadastro do imóvel"]` na fase `start`, `imobPropertyGuidedCapture.ts` `present()`), mas mensagens `imobStructured` são desenhadas por `ImobFrontDoorPart`, que só renderizava `message.quickReplies` (nunca preenchido no fluxo guiado). Os chips do snapshot (`toLauncherMessage`) só valem para mensagens sem `imobStructured`.
- **P-02:** `imobPropertyGuidedCapture.ts`, caminho `start`/recuperação: com sessão aberta de **outra origem** devolvia `invalid()` (200 `clarify`, sem referência); a **mesma origem** já retomava (`policy.opening` + sync). O 409 existia só no guard da rota (turnos não guiados).
- **P-04:** o `claimOnly` executa somente `resolveImobTransversalTurnStage` (documentado e testado como somente leitura, P11); nada nele referencia o armazenamento da sessão (`property.capture.session.v1`), que só o motor guiado escreve. Não verifiquei se a consulta com caso vinculado grava eventos append-only de auditoria/telemetria; isso não toca a sessão. Os ramos `property_draft` e `property_units` vêm **antes** do ramo de claim e chamam provider; por isso a isenção do guard vale só para quem realmente chega ao claim. Na interface, durante coleta guiada ativa o launcher chama `consume("continue")` primeiro (`chatLauncherEngine.ts` ~2171) e o texto é consumido pela coleta: **nenhum claim é emitido** nessa aba; o claim só ocorre sem contexto guiado na aba (origem perdida).

### Alterações (hunks desta etapa; o diff contra HEAD dos arquivos é cumulativo com etapas anteriores)
| Arquivo | Mudança |
|---|---|
| `apps/api/src/services/imob/imobChatConversationManagement.ts` | `PropertyCaptureActiveError` + `propertyCaptureActiveBody()`: um só formato do 409 `IMOB_PROPERTY_CAPTURE_ACTIVE` (`details: {sessionRef, status}`), usado pelo guard e pelo motor |
| `apps/api/src/services/imob/intake/imobPropertyGuidedCapture.ts` (não rastreado) | `start`/recuperação sem referência com sessão aberta de outra origem → `conflict` na admissão, lançado **depois** do commit da transação (nada escrito); mesma origem continua retomando |
| `apps/api/src/routes/imob.ts` | (P-04) `reachesClaimBranch = claimOnly === true && intake ∉ {property_draft, property_units}` isenta do guard só o claim; (P-02) `try/catch` do `property_draft` mapeia o erro do motor ao 409 pelo mesmo `propertyCaptureActiveBody`. Autenticação, entitlement, papel (`imob.chat.use`) continuam antes |
| `apps/web/src/features/imob/structured/useImobFrontDoorForms.ts` | (P-01) `structuredForms.selectGuidedReply()`: só aceita resposta que o servidor ofereceu para o estado atual; mesmo comando canônico do texto digitado; ecoa a escolha. (P-02) `startGuidedProperty`: em `CaptureRecoveryOffered` remove o marcador "Abrindo o cadastro…" em vez de exibir erro genérico |
| `apps/web/src/features/imob/structured/ImobFrontDoorPart.tsx` | (P-01) renderiza os replies do servidor como botões nativos na abertura (`isLast`, fase `start`, ativo, sem proposta), reutilizando o bloco de quick replies |
| `ChatAgentLauncher.tsx` | **não alterado**; gate `check:chat-launcher-render-only` exit 0, 0 violações |

### Testes: vermelho antes, verde depois (exit capturado no mesmo shell; logs em `unit-and-gates/`)
| Validação | Resultado | Exit | Contagens |
|---|---|---|---|
| API intake, linha de base (`baseline-api-intake.log`) | APROVADO | 0 | 34/34 |
| API intake, 4 testes novos **antes** da correção (`red-api-intake.log`) | REPROVADO como esperado | 1 | 4 executados: 3 reprovados (P-04 claim 409; P-02 ×2 início de outra origem 200), 1 de preservação aprovado |
| API intake depois (`green-api-intake.log`) | APROVADO | 0 | **38/38** (34 + 4; o teste 19 existente e o F-01 passaram a afirmar o conflito em vez do 200 sem referência — mudança de contrato por decisão, não enfraquecimento) |
| Web forms, linha de base | APROVADO | 0 | 202/202 (1ª tentativa falhou só por tsconfig errado para o alias `@/`; log preservado) |
| Web forms, 6 testes novos **antes** (`red-web-forms.log`) | REPROVADO como esperado | 1 | 6 executados: 3 reprovados (P-01 ×2: sem botão/sem `selectGuidedReply`; P-02: erro genérico), 3 de caracterização (mesma origem retoma; P-04 mesma aba; P-04 aba sem contexto) aprovados |
| Web forms depois (`green-web-forms.log`) | APROVADO | 0 | **208/208** |
| PostgreSQL real (`green-pg-integration.log`) | APROVADO | 0 | **22/22** (21 anteriores, o 12 adaptado ao conflito, + o 15 novo: conflito com referência do servidor restrito ao escopo, mesma origem retoma, outro usuário/tenant sem conflito nem vazamento, pausada, referência antiga não cancela a sessão posterior). Rodado porque o motor guiado mudou; a falha antes da correção foi demonstrada no teste de rota (o 15 não foi executado contra o código antigo) |
| API P11 real (`marketplace.installations.activate`) / bridge | APROVADO | 0 / 0 | 32/32 · 28/28 (claim real com banco; sem regressão) |
| Web: imobPersistence / propertyCreateForm / chat.assistantDedupe | APROVADO | 0 | 15/15 · 19/19 · 13/13 |
| Gate `check:chat-launcher-render-only` | APROVADO | 0 | 0 violações |
| Gates `check:evidence-index` / `check:docs-link-integrity` (executados **depois** de atualizar este README e o índice) | APROVADO | 0 / 0 | 8/8 testes e 1003 referências verificadas · `ok: true`, 29 arquivos (`gate-evidence-index.log`, `gate-docs-link.log`) |
| Typecheck oficial da API (`pnpm --filter @eiah/api typecheck`, `tsconfig.build.json`) | APROVADO | 0 | 0 diagnósticos (essa configuração **exclui testes**) |
| Typecheck da API incluindo testes (`tsconfig.typecheck.json`) | **REPROVADO** | 2 | 297 diagnósticos, **0 nos arquivos desta etapa**; os demais são de testes que não alterei |
| Typecheck web (`tsc -p apps/web/tsconfig.json`) | **REPROVADO** | 2 | 63 diagnósticos, **0 nos arquivos desta etapa** (ex.: `useImobFormState.ts:173` `Object.hasOwn`/lib, linha que não alterei); essa configuração exclui `*.test.ts(x)`, então os testes web novos **não** passam por typecheck |

Os 3 typechecks reprovados não são declarados aprovados: a ausência de diagnósticos nos arquivos alterados não equivale a typecheck integral. Não comparei com um baseline do HEAD (sem worktree); a atribuição "preexistente" se apoia em arquivos/linhas que não foram modificados.

### Navegador (rodada completa em tenant sintético novo, 0 imóveis na partida; `run-valid/`)
**13 cenários: 13 aprovados, 0 reprovados, 0 bloqueados, 0 não executados; exit 0.** Contexto: Chromium 149, desktop 1280×900, mobile **emulado** 390×844, Vite dev + API `NODE_ENV=test` + PostgreSQL descartável. Provider simulado: **4 interpretações guiadas, 1 consulta do classificador (abstenção), 0 requisições não suportadas**; tráfego externo: backend 0 bloqueios, navegador 16 requisições a `fonts.googleapis.com` bloqueadas (nenhuma liberada).
| Cenário | Resultado | Checks |
|---|---|---|
| 1, 2, 3, 4, 6 | APROVADO | 6/6 · 7/7 · 14/14 · 7/7 · 7/7 (o 1 agora passa: botão "Continuar sem IA" visível) |
| **1b P-01** clique, teclado Enter, teclado Espaço, mobile (toque) | APROVADO | 18/18: botão visível na abertura, formulário completo ausente, provider 0, comando `collect` determinístico, sessão `collecting`/`declined`, ação deixa de ser oferecida; mobile: botão dentro do viewport, alvo ≥ 40 px |
| 5a, 5b, 5c, 5d | APROVADO | 6/6 · 3/3 · 5/5 · 5/5 |
| **5e P-02** | APROVADO | 13/13: "Cadastrar imóvel" em aba nova com sessão de outra origem → 409 do servidor, aviso "pendente em outra aba" com "Cancelar cadastro do imóvel", sem "Não consegui confirmar…" nem marcador; nada cancelado automaticamente; escopo (outro usuário e sem credencial não operam a referência); cancelamento explícito; novo início abre sessão distinta e a referência antiga não a cancela |
| **5f P-04** | APROVADO | 9/9: (A) coleta ativa na mesma aba: nenhum claim emitido, texto segue para a coleta com retorno visível, mesma sessão/campo confirmado, 1 sessão aberta; (B) aba sem contexto: 200 `claimed:true` (`agent_engagement`) com sessão aberta, resposta e cartão exibidos, sem aviso, sessão idêntica, provider/classificador 0; (C) ação IMOB não guiada do menu continua com 409, aviso e cancelamento explícito |
| 7 | APROVADO | 14/14 |

Divergência D-ROUTING-01 mantida em `results.json` (`divergences`); nenhuma asserção a aceita.

### Limitações
- O teste de rota do P-04 stuba o estágio transversal; o estágio real é coberto por P11 (32/32) e pelo navegador (claim real `claimed:true`).
- P-04 com captura **pausada** na mesma aba e o efeito do claim com caso vinculado (auditoria/telemetria) não foram exercitados.
- Os botões aparecem só na fase de abertura (`start`); nas demais fases os comandos seguem por texto (fora do escopo pedido). "Revisar cadastro" e "Cancelar cadastro do imóvel" também aparecem na abertura porque são os replies que o servidor oferece; o formulário completo só abre se o usuário escolher revisar.
- Um tenant; mobile é emulação; Vite dev; provider simulado; sem staging/CI remoto.
- Execuções focadas intermediárias (`focused-iterations/`): 1ª com texto esperado errado no 5f ("Ainda não") e ausência do menu IMOB na aba EIAH; contadores do harness são cumulativos desde o início do processo (por isso reiniciei o harness para a rodada válida).

### Limpeza
Parados só os processos desta validação (API do harness e Vite, identidade conferida por pid/linha de comando/porta); `cleanup.sh` inspecionado antes (remove o contêiner somente se rótulo e nome conferem, e `it.env`/`dburl.txt`) e executado (exit 0): contêiner `eiah-imob-guided-br-7e7964a0` removido; manifestos com tokens (4 cópias) removidos manualmente; 0 arquivos com credenciais restantes; portas liberadas; Docker global e `eiah-postgres` intocados (18 contêineres e 95 volumes como antes). Preservados: esta evidência sanitizada e o scratchpad (logs sem credenciais). Stage vazio; sem commit.


## Revisão do diff consolidado e preparação do commit — 2026-11-19, etapa 6

Sem produção alterada, sem stage/commit/push/deploy, sem provider real. Preflight: diretório `EIAH_IMOB_ASSET_DESTINATION`, branch `chore/imob-intake-provider-diagnostics`, HEAD `f0da60cd2a8a1e8204ae25f33f1251ca2d665c0d`, stage vazio; `CLAUDE.md`/`CODEX.md`/`AGENTS.md` lidos (sha256 iniciais `66c82eb6…`, `2cad8b66…`, `ddacad34…`; os dois primeiros conferidos de novo no fim, inalterados). Evidências desta etapa em `stage6-review/`.

### Achados
**Impede o commit (1)**
| Id | Referência | Evidência e impacto | Menor correção (não aplicada) |
|---|---|---|---|
| B1 | `apps/api/src/tests/marketplace.installations.activate.test.ts` × `.github/workflows/ci.yml` (job W4, banco `eiah_ci`, sem `EIAH_DISPOSABLE_INFRA`) | Incompatibilidade entre o teste novo de P-04 (com `assertDisposableDatabase()`) e o ambiente do W4. **Resolvido localmente na etapa 7** (corrigido e validado por execução; ver seção abaixo) | Aplicada: arquivo de integração dedicado, guarda preservada, passo no job `logistica_core_integration` do CI |

**Não bloqueantes**
| Id | Sev. | Referência | Situação / impacto | Menor correção |
|---|---|---|---|---|
| S1 | Média | `chatLauncherEngine.ts:2151-2155` + `useImobFrontDoorForms.ts:477` | Captura **pausada** na mesma aba: digitar "Cadastrar imóvel" é consumido **sem chamada ao servidor e sem mensagem** (o início ignora o retorno `false` de `consume`). Evidência: `explore-paused-same-tab.log` | Só tratar como consumido se `consume(...) !== false`, ou responder no motor com orientação ("há um cadastro pausado: continue ou cancele") |
| S2 | Média | `useImobFrontDoorForms.ts:477`, `chatLauncherEngine` claim | Pausada na mesma aba, texto reivindicável não gera claim (cai no roteamento local); sessão e rascunho intactos (teste de invariantes) | Avaliar claim quando o formulário está pausado |
| S3 | Média | `imobCrmRouter.ts:413-419`, `imobPropertyGuidedCapture.ts:287-296` | Com **qualquer** sessão guiada aberta (sem TTL, decisão do owner) todo save legado/lote do ator volta 400 `IMOB_PROPERTY_GUIDED_INVALID` ("Reabra a revisão vigente…"), inclusive em telas legadas sem aviso de recuperação; como a UI legada exibe esse 400 **não foi verificado**. Coerente com F-04 aceito | No caminho legado, responder o 409 `IMOB_PROPERTY_CAPTURE_ACTIVE` com `sessionRef` (mesmo contrato) |
| S4 | Baixa | `imobPropertyGuidedCapture.ts:210-212` e `:239` | Qualquer exceção na admissão vira "indisponível" sem log/observabilidade | `deps.observe` com classe do erro (sem conteúdo) |
| S5 | Baixa | `AnthropicProvider.ts`, `DeepSeekProvider.ts`, `GeminiProvider.ts` (construtor `transport = fetch`) | O `fetch` global é capturado na construção; substituição posterior (teste/instrumentação) não é mais vista. Providers são singletons lazy; nenhum teste atual depende disso | `transport = (...a) => fetch(...a)` |
| S6 | Baixa | `package.json`, `.github/workflows/ci.yml` | `imob-property-guided-admission.integration.test.ts` e o spec de navegador **não estão registrados** em script nem CI (precisam de infraestrutura descartável); `imob-property-capture-intake` e `createImobStructuredForms` aparecem em `package.json` (1 ocorrência cada), sem workflow direto | Registrar scripts `:integration` explícitos |
| S7 | Processo | `.gitignore:17` (`*.log`) | 88 arquivos de evidência novos são `*.log` ignorados; o Índice os referencia, então precisam de `git add -f` (precedente: 124 logs já rastreados) | Ver seleção |
| S8 | Info | `apps/web/tsconfig.json` | Exclui `*.test.ts(x)`; os testes web só passam por typecheck na configuração focal desta etapa (369 diagnósticos preexistentes, nenhum introduzido) | — |

Revisão por tópico (sem outros achados): servidor é a autoridade da sessão/escopo/consumo (admissão `available→consumed/declined/blocked` sob advisory lock, commit antes do transporte; `retry()` itera `for (i < retries)` e `retries=1` é tentativa única, `redirect:"error"`); confirmação não chama LLM (`admitted` só em `interpret`); proposta/comando antigo ou incompatível rejeitado (revisão, `pendingProposal`, origem, base do rascunho); conflito entre origens e cancelamento por referência validada no escopo; obrigatórios validados no save no servidor mesmo sem a UI; caminhos legados sem mudança funcional além de F-04/S3 (`required` do formulário legado passou a derivar de `IMOB_PROPERTY_GUIDED_REQUIRED`, mesmo valor); Front Door continua universal (o início guiado só dispara na frase exata e com a superfície IMOB disponível; o servidor impõe entitlement/papel).

### Comparação de tipagem (HEAD virtual × árvore atual)
Mesmo TypeScript 5.9.3, mesmas opções do `tsconfig` de cada programa, sem checkout/stash/escrita na worktree (`stage6-review/typecheck-baseline-compare.mjs`: o HEAD é servido por `git show`; arquivos novos ficam fora do programa de baseline). Diagnósticos comparados por arquivo+código+mensagem (sem linha; membros de união e números normalizados porque o TS imprime tipos truncados de forma variável: aproximação deliberada).
| Programa | `tsc` real (exit / diagnósticos) | Baseline → atual | Presentes | Introduzidos | Resolvidos |
|---|---|---|---|---|---|
| API oficial (`tsconfig.build.json`) | 0 / 0 | 0 → 0 | 0 | 0 | 0 |
| API com testes (`tsconfig.typecheck.json`) | 2 / 297 | 297 → 297 | 297 | 0 | 0 |
| Web (`apps/web/tsconfig.json`) | 2 / 63 | 63 → 63 | 63 | 0 | 0 |
| Web com testes (`stage6-review/tsconfig.web-tests.json`, mesmas opções, sem excluir testes, `typeRoots` espelhado) | 2 / 369 | 369 → 369 | 369 | 0 | 0 |
Arquivos novos (4 TS): 0 diagnósticos; os imports deles não geraram diagnósticos em outros arquivos. Na primeira comparação com testes, 7 usos de `.at(-1)` em linhas **adicionadas** por este incremento (TS2550, lib ES2021 do web) eram introduzidos; foram trocados por acesso por índice nessas linhas (sem `any`, `ts-ignore` ou exclusão). **Não é typecheck integral aprovado**: 3 dos 4 programas reprovam por diagnósticos presentes também no HEAD. Não comparáveis: a configuração web com testes é focal (não existe gate) e não cobre o Vite/build.

### P-04: conclusão focal
- `claimOnly` **lê** estado da captura e dados do caso; **não escreve** a sessão (única escritora: o motor guiado). Medição em PostgreSQL 16.15 descartável (36 migrations; shadow explícito e distinto, nenhum criado): para 10 variações reais pela rota (caso explícito A/B, sem caso, estado de agente, caso de outro workspace negado, etapa não permitida negada, não reivindicado, marcadores de fluxo/caso no `threadState`) **0 transações de escrita** (consumo de `xid` medido por conexão independente, com espera de 300 ms após a resposta) e **0 `memory_events`**; o controle positivo detectou 1 escrita. P11 completo: 33/33 em duas execuções (`p11-claim-writes-run1.log`, `…run2.log`). `recordImobCrmAuditEvent` só grava em created/updated/deleted de domínio e não é referenciado no estágio do claim; a telemetria `recordLegacyCrmFallbackTelemetry` só seria alcançável se a consulta devolvesse `null`; pelo código isso não ocorre para turnos transversais (inferência estática, consistente com o resultado medido de 0 escritas; não é inspeção de produção).
- A isenção do guard não alcança captura: `claimOnly` só é isento se for exatamente `true` e `intake` não for `property_draft`/`property_units`; `claimOnly` com esses intakes continua 409; `claimOnly` carregando payload guiado (cancel/start/interpret) sem `intake` só chega ao claim e o payload é ignorado (testes de rota, 39/39).
- Mesma aba: coleta **ativa** não emite claim (texto vai à coleta); **pausada** não emite claim e não altera sessão/rascunho/formulário (teste de invariantes, web 210/210). Efeito colateral: ver S1/S2.
- Limites: o estágio transversal é dublê nos testes de rota (o real é coberto por P11 e pelo navegador da etapa 5); a medição por `xid` é cluster-wide (sensível a escritas concorrentes alheias, inexistentes aqui) e não cobre dados reais de produção.

### Escopo funcional da interface (caracterização; sem ampliar a UI)
| Fase | Controles clicáveis | Depende de texto digitado |
|---|---|---|
| Abertura | "Continuar sem IA", "Revisar cadastro", "Cancelar cadastro do imóvel"; seletor "Corrigir ou retomar campo" | descrição inicial para a interpretação opcional por IA |
| Proposta pendente | "Continuar", "Cancelar cadastro"; seletor | **confirmar/rejeitar** ("sim"/"não" ou rótulos canônicos) |
| Coleta | campo único (select/entrada), "Continuar", "Cancelar cadastro"; seletor | **pular**, **revisar**, **pausar** |
| Pausada | **nenhum** | **retomar**, cancelar |
| Revisão | formulário completo, "Cancelar", **"Salvar cadastro"** (único caminho de gravação, clique explícito) | — |
Fixado por teste (`escopo da interface guiada…`). Linguagem livre arbitrária **não** é coberta pela coleta determinística: só a descrição inicial opcional passa pela IA; nos demais passos valem os comandos canônicos e valores de campo.

### Seleção proposta para o commit (nada no stage)
Gerada por `stage6-review/build-commit-selection.py` → `commit-selection.txt` (lista por arquivo, com diretórios não rastreados expandidos) e `local-only-sha256.txt`. Contagens por arquivo: **33 modificados rastreados** (21 de produção + 7 de testes + `docs/EVIDENCE_INDEX.md` + README do guiado + `CLAUDE.md` + `CODEX.md` + README do registry), **159 não rastreados expandidos** (`git status --short` mostra 63 entradas porque agrupa diretórios). Proposta: produção 22 (21 modificados + 1 novo), testes/harness/script QA 11 (7 modificados + 4 novos, incluindo `scripts/qa/imob-guided-browser.mjs`), documentação 2 (README e **somente o hunk 2** do índice), evidência nova 187 arquivos (88 `*.log` exigem `git add -f`), preservados só localmente 53 (capturas de execuções parciais/inválidas e da rodada superada, 4 scripts de diagnóstico não portáveis, `changes.diff` idêntico ao `.gz` rastreado) com hashes no manifesto. **Fora do escopo** (commit separado/decisão do owner): `CLAUDE.md`+`CODEX.md` (política, +32 linhas cada, devem mudar juntos), evidência pós-deploy de provider (README do registry, `post-deploy-manual-intake.json`, hunk 1 do índice), `previa-imob-revisada.html` (mockup sem vínculo, origem não atribuída). Referências do Índice sem cobertura na seleção: 0.
Higiene das evidências (222 arquivos A–D, 18,9 MB, 32 PNG): 0 credenciais, tokens ou URLs com autenticação (os acertos são segredos sintéticos em testes e o prefixo `syn-br-` do harness); 0 e-mails reais; 34 arquivos com `/home/jusall` (logs de teste) — há precedente em 117 dos 812 arquivos já rastreados em `ops/evidence`, mantidos sem edição por fidelidade; menções a scratchpad são históricas, e o log do incidente passou para `browser-integrated-2026-11-19/incident/`.

### Reprodução (runbook; não reexecutado ponta a ponta nesta etapa)
Pré-condições: PostgreSQL 16 + pgvector **descartável** (imagem local, tmpfs, loopback, banco `eiah_logistica_core_*`, `migrate:deploy` com `SHADOW_DATABASE_URL` distinto do principal); Playwright 1.61.1 com Chromium já instalado (sem download); tenant novo (o harness cria; o cenário 7 assume 2 imóveis ao fim do 6+7); logs vazios (os contadores acumulam por processo do harness).
1. API: `env -i PATH HOME LANG=C.UTF-8 TZ=UTC NODE_ENV=test TSX_TSCONFIG_PATH=tsconfig.base.json CORS_ORIGIN=http://127.0.0.1:$WEB_PORT DATABASE_URL EIAH_DISPOSABLE_INFRA=1 HARNESS_API_PORT HARNESS_MANIFEST HARNESS_PROVIDER_LOG HARNESS_BLOCKED_LOG node --import tsx apps/api/src/tests/support/imobGuidedBrowserHarness.ts` (aguardar `HARNESS-READY`; o manifesto `0600` contém tokens sintéticos: apagar ao fim).
2. Web: `cd apps/web && VITE_API_URL=/api VITE_API_PROXY_TARGET=http://127.0.0.1:$API_PORT pnpm exec vite --host 127.0.0.1 --port $WEB_PORT --strictPort`.
3. Spec: `env -i PATH HOME LANG=C.UTF-8 [QA_ONLY=1,1b,…] DATABASE_URL EIAH_DISPOSABLE_INFRA=1 QA_BASE_URL QA_API_URL=http://127.0.0.1:$API_PORT/api QA_MANIFEST QA_PROVIDER_LOG QA_BLOCKED_LOG QA_OUT node scripts/qa/imob-guided-browser.mjs` (`env -i` zera o ambiente: repassar `QA_ONLY` explicitamente). Verificado nesta etapa, sem infraestrutura: variável ausente → exit 2 com mensagem explícita; `QA_ONLY` inválido → exit 2.
Os scripts do ambiente anterior (`start-harness.sh`, `run-spec.sh`, `cleanup.sh`) viviam no scratchpad e não integram a seleção; os comandos acima os substituem.

### Execuções desta etapa (exit codes reais)
API intake 39/39 (exit 0) · web forms 210/210 (exit 0) · P11 33/33 em PostgreSQL descartável (exit 0, duas execuções) · typecheck: ver tabela · `git diff --check` exit 0. **Não repetidos** (sem mudança que os afetasse): navegador 13/13, PostgreSQL 22/22, bridge, persistência, `propertyCreateForm`. Recurso temporário: contêiner `eiah-imob-claimwr-be4c2aa8` criado e **removido** (rótulo/nome conferidos; 18 contêineres e 95 volumes como antes; `eiah-postgres` intocado), credenciais apagadas.

### Conclusão
As últimas alterações documentais desta etapa (README, linha do Evidence Index e gerador da seleção) **não foram revalidadas**: `check:evidence-index` e `check:docs-link-integrity` rodaram antes delas (na etapa 5) e não valem como validação destas; nenhum check novo foi executado após o registro final.

**B1: resolvido localmente (etapa 7).** Não resta bloqueio concreto para a seleção proposta; a aprovação no CI remoto não foi verificada. As demais pendências (S1–S8) não impedem. Não declaro aprovação integral, CI aprovado nem homologação em staging.


## Correção de B1 — 2026-11-19, etapa 7

Autorizada somente a correção de B1 e sua validação focal. Branch `chore/imob-intake-provider-diagnostics`, HEAD `f0da60cd`, stage vazio; `CLAUDE.md`/`CODEX.md`/`AGENTS.md` com os mesmos hashes (`66c82eb6…`, `2cad8b66…`, `ddacad34…`). F-04, D-ROUTING-01, as limitações de pausa e S1–S8 permanecem separados e inalterados. Sem produção alterada, sem `git add`/commit/push/PR/deploy e sem execução remota de CI.

**Causa.** O arquivo `marketplace.installations.activate.test.ts` é executado pelo job "W4 non-regression" com `DATABASE_URL=…/eiah_ci` e sem `EIAH_DISPOSABLE_INFRA`; o teste de P-04 que eu havia acrescentado a ele chama `assertDisposableDatabase()` (exige banco `eiah_logistica_core_*` e `EIAH_DISPOSABLE_INFRA=1`) e lançaria nesse ambiente.

**Correção aplicada (guarda e asserções preservadas; nada de skip, `continue-on-error` ou fallback).**
- `apps/api/src/tests/support/imobClaimFixture.ts` (novo): só o semeamento e a limpeza do cenário P10/P11, movidos **sem alterar a lógica** (`imobClaimFixtureNames`, `seedImobClaimFixture`, `cleanupImobClaimFixture`).
- `apps/api/src/tests/marketplace.installations.activate.test.ts`: o describe P10/P11 passa a usar o helper; **nenhum teste ou asserção do W4 foi removido ou alterado**; o teste de P-04 e o import da guarda saíram dele (o arquivo volta ao conteúdo original, exceto pela extração).
- `apps/api/src/tests/imob-claim-only-writes.integration.test.ts` (novo): o teste de P-04 com o corpo inalterado (incluindo `assertDisposableDatabase()` dentro do teste) e a **mesma guarda também no topo, antes dos hooks**, para que nada seja semeado fora de infraestrutura descartável.
- `package.json`: script `test:imob-claim-only-writes:integration` (`TSX_TSCONFIG_PATH=tsconfig.base.json NODE_ENV=test node --import tsx --test --test-concurrency=1 --test-force-exit <arquivo>`).
- `.github/workflows/ci.yml`: passo "Run IMOB claimOnly write-measurement integration (PostgreSQL real descartável)" no job existente **`logistica_core_integration`**, após a suíte de avaliação.

**Onde e como roda no CI.** Job `logistica_core_integration` (`LogisticaCoreIntegration`, disparado em `push` para `main`/`release/**` e em todo `pull_request`), que já provê o serviço efêmero `pgvector/pgvector:pg16` com `POSTGRES_DB=eiah_logistica_core_ci`, `DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/eiah_logistica_core_ci`, migrations aplicadas por `pnpm --filter @repo/db migrate:deploy` e Redis. O passo define `EIAH_DISPOSABLE_INFRA: "1"` **só no escopo do passo**, roda `pnpm test:imob-claim-only-writes:integration` (um `run:` sem `continue-on-error`: o exit code do `node --test` reprova o passo) e tem `timeout-minutes: 10`. O isolamento é o do serviço efêmero do runner, que satisfaz a guarda; não se define a variável sobre um banco não confirmado. O job W4 (`eiah_ci`) não executa o teste novo e mantém a cobertura original do arquivo.

**Dependências de configuração remota (não verificadas, nada alterado).** Se o job `LogisticaCoreIntegration` é um *required status check* da branch protegida é uma configuração remota que não consultei nem alterei; para a cobertura ser obrigatória e não só executada, esse check precisa estar exigido. Nenhuma proteção de branch foi tocada. O YAML (`yaml.safe_load`) e o JSON do `package.json` foram validados sintaticamente.

**Validação focal realizada (exit codes reais).**
| Verificação | Resultado | Exit | Observação |
|---|---|---|---|
| Controle negativo da guarda: arquivo novo sem `EIAH_DISPOSABLE_INFRA` | APROVADO (falha esperada) | 1 | `EIAH_DISPOSABLE_INFRA=1 required…`, antes de hooks e sem conectar ao banco (`b1-guard-negative-control.log`) |
| Idem com `EIAH_DISPOSABLE_INFRA=1` e banco `eiah_ci` | APROVADO (falha esperada) | 1 | `Dedicated local eiah_logistica_core_ database required` (`b1-guard-negative-control-db-name.log`) |
| Comparação de tipagem com o HEAD (API oficial) | APROVADO | 0 | 0 → 0; 0 introduzidos; `tsc` real exit 0, 0 diagnósticos |
| Comparação de tipagem com o HEAD (API com testes) | 0 introduzidos | 0 | 297 → 297; `tsc` real exit 2 (297 preexistentes; nenhum nos arquivos de B1); 6 arquivos novos no programa |
| `pnpm check:w4-non-regression` | APROVADO | 0 | `ok: true` |
**Validação por execução (concluída após o Docker ser iniciado pelo usuário; exit codes reais).** PostgreSQL 16.15 descartável (imagem local `pgvector/pgvector:pg16`, `--pull=never`, contêiner próprio com rótulo `eiah.task=imob-b1-<id>`, `--restart=no`, publicado só em `127.0.0.1`, dados em tmpfs, 0 volumes) com os dois bancos do CI, `eiah_logistica_core_ci` (usuário `ci`) e `eiah_ci`; destino confirmado antes das migrations (só esses dois bancos + `postgres`); `migrate:deploy` nos dois com `SHADOW_DATABASE_URL` distinto e não criado (36/36 migrations em cada; nenhum shadow criado); credenciais sintéticas aleatórias. O `eiah-postgres` preexistente e o Docker global não foram tocados.
| Execução | Ambiente reproduzido | Resultado | Exit | Contagens |
|---|---|---|---|---|
| `pnpm test:imob-claim-only-writes:integration` (script registrado no CI) | `DATABASE_URL=…/eiah_logistica_core_ci`, `NODE_ENV=test`, `EIAH_DISPOSABLE_INFRA=1` (job `logistica_core_integration`) | APROVADO | 0 | 1 suíte/teste aprovado (`tests 1, pass 1, fail 0, skipped 0, todo 0`; o teste interno de P-04 `ok 1`, controle positivo `control: 1`) — `b1-run-claim-only-writes.log` |
| `node --import tsx --test --test-force-exit --test-concurrency=1 apps/api/src/tests/marketplace.installations.activate.test.ts` (arquivo original do W4, já com o helper extraído) | `DATABASE_URL=…/eiah_ci`, `NODE_ENV=test`, **sem** `EIAH_DISPOSABLE_INFRA` (`env -i`) | APROVADO | 0 | 32/32 (`fail 0, skipped 0, todo 0`) — `b1-run-w4-original.log` |
Sem divergência em relação aos valores esperados (1/1 e 32/32); nenhuma asserção foi alterada. Diferença de ambiente: o `REDIS_URL` do job W4 não foi reproduzido (sem serviço Redis local; o arquivo já havia rodado assim em execuções anteriores). Limpeza: contêiner removido (rótulo e nome conferidos), credenciais apagadas, porta liberada; 18 contêineres e 95 volumes como na partida; `eiah-postgres` saudável.

**Situação de B1: resolvido localmente.** Limites: o CI remoto não foi executado nem consultado (inclusive se `LogisticaCoreIntegration` é *required check* da branch protegida), e os `*.log` desta etapa exigem `git add -f` na seleção (documental).
