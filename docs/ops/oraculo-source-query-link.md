# Oráculo SC — ligação interna mínima: solicitação → autorização no Core → adaptador → resultado/evidência

**Status:** parcial. A ligação interna foi **comprovada offline** com um adaptador **sintético** em memória. Ela **não** está montada em nenhuma rota, **não** usa banco, rede, fila, worker nem Docker e **não** há fonte, conexão ou adaptador real. Não existe "fonte conectada", "base alimentada" nem integração operacional.

**Base:** `main@77c91444` (a `main` avançou para `3ebbdc02` apenas com o encerramento controlado da API, sem tocar nenhum arquivo citado aqui). Continua `docs/ops/oraculo-data-source-contracts-v1.md` e `docs/ops/oraculo-data-source-model-v2.md`.

## 1. Caminho real rastreado (consumidores reais, não só exports)

Referências a `main@77c91444`.

| Etapa | Componente | arquivo:linha | Quem o consome de fato |
|---|---|---|---|
| Entrada + autenticação | `enforceTenant`: token → `authContext {tenantId, workspaceId, userId}` e cliente Prisma do tenant | `apps/api/src/middlewares/enforceTenant.ts:58,103,127` | `routes/oraculoPreparation.ts:16` (e as demais rotas) |
| Contexto da vertical | `resolveLogisticaContextAccess` (instalação + aprovação da vertical + vínculo do membro + política `log.context.read`); núcleo puro `evaluateLogisticaContextAccess` | `services/logistica/control/logisticaContextAccess.ts:62,18` | `routes/oraculoPreparation.ts:19` |
| Política exata do workspace | `TenantPolicyStore.resolveExactWorkspaceScopeDecision` (linhas de `TenantActionPolicy`, negação por padrão) | `packages/core/src/policy/TenantPolicyStore.ts:197` | `oraculoPreparation.ts:21`, `control/oraculoUploadAccess.ts:12` |
| Capacidade explícita do membro | `hasLogisticaMemberCapability` | `logisticaContextAccess.ts:53` | `oraculoPreparation.ts:23` |
| Limite declarado da vertical | `LogisticaContextAccess`: `externalTransmissionAllowed: false` | `packages/contracts/src/platformAccess.ts:15` | `logisticaContextAccess.ts:18` |
| Intenção/ação (runs) | `POST /runs` | `routes/runs.ts:485` | — |
| Aprovação | `approvalStatus` inferido na criação e alterado em `/approve` | `services/runApprovalPolicy.ts:1-14`, `runs.ts:750,803,966-996` | `runs.ts` |
| Executor por fila | `createActionRunnerHandler`: relê política, assinatura de intenção, `ToolContract`, portões de intenção e confiança, e então executa | `apps/workers/action-runner/src/index.ts:559,581,657,757` | worker de ações |
| Dispatcher de ferramentas | `executeWithMCP` → `ToolRegistry.get` + `MCPExecutor` | `action-runner/src/services/mcpAdapter.ts:28`; `packages/mcp-runner/src/executor/MCPExecutor.ts` | action-runner, `workers/runWorker.ts:1556,1662` |
| Despacho em processo (precedente) | `decideSourceAccess` → `SourceConnectorRegistry.search` → provider → bundle de evidência | `imob/marketScan/marketScanPipeline.ts:100,132`; `sourceConnectorRegistry.ts:21` | `imob/crm/imobCrmTurnEngine.ts:442` |
| Auditoria | `recordGuardrailAudit` → `guardrailAuditLedger` | `packages/core/src/services/guardrailLedgerStore.ts:62` | `mcpAdapter.ts`, `enforceTenant.ts` |
| Caso do Oráculo | `OraculoPreparationRepository` (escopado por tenant/workspace; revisões apendáveis) | `services/logistica/oraculo/preparationRepository.ts:23` | `oraculoPreparation.ts` |

**Achados que condicionam o encaixe**

1. **O acesso de contexto da Logística não cobre consulta externa.** O próprio contrato declara `externalTransmissionAllowed: false`. Enviar parâmetros a uma fonte externa exige, portanto, um escopo próprio; o contexto é necessário, não suficiente.
2. **`MCPExecutor` é inadequado para fontes de dados.** O tipo de executor é fechado (`"http" | "db" | "web3" | "fs"`, `ToolContract.ts:9`); `execHttp` faz `fetch(input.url)` com a URL vinda da **entrada** (`MCPExecutor.ts:117`) e `execFs` lê qualquer caminho (`:213`). Aceitar URL do cliente é exatamente o que esta entrega proíbe. Além disso exige run, fila e uma linha `ToolContract` no banco.
3. **`SourceConnectorRegistry` é do IMOB**: tipado com `MarketScanProvider`/`MarketScanQuery`; generalizá-lo seria a refatoração ampla que o escopo veda.
4. **Aprovação não é revalidada no executor.** `approvalStatus` é gravado na criação e alterado em `/approve`; `action-runner/src/index.ts` e `workers/runWorker.ts` não têm nenhuma referência a aprovação (0 ocorrências por `grep`). O executor relê política, assinatura, contrato e portões, mas não o estado de aprovação. Isso **não** afeta o caminho escolhido (que não usa run), mas é um risco real para quem levar uma consulta ao caminho por fila.
5. **Segundo o registro anterior do projeto (R1-B; não reverificado nesta entrega), não há caminho governado para conceder `log.*` a membros.** Se isso se mantém, na prática, o novo escopo de consulta não é concedível hoje: o comportamento por padrão é negar.

## 2. As quatro perguntas

- **A. Onde o Oráculo solicita uma fonte:** em um serviço síncrono da própria vertical, `createSourceQueryService().execute(request, context)` em `services/logistica/oraculo/sourceQuery/sourceQueryService.ts`, chamado pela camada de rota do Oráculo **depois** de `enforceTenant`, com `context = req.authContext`. O Oráculo pede por **identificador** (`sourceId` + `operation` + `purpose` + parâmetros tipados), nunca por URL ou credencial. **A rota ainda não existe** (ver seção 7).
- **B. Onde a autorização é avaliada:** na porta `SourceQueryAccessPort`, implementada por `createCoreSourceQueryAccess` (`control/oraculoSourceQueryCoreWiring.ts`), que **compõe** as verificações já aplicadas pela rota de preparação: contexto da vertical com uso integral, política exata do workspace e capacidade explícita do membro. Nada de autorização nova no adaptador ou no serviço.
- **C. Quem chama o adaptador:** o próprio serviço, e só depois de toda a cadeia de verificações. O adaptador (`SourceAdapter`) recebe a solicitação validada e um contexto mínimo; não decide acesso.
- **D. Como volta o resultado e a evidência:** o serviço devolve `SourceQueryOutcomeV1` (`eiah.source-query-outcome.v1`): ou `denied` (estágio + código, adaptador não chamado) ou `executed` com um `CollectionResultV1` (a etapa 1), origem como evidência, `evidenceRefs`, propostas e a descrição honesta da auditoria.

## 3. Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Run + fila + `action-runner` + `MCPExecutor` | Exige run e linha `ToolContract` no banco; os executores são `http/db/web3/fs` com URL e caminho vindos da entrada; a aprovação não é revalidada no executor. Obriga uma consulta simples a criar um run, o que a arquitetura não exige. |
| Generalizar `decideSourceAccess`/`SourceConnectorRegistry` do IMOB | Tipos e operações do IMOB; refatoração ampla (vetada) e mistura de estado técnico, termos e habilitação num só campo. |
| `callLegacyApi` como adaptador | Sem lista de destinos, limite de tamanho nem retry, e sem consumidor; proteções de saída não demonstradas. |
| Rota HTTP nova agora | Cria superfície pública sem armazenamento de conexões nem adaptador real; decisão de produto e de segurança pendente. |
| **Serviço síncrono em processo + portas (escolhida)** | Mesmo padrão do market scan do IMOB, reaproveita as verificações do Core, sem fila (logo, sem autorização "velha"), sem runtime novo. |

## 4. Contrato Oráculo ↔ Core ↔ adaptador

- **Solicitação** (`eiah.source-query-request.v1`, `packages/contracts/src/dataSourceQuery.ts`): `sourceId`, `operation`, `purpose`, `params` (≤ 8 KiB), `correlationId?`, `caseRef? {caseId, expectedRevision}`. `.strict()`: tenant, workspace, usuário, URL, credencial, autorização, `connectionId`, escopo etc. **não existem** e são rejeitados.
- **Escopos novos (PROPOSTA, não ratificada, não concedida):** `ORACULO_SOURCE_QUERY_SCOPE = "log.oraculo_source.query"` (porta geral) e o prefixo `log.oraculo_source.` que uma conexão pode referenciar em `accessPolicyRef` (uma conexão não pode apontar para escopo de outro domínio). Ver `docs/ops/authorization-scopes-catalog.md`.
- **Porta de acesso** (`SourceQueryAccessPort`): `checkQueryAccess(identity)` (geral, antes de revelar qualquer fonte) e `checkConnectionPolicy(identity, scope)`.
- **Portas de dados:** `SourceCatalogPort`, `ConnectionResolverPort` (resolve **por escopo do servidor**), `CasePort` (só `get`: não há método de escrita), `SourceQueryAuditSink`.
- **Adaptador** (`SourceAdapter`): `descriptor` (fonte, modalidade, operações com **esquema estrito** de parâmetros, finalidades permitidas, `synthetic?`) e `execute(call)`. `call` contém só `correlationId, sourceId, sourceVersion, connectionId, operation, purpose, params, scope`: **sem usuário, credencial ou URL**. A resposta é validada (`adapterOutcomeSchema`); identidade, escopo, `resultId` e `collectedAt` são **do servidor**, o adaptador não os define.
- **Resultado:** `eiah.source-query-outcome.v1`. `denied` ⇒ `adapterInvoked: false`; `executed` ⇒ `adapterInvocations: 1`; `caseMutationApplied` é o literal `false` nos dois.

## 5. Controles efetivamente exercidos (ordem de avaliação)

| # | Controle | Recusa (`stage`/`reasonCode`) |
|---|---|---|
| 0 | identidade/escopo do servidor presentes (usuário não vazio) | `access/CONTEXT_MISSING` |
| 1 | solicitação estrita (nada de tenant/URL/credencial do cliente) | `request/REQUEST_INVALID` |
| 2 | Core, **antes de revelar detalhes**: contexto da vertical com uso **integral**, política exata + capacidade do membro para `log.oraculo_source.query`; erro ⇒ nega | `access/ACCESS_CONTEXT_DENIED`, `QUERY_SCOPE_DENIED` |
| 3 | fonte conhecida e íntegra; **estado técnico `active`** (mapeada, em configuração, em teste, validada e suspensa são negadas); escopo da fonte | `source/SOURCE_UNKNOWN`, `SOURCE_NOT_ACTIVE`, `SOURCE_SUSPENDED`, `SOURCE_SCOPE_MISMATCH` |
| 4 | conexão do escopo do servidor; visível no escopo; compatível com a fonte (modalidade **confirmada**); não suspensa, configurada e habilitada; condições de acesso coerentes; autenticação **conhecida**; nada que exija credencial (não há resolvedor) | `connection/CONNECTION_*`, `CONDITIONS_MISSING_OR_INCOMPATIBLE`, `AUTHENTICATION_UNKNOWN`, `CREDENTIAL_RESOLUTION_UNAVAILABLE` |
| 5 | política exata referenciada pela conexão, só sob o prefixo do Oráculo, + capacidade do membro | `policy/POLICY_REFERENCE_INVALID`, `CONNECTION_POLICY_DENIED` |
| 6 | adaptador registrado (sintético só com `allowSyntheticAdapters`), operação (sem herança do protótipo), finalidade, parâmetros pelo esquema estrito | `adapter/*`, `parameters/PARAMETERS_INVALID` |
| 7 | caso (se informado): existe no escopo do servidor e revisão confere | `case/CASE_NOT_FOUND`, `CASE_REVISION_MISMATCH` |
| 8 | rastro da autorização gravado **antes** do despacho; falha ⇒ nada sai | `audit/AUDIT_UNAVAILABLE` |
| 9 | despacho: **uma** chamada, com timeout; exceção não repassa a mensagem; resposta validada; hash do conteúdo normalizado **conferido**; nada é promovido (`not_validated`, `not_requested`, `operationalAuthorization: false`) | resultado `failure` tipado (`internal_error`, `timeout`, `invalid_response`, `schema_violation`) |

Estado técnico, condição de uso e autorização são avaliados em passos distintos; **mapped, modalidade declarada ou existir no catálogo nunca é permissão**. Não há fila: a autorização é reavaliada **a cada** `execute`, imediatamente antes do despacho (teste: revogar a política vale na chamada seguinte). Se esta consulta migrar para o caminho por fila, a revalidação no executor passa a ser obrigatória (ver achado 4).

## 6. Existente · implementado · simulado · pendente

| | Itens |
|---|---|
| **Existente e reutilizado** | `enforceTenant`/`authContext`; `evaluateLogisticaContextAccess`/`resolveLogisticaContextAccess`; `TenantPolicyStore.resolveExactWorkspaceScopeDecision`; `hasLogisticaMemberCapability`; `recordGuardrailAudit`; `OraculoPreparationRepository`; contratos da etapa 1 (`CollectionResult`, `OriginEvidence`, `CaseUpdateProposal`, conexão, condições de acesso, fonte v2) |
| **Implementado nesta entrega** | `dataSourceQuery.ts` (contrato); `sourceQuery/types.ts` (portas e interface de adaptador); `sourceQuery/sourceQueryService.ts` (serviço, sink em memória, negar-tudo por padrão); `control/oraculoSourceQueryCoreWiring.ts` (composição com o Core, sink do ledger, porta de caso); testes |
| **Simulado nos testes** | adaptador sintético (`tests/support/syntheticSourceAdapter.ts`, `synthetic: true`, fora de qualquer catálogo); as funções do Core como dublês (`CoreAccessDeps`); catálogo/conexões/caso em memória; auditoria em memória; relógio e ids |
| **Pendente** | rota; armazenamento de conexões (`ConnectorInstance` sem estado nem `credentialRef`); adaptadores reais; resolvedor de credenciais; política de destinos/SSRF; concessão governada de `log.oraculo_source.*`; ratificação do escopo; idempotência/limite de taxa/cache; persistência de recibo |

## 7. O que foi registrado e onde

- **Testes:** auditoria **somente em memória** (`durability: "in_memory_only"`); os resultados dizem isso. Nenhum recibo ou auditoria persistida foi gerado ou é declarado.
- **Fiação de produção (existe, não executada contra banco):** `createGuardrailAuditSink` escreve pelo `recordGuardrailAudit` (`guardrailAuditLedger`) e só declara `persisted` **depois** da escrita; os valores dos parâmetros **não** são gravados, só o hash. Foi validado com um gravador de teste, não contra PostgreSQL.
- **Não há recibo canônico** (`receiptCanonService`) nem bundle de run: a consulta não cria run.

## 8. Lacunas que impedem conexões reais

1. **Rota** não montada: decidir a superfície pública e quem a chama.
2. **Armazenamento de conexões/condições:** sem consumidor de `ConnectorInstance` e sem colunas para estado e credencial.
3. **Adaptadores reais** e **resolvedor de credenciais**: hoje qualquer fonte que exija credencial é negada.
4. **Política de destinos/SSRF** no executor de saída, limites de tamanho, retry e cache: inexistentes.
5. **Escopos:** concessão governada de capacidades `log.*` a membros (R1-B, conforme registro anterior; a reverificar) e ratificação de `log.oraculo_source.*`.
6. **Aprovação não revalidada no executor** do caminho por fila (achado 4).
7. **Fontes do catálogo:** todas `mapped`, com metadados desconhecidos (nenhuma verificada).
8. **Idempotência** e **limite de taxa** da consulta; **retenção** do resultado.

## 9. Testes e evidência

Esta validação (serviço de consulta, ligação com o Core e testes com adaptador sintético) foi executada localmente durante a preparação da mudança, **offline**. Seus registros permanecem como evidência local não indexável e não integram este commit. A validação versionada depende dos testes e do CI associados à mudança.
