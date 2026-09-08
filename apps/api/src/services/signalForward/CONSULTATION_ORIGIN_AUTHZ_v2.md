# Consulta corrigida — Contrato da Origem e Autorização Radar → MKT

**Rodada 3 (esta revisão)**: fecha o rastreamento até a chamada ao LLM, verifica autorização na
cadeia efetiva (não por ausência de nomes em `runWorker.ts`), fecha a investigação de
procedência de `Run.response`/`Run.agent`, corrige premissas de versionamento/persistência,
corrige a generalização de `ConflictError`, e separa decisões de produto em seção própria.
Substitui integralmente as rodadas 1 (chat) e 2 (`v2`, primeira versão em disco) — o conteúdo
abaixo é a versão corrigida e completa, não um adendo.

Consulta e documentação apenas — nenhum runtime, endpoint, adaptador, migração, fila ou worker
foi implementado nesta rodada. Nenhum teste de runtime foi executado nesta rodada.

---

## 0. Base verificada e escopo examinado

| Item | Valor |
|---|---|
| Worktree | `/home/jusall/projects/EIAH_SIGNALFORWARD_ORIGIN_FIX` |
| Branch | `experiment/signalforward-origin-fingerprint-fix` |
| HEAD | `8d76a30a6326761614a41e601015c56ec6758958` — confirmado no início desta rodada, `git status --short` mostrava apenas o próprio documento não commitado |
| Correção de código mais recente | `768e1b2cd331c435a4d11e84cea5ab6733999321` (ancestral de `8d76a30`) |
| `main` remota | `11805d1934573281e2787c2442b546c172b76947` — inalterada, confirmada via `git ls-remote` no início desta rodada |
| CLAUDE.md/CODEX.md/AGENTS.md | hashes idênticos às rodadas anteriores desta sessão — sem mudança |
| Outras frentes | `EIAH_R0A` não tocado nesta rodada |

O HEAD não avançou desde a rodada anterior. Nenhuma diferença a reconciliar.

**Escopo examinado nesta rodada** (arquivos lidos, além dos já citados em rodadas anteriores):
`apps/api/src/workers/runWorker.ts` (`processRunPayload`, `resolveActionsForExecution`,
`finalizeCancelledRunPartial`), `apps/api/src/services/agents.ts` (`getAgentProfile`,
`isAgentAvailableInWorkspace`), `apps/api/src/routes/agents.ts` (linha 598 atual),
`apps/api/src/routes/runs.ts` (`RunExecutionSchema` e schemas irmãos, linhas 240-269),
`apps/api/src/services/runArchiveService.ts` (escritas raw SQL), `apps/api/src/services/
runAtivoUniversalAgent/interpreters/mktInterpreter.ts` (achado lateral).

---

## 1. Correções explícitas às conclusões da rodada anterior (v2)

| Conclusão em v2 | Problema | Correção nesta rodada |
|---|---|---|
| "Etapa 6 — não rastreado até o fim... para não expandir o escopo" | A própria consulta desta rodada determina que isso está dentro do escopo | Rastreamento fechado até `orchestrator.run(...)` — seção 2 |
| "budget/toneProfile/launchDate" tratados como obrigatórios em um ponto e como aceitando vazio em outro, sem resolver a contradição | Contradição não resolvida, sem evidência de schema | Resolvida com evidência direta: `RunExecutionSchema` (`routes/runs.ts:240-244`) — nenhum desses campos é exigido pelo backend. Seção 2 |
| "Ausência de checkScopePermission/reauthorizeSignalForward/authContext em runWorker.ts (zero ocorrências)" apresentada como prova de ausência de autorização na cadeia | Busca por nome não é prova de ausência de controle equivalente | Corrigido: encontrado `isAgentAvailableInWorkspace` (`agents.ts:1328-1367`), que consulta `TenantActionPolicy`/`DelegationPolicy` — mas seu resultado **não bloqueia execução** (usado só para um campo de exibição). Confirmado com leitura de código, não com ausência de grep. Seção 3 |
| "Nenhum agente 'radar' real existe no sistema hoje" | Afirmação de inexistência global a partir de busca estática | Corrigido para "não localizado no código/configuração estática examinados" — não consultei dados reais de banco. Seção 4 |
| `routes/agents.ts:598` e `workers/runWorker.ts:553` listados como "não verificados" | Pendência explícita da rodada anterior | Fechados nesta rodada — nenhum dos dois escreve `Run.response` com conteúdo arbitrário client-controlado (598 só toca `request`; 553 é write server-side dentro do próprio worker). Seção 4 |
| Qualquer alteração de estado da origem tratada genericamente como "conflito" | Mistura `ConflictError` (fingerprint) com `SignalForwardOriginError` (elegibilidade) | Corrigido — classes e `reasonCode` distintos mapeados por cenário. Seção 6 |
| "FK `ON DELETE RESTRICT` impede exclusão" apresentada perto de afirmações de imutabilidade do snapshot | Mistura duas garantias diferentes | Separado explicitamente: a FK protege só contra exclusão referenciada; não diz nada sobre `UPDATE` em `originSnapshot`. Seção 6 |
| "Alternativa 1 (permitir reuso por outro usuário) é a recomendação consistente" apresentada de forma a soar quase decidida | Risco de decidir política de produto pela ausência de controle atual | Recolocada estritamente como pergunta em aberto, sem inclinar a decisão pela ausência de mecanismo. Seção 7 |

---

## 2. Cadeia completa até a chamada ao LLM

Todas as etapas abaixo lidas nesta rodada, na revisão `8d76a30` (`768e1b2` não altera nenhum destes arquivos — herdados do baseline `11805d19`).

### Etapa 1 — Formulário self-service
`apps/web/src/pages/self-service/mkt.tsx:118-212`, `buildRequest`. Campos do formulário:
`goal, kpis, audience, channels[], budget, toneProfile, toneNotes, launchDate, deadline, notes`.
Nenhum `<input>`/`<textarea>` tem atributo `required` (confirmado por leitura do JSX,
linhas 289-410). Produz `{prompt, metadata: {form, domain:"marketing", ...}, rawPayload}`.

### Etapa 2 — Shell de execução
`apps/web/src/pages/self-service/components/AgentFormShell.tsx:359-445`, `executeRun`. Monta
`payload = {agent:"MKT", prompt, workspaceId, metadata:{mode, ...metadata, executionInput}}`.

### Etapa 3 — Cliente HTTP
`apps/web/src/hooks/useAgentExecution.ts:95-102` → `POST /runs`.

### Etapa 4 — Validação backend (evidência que resolve a contradição de v2)
`apps/api/src/routes/runs.ts:240-244`:
```ts
const RunExecutionSchema = z.object({
  agent: z.string().min(1),
  prompt: z.string().min(1),
  metadata: z.record(z.any()).optional(),
});
```
**Único contrato de entrada validado pelo backend para qualquer agente, incluindo MKT.**
`metadata` é `z.record(z.any()).optional()` — **nenhum campo dentro de `metadata.form`
(incluindo `budget`, `toneProfile`, `launchDate`) é exigido ou validado pelo backend.**

`authContext.tenantId/workspaceId/userId` vêm de `enforceTenant` (seção 3), nunca do corpo —
confirmado em `createRunRecord({..., tenantId: authContext.tenantId, ...})`
(`routes/runs.ts:672-674`). `agent` vem de `req.body.agent`, restrito por
`assertWorkspaceAgentEnabled`.

### Etapa 5 — Persistência
`services/runs.ts`, `createRunRecord` → `prepareRunRequestAction`
(`imobRunActionCatalog.ts:70-95`, pass-through para `domain !== "imob"`). Persiste
`Run.request = {prompt, metadata}` (`routes/runs.ts:488`, `requestPayload`).

### Etapa 6 — Publicação e consumo da fila (fechado nesta rodada)
`routes/runs.ts:834`, `await publishRun({runId, tenantId, workspaceId, userId, agent, prompt,
metadata})` (mesmos campos de `Run`, sem token/authContext). Consumidor:
`workers/runWorker.ts:2533`, `consume(processRunPayload)`.

`processRunPayload` (`runWorker.ts:1060-1069`): desestrutura `{runId, tenantId, workspaceId,
userId, prompt, metadata}` do payload da fila — **não há bearer token nem authContext no
payload; a identidade que chega ao worker é só os IDs já resolvidos na criação.**

### Etapa 7 — Perfil do agente (achado importante desta rodada)
`runWorker.ts:1099`, `getAgentProfile(tenantId, workspaceId, agent)` →
`services/agents.ts:1373-1412`. Internamente chama `isAgentAvailableInWorkspace`
(`agents.ts:1328-1367`), que consulta `TenantActionPolicy` (`actionName` = chave do agente,
`allowed:true`) **e** uma `DelegationPolicy` ativa com `MarketplaceItem` do tipo `"agent"`
correspondente — a mesma dupla checagem de "visibilidade" já mapeada em rodadas anteriores
desta sessão para `GET /agents`.

**Achado decisivo**: o resultado booleano de `isAgentAvailableInWorkspace` só é usado para
compor o campo `participation` do perfil (linhas 1385-1401) — **não é usado em
`processRunPayload` para decidir se a execução prossegue.** A única checagem que de fato
interrompe a execução nesta etapa é `if (!profile) { ...error "AGENT_NOT_FOUND"... }`
(`runWorker.ts:1100-1128`), que só falha se **nenhum** `AgentProfile` existir para aquele nome
de agente — independente de `isAvailableInWorkspace`. Ou seja: existe uma consulta de política
real neste ponto da cadeia, mas seu resultado **não bloqueia a execução**.

### Etapa 8 — Resolução de ações/ferramentas (achado desta rodada)
`resolveActionsForExecution` (`runWorker.ts:569-611`), chamada logo antes de `orchestrator.run`.
Consulta `TenantActionPolicy` **de novo, ao vivo** (`allowed:true`, `workspaceId` ou `null`)
para filtrar quais ferramentas/ações o agente pode invocar durante a execução. **Fallback
observado**: se não houver nenhuma política resolvida e nenhum resolver customizado
configurado, libera o catálogo inteiro de ações registradas (linha 609-611) — um "fail-open"
explícito para o caso de ausência total de política.

Este é um controle real, tenant-scoped, avaliado no momento da execução — mas é sobre
**quais ferramentas** o agente pode usar, não sobre **se aquele run específico** tem
autorização para executar.

### Etapa 9 — Chamada ao LLM
`runWorker.ts:1858-1877`:
```ts
context = await orchestrator.run({
  objective: prompt,          // == Run.request.prompt, verbatim
  tenantId, workspaceId, runId,
  metadata: orchestratorMetadata,  // {...metadata, userId}
  actions: actionsForTenant,       // resultado da Etapa 8
  maxSteps: process.env.RUN_MAX_STEPS,       // opcional, config de ambiente
  stepTimeoutMs: process.env.RUN_STEP_TIMEOUT_MS,  // opcional, config de ambiente
});
```
Este é o limite da investigação: `orchestrator.run` é o ponto real de chamada ao LLM.
**Não tracei o corpo interno de `orchestrator.run`/`llmExecutor.ts`** (construção exata da
mensagem enviada ao provedor) — ficaria além do que esta consulta pede ("até a chamada
efetiva ao LLM", que `orchestrator.run` já representa como fronteira). Dependências mutáveis
identificadas nesta etapa: variáveis de ambiente `RUN_MAX_STEPS`/`RUN_STEP_TIMEOUT_MS`
(config), relógio não usado diretamente aqui.

### Etapa 10 — Interpretação da saída (confirmado, não é entrada)
`buildMktStructuredOutput` (`runWorkerMktOutput.ts:31-49`) → `buildMktCampaignReport`
(`mktCampaignInterpreter.ts:357-367`), executado **depois** da Etapa 9, sobre `outputText`/
`metadata.form`/`recipeOrchestration`. Confirma a correção de v2: não é contrato de início
de execução.

**Achado lateral, não aprofundado**: existe um segundo interpretador,
`runAtivoUniversalAgent/interpreters/mktInterpreter.ts` (`interpretMkt`), que também lê
`form.goal/audience/channels/budget/launchDate/toneProfile` com fallback total em cada campo
(`buildSummary`/`buildContext`/`buildInsight`, linhas 4-32) — reforça o padrão "todo campo de
`metadata.form` é opcional em todo consumidor encontrado". Não tracei a origem exata do
`input.form` deste interpretador nesta rodada (provavelmente o mesmo `metadata.form`, mas não
confirmado) — registrado como limite explícito de investigação, não como fato.

### Classificação de campos (resolve a contradição da rodada anterior)

| Campo | Apresentado no formulário | Obrigatório por validação backend | Necessário ao executor (`orchestrator.run`) | Usado só na interpretação da saída | Opcional/fallback |
|---|---|---|---|---|---|
| `prompt` (texto completo) | gerado pelo formulário, não é um campo isolado | **Sim** — `RunExecutionSchema.prompt: z.string().min(1)` | **Sim** — vira `objective` diretamente | não | não |
| `agent` | fixo `"MKT"` | **Sim** — `RunExecutionSchema.agent` | indiretamente (resolve perfil/ações) | não | não |
| `metadata` (objeto todo) | sim | **Não** — `z.record(z.any()).optional()` | passado adiante como contexto (não confirmado que o executor exige campos específicos dele) | não é usado diretamente no ponto rastreado | sim |
| `metadata.form.goal/audience/channels/kpis` | sim | não | não confirmado como lido por `orchestrator.run` nesta rodada | sim (`buildMktCampaignReport`, `interpretMkt`) | sim, com fallback em todo consumidor encontrado |
| `metadata.form.budget/toneProfile/launchDate` | sim | **não** (evidência: `RunExecutionSchema`) | não | sim (mesmos dois interpretadores) | sim |

**Menor contrato de entrada MKT sustentado pelo código**: `{agent: "MKT", prompt: string não-vazio}`.
`metadata`/`metadata.form` não são necessários para a execução chegar a `orchestrator.run` —
são consumidos exclusivamente pelos interpretadores de **saída**, ambos com fallback total na
ausência de qualquer campo. Isso responde diretamente à pergunta da consulta: `metadata.form`
não é necessária para a execução em si (no ponto rastreado) nem estritamente necessária para a
interpretação da saída (que degrada graciosamente) — é necessária apenas para que a
interpretação da saída produza um relatório **específico ao briefing real**, em vez de um
relatório genérico com valores-padrão de fallback.

---

## 3. Autorização na cadeia efetiva (não por ausência de nomes)

| Etapa | Controle real encontrado | O que garante | O que NÃO garante |
|---|---|---|---|
| Criação (`POST /runs`) | `enforceTenant` (`middlewares/enforceTenant.ts:58-155`) | Bearer token real, validado (`revoked`, `expiresAt`) — `authContext={tokenId,tenantId,workspaceId,userId?}` | `userId` pode ser ausente (token de serviço) |
| Criação | `assertWorkspaceAgentEnabled` (via `createRunRecord`) | Atribuição real do agente ao workspace | Não é permissão de operação por indivíduo |
| Criação | `checkScopePermission` para `runs.execute` | **Não wireado em `POST /runs`** — confirmado ausente em rodadas anteriores desta sessão, não checado de novo nesta (sem mudança de código desde então) | — |
| Publicação/fila | nenhum | Apenas propagação de dados (`runId,tenantId,workspaceId,userId,agent,prompt,metadata`) | Nenhuma reautenticação nem reautorização |
| Consumo (worker) | `getAgentProfile`→`isAgentAvailableInWorkspace` | Consulta política real, mas **não bloqueia** (achado desta rodada, seção 2, Etapa 7) | Não impede execução mesmo se a política negasse |
| Imediatamente antes do LLM | `resolveActionsForExecution` | Filtra **ferramentas/ações** por política tenant-scoped, ao vivo | Fail-open se não houver política nenhuma; não decide "pode este run executar", só "quais ferramentas usar" |
| — | — | — | **Nenhuma etapa revalida se o autor original ainda tem permissão de tenant/workspace/scope entre a criação e a chamada ao LLM** — conclusão agora apoiada em leitura de código de ponta a ponta, não em ausência de grep |

**Diferenciação exigida**:
- **Autorização** (pode operar): `checkScopePermission`/`TenantActionPolicy` — existe como mecanismo, não wireado no caminho de criação de run nem revalidado depois.
- **Aprovação** (HITL/governança sobre uma decisão específica): não localizada no caminho MKT rastreado — `approvalStatus`/`approvedBy` existem no schema de `Run` (rodadas anteriores) mas não vi nenhum gate delas neste caminho.
- **Habilitação do agente** (o agente está disponível para uso): `assertWorkspaceAgentEnabled` (bloqueia) e `isAgentAvailableInWorkspace` (não bloqueia, só informa) — **duas checagens com o mesmo propósito aparente e comportamento diferente**, achado relevante em si.
- **Simples propagação de identidade**: `userId`/`tenantId`/`workspaceId` no payload da fila — dados, não verificação.

### Análise de `resumeSignalForwardDispatch` (proposta da rodada anterior)

- **`checkScopePermission` decide por usuário/token ou por tenant/workspace?** Por
  tenant/workspace apenas — confirmado de novo nesta rodada (`TenantPolicyStore.
  resolveScopeDecision(tenantId, workspaceId, scope)`, sem parâmetro de usuário).
- **Passar `requestedByUserId` muda a decisão?** **Não.** `userId` só alimenta a linha de
  auditoria (`rbac.ts:54`). Persistir e passar `requestedByUserId` numa retomada tem valor de
  auditoria/atribuição, não de autorização — isso deve ficar explícito, não implícito.
- **Qual principal autoriza a retomada, então?** Hoje, nenhum principal individual — a
  autorização é do tenant/workspace persistido em `SignalForwardRequest`, reavaliada contra a
  política atual daquele tenant/workspace no momento da retomada. Isso é consistente com o
  resto do mecanismo (nenhum outro ponto do sistema autoriza por indivíduo), mas é uma
  característica a explicitar, não a esconder atrás do nome do parâmetro.
- **Tokens de serviço sem `userId`**: tratados de forma idêntica a requisições com `userId`,
  porque a decisão nunca olha para `userId`. Nenhum tratamento especial existe nem é
  necessário para o mecanismo atual funcionar — mas isso significa que uma futura exigência de
  autorização individual precisaria decidir separadamente o que fazer com tokens de serviço.
- **Dados persistidos suficientes para revalidar a política proposta**:
  `SignalForwardRequest.tenantId`/`workspaceId` (imutáveis, já persistidos) bastam para repetir
  `checkScopePermission` hoje. `requestedByUserId` já está persistido e nunca sobrescrito — útil
  para auditoria, não necessário para a decisão de autorização atual.
- **Credenciais**: nenhuma credencial bruta é ou seria armazenada — apenas IDs. **Regra de
  revogação/autoridade de execução — decisão explícita necessária, não presumida**: hoje, de
  fato, a execução assíncrona deriva sua autoridade do tenant/workspace, não de uma credencial
  individual contínua — mas se isso deve continuar assim (autoridade do "recurso do tenant") ou
  se deve depender da validade contínua da identidade original é uma pergunta de produto,
  tratada na seção 7.

---

## 4. Procedência de `Run.response`/`Run.agent` — investigação fechada

**Quem define `Run.agent`**: `req.body.agent` no momento da criação (`routes/runs.ts`),
validado por `assertWorkspaceAgentEnabled`. **Pode ser alterado depois?** Busca exaustiva
nesta rodada por qualquer `.run.update(...)`/`.run.upsert(...)`/`.run.updateMany(...)`/SQL cru
em `apps/api/src` que grave `agent:` — **nenhuma ocorrência encontrada**. `Run.agent` é
definido uma única vez e nunca reescrito por nenhum caminho de código identificado.

**Quem grava/modifica `Run.response`** — pendências da rodada anterior fechadas:
- `routes/agents.ts:598` (linha atual, localizada de novo nesta rodada): grava apenas
  `data: { request: preparedRequest.request }` — **não toca `response`**. Confirmado.
- `workers/runWorker.ts:553` (dentro de uma função de finalização de cancelamento,
  `finalizeCancelledRunPartial`): grava `response` com conteúdo **computado a partir do
  próprio contexto de execução do worker** (`params.context.outputs`, `params.snapshot.usage`,
  `recipeOrchestration` derivado internamente) — não é conteúdo arbitrário vindo de um
  cliente HTTP.
- `routes/runs.ts:1092,1229` (`recommendations/adopt`/`reject`): já verificado em rodada
  anterior — alteram apenas campos de uma recomendação já existente dentro de `response`
  (`updateRecommendationInResponse`), não substituem o conteúdo.
- Busca ampliada nesta rodada por `.run.create(`/`.run.upsert(`/`.run.updateMany(` fora dos já
  conhecidos: **nenhuma ocorrência adicional**. Busca por SQL cru tocando a tabela `runs`:
  `runArchiveService.ts` grava apenas `archived_at`/`archive_ref` via `UPDATE runs SET ...`
  (linhas 277-283) — não toca `response` nem `agent`.

**Conclusão**: nenhum endpoint client-facing permite substituir `Run.response` por conteúdo
arbitrário. As únicas escritas de `response` com conteúdo "livre" são internas ao worker,
derivadas do próprio contexto de execução do orquestrador (`context.outputs`, etc.) — isso é
evidência de processo (o pipeline real de execução escreveu aquilo), não uma prova
criptográfica, e não deve ser tratada como tal. Um marcador dentro do próprio JSON de
`response` (`kind`, `schemaVersion`, `producedByAgent`) continua sem qualquer verificação
própria — nada no código confere esses campos contra o `Run.agent` real da linha.

**Produtor Radar — separação exigida pela consulta**:
- **Produtor localizado no código**: nenhum agente "radar" em `CORE_AGENT_PROFILES`
  (`services/agents.ts`) nem em nenhum seed estático examinado.
- **Configuração dinâmica/cadastro**: `AgentMetadata`/`WorkspaceAgentAssignment` são tabelas
  reais que podem ser populadas em runtime por qualquer tenant — **não consultei o banco de
  dados real** para verificar se algum tenant já criou um agente com esse nome.
- **Existência de runs reais**: **não localizado no código/configuração estática examinados**
  — não afirmo que nenhum run "radar" existe no sistema, apenas que não encontrei evidência
  estática de um produtor ratificado. Esta é a formulação corrigida em relação à rodada
  anterior.

O contrato `RadarSignalResultV1` permanece **proposto**, não produzido nem consumido por
nenhum código real localizado em nenhuma das três rodadas desta consulta.

---

## 5. Versionamento e persistência — comparação corrigida

### Correção das premissas apontadas

- **"Snapshot sozinho garante reconstrução determinística"** — falso. Reconstruir a entrada
  exige, além do `originSnapshot`: a versão do contrato de origem que validou aquele snapshot,
  a versão do algoritmo de fingerprint, e — se um adaptador existir — a versão exata da lógica
  do adaptador usada (templates, regras de mapeamento, defaults aplicados). Sem essas versões
  registradas, um snapshot antigo pode ser reprocessado com lógica atual incompatível sem que
  ninguém perceba.
- **"Persistir entrada derivada impede evolução do adaptador"** — falso. Persistir a entrada
  derivada de uma solicitação **já criada** não impede que o adaptador mude para
  **solicitações futuras**; apenas fixa o que aquela solicitação específica usou. Versionamento
  resolve isso, não impede evolução.
- **"Versão do fingerprint substitui as demais"** — falso. São eixos independentes:
  versão do contrato de origem, versão do adaptador/mapeamento, versão do algoritmo de
  fingerprint, e (se existir formalmente) versão do contrato de entrada MKT. Hoje só a segunda
  metade da lista tem alguma versão real (`FINGERPRINT_CONTRACT_VERSION`); as outras três não
  existem como campos, porque os componentes correspondentes (contrato de origem, adaptador)
  não existem ainda.

### A vs. B, com evidência de código

**Onde `Run.request` já é escrito**: uma única vez, na criação (`createRunRecord`), com merges
pontuais e server-computados depois (`intentSignature`, confirmado em dois pontos:
`routes/runs.ts:793` e `routes/agents.ts:598`) — nunca substituído por completo. Isso significa
que, **se** um adaptador Radar→MKT existisse, a entrada derivada por ele poderia ser escrita
diretamente como `Run.request` do run de **destino**, no momento da criação — sem precisar de
uma coluna nova para "guardar a entrada MKT já derivada", porque `Run.request` já é
exatamente esse lugar, para o run de destino. Isso não é duplicação: `SignalForwardRequest.
originSnapshot` preserva o conteúdo da **origem**; `Run.request` (do destino) já preserva,
pela natureza do sistema, a entrada realmente usada naquele run — são propósitos e linhas
diferentes.

| | A — snapshot + versões, entrada reconstruída sob demanda | B — snapshot + entrada MKT derivada, persistida e versionada |
|---|---|---|
| Onde vive a entrada derivada | recalculada a cada uso a partir do snapshot + versão do adaptador correspondente | `Run.request` do run de destino (já existe, sem coluna nova) |
| Retomada com payload fixado | requer reconstrução determinística — só é seguro se a versão exata do adaptador daquele momento ainda estiver disponível no código | trivial — já está gravado, nenhuma reconstrução necessária |
| Custo de schema | nenhum, além de campos de versão | nenhum para a entrada em si (reaproveita `Run.request`); campos de versão continuam necessários |
| Risco de divergência | alto se versões antigas do adaptador forem removidas do código sem aviso | baixo — o que foi usado está gravado, independente do código atual |

**Recomendação técnica a avaliar (não decisão ratificada)**: preferir B — persistir a entrada
derivada versionada, aproveitando `Run.request` do run de destino para isso (sem coluna nova
para o conteúdo em si), e adicionar campos de versão explícitos a `SignalForwardRequest`
(`originContractVersion`, `adapterVersion`, `fingerprintVersion` — hoje só o terceiro tem
qualquer versão, embutida no hash, sem coluna própria). Isso está alinhado ao que o código já
faz (`Run.request` como destino natural da entrada) e evita o risco de reconstrução
inconsistente do lado A. **Isto é uma recomendação técnica, não uma decisão de produto — falta
decidir se/quando um adaptador será construído (seção 7).**

**Comportamento para pedidos antigos após atualização do adaptador/fingerprint**: nem
recalcular silenciosamente com a versão atual, nem tratar o retry como nova execução.
Proposta: se `fingerprintVersion`/`adapterVersion` de um registro antigo não corresponder à
versão atual do código, a retomada deve **falhar explicitamente** com um erro que identifique
a incompatibilidade de versão, a menos que a implementação da versão antiga ainda esteja
presente no código (mapa versão→implementação) — nunca silenciosamente reprocessar com a
lógica atual nem criar um novo run como se fosse uma solicitação nova.

**Imutabilidade — reafirmado**: nenhuma constraint de banco impede `UPDATE` em
`originSnapshot`; a garantia é só disciplinar (nenhum código atual o faz).

**Conclusão sobre schema**: campos de versão (`fingerprintVersion` no mínimo) exigiriam
migração pequena e aditiva. A entrada MKT derivada (opção B) **não exige coluna nova** —
reaproveita `Run.request`. O contrato de origem e o adaptador em si não têm schema próprio
definido — dependem inteiramente de decisões de produto ainda não tomadas.

---

## 6. Três caminhos — corrigidos

### A. Repetição HTTP com a mesma chave
Autoriza a tentativa atual (`reauthorizeSignalForward`) → dentro da transação, `readAndValidateOrigin`
verifica a origem **conforme a regra existente hoje** (tenant/workspace + `status="success"` +
`response` estruturado — não "conforme o contrato Radar", que não existe). Em caso de P2002 na
chave idempotente, `recoverExistingSignalForwardRequest` relê a origem e recalcula o
fingerprint; se divergir do valor armazenado, lança **`ConflictError`** (mensagem
`idempotency_key_reused_incompatible_payload`) — **este é o único cenário que produz
`ConflictError`** neste código. Nada sobrescreve nem cria outro run.

### B. Consulta de encaminhamento existente
Não implementada. Contrato proposto igual ao já registrado (rodada anterior): autoriza a
leitura, usa apenas o registro persistido, não publica nem executa.

### C. Retomada interna
Não implementada. Contrato proposto igual (rodada anterior), com o refinamento da seção 3
sobre o que "revalidar autorização" realmente significa hoje (tenant/workspace, não indivíduo).

### Estado da origem — classes e `reasonCode` reais, sem generalizar

| Cenário | Classe lançada | `reasonCode`/mensagem | Mapeamento HTTP |
|---|---|---|---|
| Origem inexistente ou fora do tenant/workspace | `SignalForwardOriginError` | `source_run_not_found_in_scope` | **nenhum handler HTTP existe** — não invento status code |
| Origem em estado não elegível (`status !== "success"`) | `SignalForwardOriginError` | `source_run_not_in_required_state` | idem |
| Origem sem `response` estruturado | `SignalForwardOriginError` | `source_run_missing_structured_response` | idem |
| Fingerprint divergente (conteúdo mudou) | `ConflictError` | `idempotency_key_reused_incompatible_payload` | idem |
| Solicitação existente sem `destinationRunId` (inconsistência) | `SignalForwardInconsistencyError` | `existing_request_without_destination_run` | idem |
| Solicitação não encontrada apesar de P2002 | `SignalForwardInconsistencyError` | `unique_violation_without_matching_row` | idem |
| Autorização negada | `SignalForwardAuthorizationError` | `reasonCode` de `TenantPolicyStore` (`SCOPE_NOT_ALLOWED`, `POLICY_NOT_FOUND`, etc.) | idem |
| Atribuição do agente negada | `WorkspaceAgentAssignmentError` | `AGENT_ASSIGNMENT_REQUIRED`/`AGENT_NOT_ENABLED_IN_WORKSPACE` | idem |

**Nenhum handler HTTP existe hoje para `signalForwardingService.ts`** (confirmado — não há
arquivo de rota) — por isso nenhuma linha acima recebe um status HTTP: seria invenção.

### Mudança de conteúdo vs. estado vs. revogação vs. exclusão vs. falha técnica

| Tipo de mudança | Comportamento real hoje |
|---|---|
| Conteúdo alterado | `ConflictError` na próxima tentativa A que recalcule o fingerprint |
| Estado alterado (deixou de ser `"success"`) | `SignalForwardOriginError(source_run_not_in_required_state)` numa nova validação de origem |
| Acesso/autorização revogado | `SignalForwardAuthorizationError`, mas **só é revalidado nos pontos que já chamam `reauthorizeSignalForward`** — caminho A e o reuso; não há revalidação automática entre isso e uma futura execução, porque essa execução (fila/worker) não existe ainda para este fluxo |
| Origem excluída | Bloqueado no banco pela FK composta (`ON DELETE RESTRICT`) — **isto é só proteção contra exclusão referenciada**; não diz nada sobre se `originSnapshot` foi ou pode ser sobrescrito, nem sobre imutabilidade em geral (essa garantia é só disciplinar, seção 5) |
| Falha técnica ao consultar autorização | `checkScopePermission` propaga a exceção (sem captura silenciosa na consulta principal) — distinta de negação de política por `reasonCode` |

---

## 7. Decisões de produto (separadas, não decididas aqui)

### 7.1 Quem pode consultar encaminhamentos e resultados
**Pergunta**: um usuário do mesmo tenant/workspace que não criou a solicitação pode consultá-la?
**Alternativas**: (1) sim, é um recurso do workspace; (2) não, só o `requestedByUserId` original;
(3) sim, mas com um escopo de leitura distinto do de criação.
**Consequências**: (1) nenhum trabalho técnico novo, mas nenhuma barreira entre colegas de
workspace; (2)/(3) exigem um controle de autorização individual que **não existe hoje para
nenhum recurso análogo no sistema** (não é uma extensão pequena).
**Recomendação, não aprovada**: nenhuma — depende de quão sensível o conteúdo do encaminhamento
é considerado pelo produto, o que não me cabe presumir.

### 7.2 Quem pode reutilizar a chave/pedido de outro principal
Mesma pergunta que 7.1, aplicada especificamente ao caminho A (retry HTTP). Hoje, tecnicamente,
qualquer identidade do mesmo tenant/workspace com `runs.execute` concedido pode disparar uma
tentativa com a mesma `idempotencyKey` de outro usuário e receber `reused:true` com o resultado
original — não é bloqueado, não é ativado por decisão, é ausência de controle.

### 7.3 Consulta e execução exigem permissões diferentes?
**Pergunta em aberto**, não decidida em nenhuma rodada. Hoje o único escopo real é
`runs.execute`, usado tanto para criar quanto (proposto) para reautorizar reuso — não existe um
escopo de leitura distinto. Criar um escopo de leitura separado é trabalho técnico real
(nenhum precedente no código), não apenas configuração.

### 7.4 Autoridade para execução assíncrona e efeito da revogação
Ver seção 3: hoje a autoridade de fato é do tenant/workspace, não de uma identidade individual
contínua. **Pergunta**: isso deve continuar assim, ou uma revogação da identidade original deve
poder impedir uma retomada mesmo que o tenant/workspace ainda tenha o scope concedido?
**Alternativas**: (1) manter autoridade no nível do tenant/workspace (nenhuma mudança); (2)
introduzir um controle de validade por identidade individual (trabalho técnico novo,
inexistente hoje para qualquer recurso). Não escolho.

### 7.5 Qual produtor/contrato Radar será aceito
Ver seção 4. Não há produtor ratificado. Decisão de produto necessária: nome do
`agentKey`, versão inicial do contrato de conteúdo, e se runs de tenants que já usam algum
nome parecido (não verificado) precisam de migração/reconciliação.

### 7.6 Qual tarefa MKT o encaminhamento deve solicitar, e quais dados adicionais exige
Ver seção 2 — o menor contrato de entrada MKT é `{agent:"MKT", prompt}`; tudo o que hoje enche
`metadata.form` (`budget`, `toneProfile`, `launchDate`, etc.) foi desenhado para preenchimento
humano via formulário. **Pergunta concreta**: um encaminhamento automático deve (a) gerar um
`prompt` textual a partir do sinal e deixar `metadata.form` ausente/com valores-padrão
explícitos definidos por produto, aceitando que a interpretação de saída (`buildMktCampaignReport`)
produza um relatório genérico nesses campos; ou (b) exigir que um humano complete os campos
que só fazem sentido com input humano (`budget`, datas de lançamento) antes do encaminhamento
seguir adiante? **Não escolho — não invento defaults de produto para isso.**

### Preservação de autoria e auditoria de acesso

`requestedByUserId` permanece a autoria original do pedido — nenhuma proposta desta consulta o
sobrescreve. Se o produto decidir registrar quem mais acessou/reutilizou um encaminhamento,
a proposta técnica correta é um **histórico de eventos** (uma linha por acesso, com
`actorUserId | actorTokenId | action | timestamp`), não um único campo `lastAccessedBy` que
perderia o histórico a cada novo acesso — e deve diferenciar explicitamente acessos por usuário
(`userId` presente) de acessos por identidade de serviço (`userId` ausente, só `tokenId`).

---

## 8. Casos de teste planejados (não executados nesta rodada)

| Caso | Tipo | Status |
|---|---|---|
| Origem de outro tenant/workspace | integração com banco | **Evidência histórica**: implementado e relatado como passando em `768e1b2` (`H-origin-validation.test.ts`) — não reexecutado nesta rodada, apenas citado como evidência histórica do commit |
| Alteração de conteúdo → `ConflictError` | integração | idem (`I-fingerprint-integrity.test.ts`) |
| Permissão de destino negada | integração | idem (`D-assignment-refusal.test.ts`) |
| `isAgentAvailableInWorkspace` não bloqueia execução mesmo negando visibilidade | integração com banco | **planejado, não implementado** — achado novo desta rodada, sem teste ainda |
| `resolveActionsForExecution` fail-open sem política nenhuma | unitário | **planejado, não implementado** |
| Reuso por outro usuário do mesmo workspace | integração | **planejado**, bloqueado por decisão de produto (7.2) |
| Consulta (caminho B) | integração | **planejado**, função não existe |
| Retomada interna sem reler origem (caminho C) | integração + futuro teste de worker | **planejado**, função não existe |
| Versão de adaptador/fingerprint desatualizada em retomada | integração | **planejado**, campos de versão não existem ainda |
| Falha técnica na consulta de autorização distinta de negação de política | integração | **planejado**, não coberto |
| `Run.agent` imutável após criação | integração | **planejado** — nunca testado diretamente, só inferido por busca de código nesta rodada |

---

## Resposta final às quatro questões originais

1. **Quais conteúdos podem ser encaminhados**: tecnicamente, qualquer `Run` do mesmo
   tenant/workspace com `status="success"` e `response` objeto — sem produtor Radar ratificado
   (não localizado no código/configuração estática; não descartada a existência de dados reais
   não consultados).
2. **Quem pode encaminhar e recuperar**: qualquer identidade cujo tenant/workspace tenha
   `runs.execute` concedido — sem diferenciação individual em nenhum ponto da cadeia,
   confirmado agora inclusive na etapa de execução real (worker), não só na criação.
3. **Qual conteúdo será usado pelo MKT**: o menor contrato real é `{agent:"MKT", prompt}`;
   `metadata.form` é consumida apenas pelos interpretadores de saída, com fallback total —
   nenhum adaptador liga `originSnapshot` a esse contrato hoje.
4. **Como tratar alteração da origem sem modificar o encaminhamento anterior**: resolvido para
   o caminho A com uma classe/erro específica (`ConflictError`, único cenário que a produz) —
   corrigido nesta rodada para não generalizar outros cenários (elegibilidade, inconsistência,
   autorização) sob o mesmo nome. Caminho C continua não implementado; a proteção contra
   exclusão da origem é real (FK composta) mas não implica imutabilidade do snapshot, que
   permanece apenas disciplinar.
