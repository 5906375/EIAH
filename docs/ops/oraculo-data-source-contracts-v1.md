# Oráculo SC — contratos de fonte de dados e catálogo inicial (v1)

**Status:** parcial. Contratos e catálogo implementados e testados **offline**; nenhuma fonte está conectada, nenhum dado foi coletado e nada foi ativado. Não há evidência indexável nesta entrega (o Evidence Index não foi alterado).

**Base:** `main@77c91444`. Estes contratos não alteram nenhum consumidor existente.

> Resumo honesto: *contratos e catálogo preparados e testados offline*. Isto **não** é "Oráculo conectado" nem "base alimentada".

## 1. O que existe nesta entrega

| Contrato | `schemaVersion` | Para quê |
|---|---|---|
| Fonte | `eiah.data-source.v1` | Metadado de uma fonte: provedor, finalidade, domínio, modalidades, documentação, licença, periodicidade, limites, responsável, estado técnico |
| Conexão | `eiah.data-source-connection.v1` | Uma instância configurada de uma fonte, com escopo, modalidade selecionada e configuração tipada |
| Resultado de coleta | `eiah.collection-result.v1` | `success`, `empty`, `not_modified` ou `failure`, com datas, evidência do original e da transformação, avisos e erro estruturado |
| Evidência de origem | `eiah.origin-evidence.v1` | Origem (fornecedor, sistema ou manual) separada de validação e de aprovação |
| Proposta de atualização do caso | `eiah.case-update-proposal.v1` | Alterações propostas com `expectedRevision`, evidências e decisão humana — nunca aplicada nesta etapa |

Código: `packages/contracts/src/dataSources.ts` (schemas e funções puras) e `packages/contracts/src/dataSourceCatalog.ts` (catálogo). Ambos exportados por `packages/contracts/src/index.ts`.
Testes: `packages/contracts/tests/dataSources.test.ts` (contratos e catálogo) e `apps/api/src/tests/oraculo-data-source-contracts.compat.test.ts` (compatibilidade com consumidores existentes). Os dois entram no script `test:oraculo-s1`, que o CI já executa.

## 2. Regras que os contratos impõem

Quatro conceitos são independentes e nenhum implica outro:

1. **Modalidade de acesso:** `open_api`, `authenticated_api`, `data_file`, `private_api`, `channel_message`, `manual_entry`.
2. **Estado técnico:** `lifecycleState` da fonte (`mapped → configuring → testing → validated → active | suspended`); `configuration`, `enablement` e `suspension` da conexão.
3. **Condição de uso:** `usageCondition` e `licenseTerms`.
4. **Autorização:** `authorizationGranted` é o literal `false` na fonte e na conexão. Fonte ativa e conexão habilitada **não** concedem autorização; quem decide é a política de acesso existente, avaliada por um executor que ainda não existe.

Demais regras verificadas por teste:

- Metadado desconhecido é explícito (`unknown`); `declared` exige a base da declaração; `verified` exige quem e quando. Omitir um campo é inválido.
- `validated`/`active` exigem licença, documentação e modalidades **verificadas** e condição de uso avaliada e permitida.
- Nenhum segredo: contratos `.strict()`, credencial só por referência opaca (`credref:...`), URL cadastrada sem credencial, query string ou fragmento.
- Uma URL cadastrada **não concede permissão de rede** (`grantsNetworkPermission: false`, `destinationPolicy: "validated_by_executor"`). O destino deve ser validado pelo executor a cada requisição.
- Habilitar uma conexão exige configuração completa, ausência de suspensão e uma referência de política de acesso existente. `private_api`, `channel_message` e `manual_entry` exigem escopo tenant/workspace.
- Visibilidade por escopo é fail-closed: sem tenant **e** workspace do chamador, nada é visível. Isto é isolamento, não autorização.
- Resultado: vazio ≠ erro; datas de referência, publicação, vigência e coleta são distintas, e as ausentes são declaradas `unknown`; mensagem de erro não pode conter segredo; não existe campo de "confiança" numérica; um resultado não precisa de caso nem de conexão (consulta geral), mas, se citar um caso, o escopo deve ser o mesmo tenant/workspace.
- Origem "oficial" ou "de sistema" não é validação nem aprovação; aprovar exige validação prévia e decisor diferente de quem pediu.
- Proposta: `expectedRevision` obrigatório, cada alteração ligada a evidência declarada, caminhos com segmentos reservados (`__proto__`, `constructor`, `prototype`) rejeitados, decisão só por humano diferente do proponente, `caseMutationApplied: false`.

## 3. Responsabilidades

| Camada | Responsabilidade | Estado |
|---|---|---|
| **Core** | Contratos comuns, catálogo, política de acesso/autorização, executor de saída (política de destino, limites, retry, cache), resolução de credenciais, agendamento, auditoria e retenção | Só contratos e catálogo existem. O restante **não existe**. |
| **Vertical Logística/Oráculo** | Normalizadores de domínio, decisão de qual fonte consultar, e a proposta de atualização do caso (reaproveitando `humanDecisions`/`expectedRevision`) | Não implementado |
| **Adaptadores** (futuros) | Finos, um por fonte, somente leitura; entregam ao Core um resultado conforme `eiah.collection-result.v1` e nenhuma regra de negócio | Não implementado |

O `ChatAgentLauncher` não é tocado.

## 4. O que foi reaproveitado, e por quê

| Existente | Uso | Motivo |
|---|---|---|
| `packages/contracts` (zod `.strict()`, `schemaVersion` literal) | Local e convenção dos contratos | É onde o Oráculo já declara contratos; o CI já faz typecheck e testes desse diretório |
| `oraculoDecisionValueSchema` (`oraculoPreparation.ts`) | Valores de decisão da aprovação e da proposta | Um único vocabulário de decisão (`approved`, `rejected`, `more_information`) |
| `expectedRevision`, sha256 hex minúsculo, flags `operationalAuthorization: false`, decisor ≠ solicitante | Mesmas regras na proposta e na evidência | Consistência com a preparação e com a decisão humana J17 |
| `ConnectorInstance` (`schema.prisma`) | **Destino futuro** da conexão: `tenantId`, `workspaceId`, `connector` e `config Json?` comportam o contrato | Já existe, sem consumidor; evita uma tabela paralela |
| Política de acesso existente (`TenantActionPolicy`, `TenantProductInstallation`) | Apenas **referenciada** por `accessPolicyRef` | Não cria um segundo mecanismo de autorização |

**Não reaproveitado, de propósito:**

- `marketSourceRegistry` / `sourceAccessPolicyGate` / `sourceConnectorRegistry` (IMOB): têm tipos e operações do IMOB e juntam num só campo `status` o estado técnico, os termos e a habilitação; usam `confidenceCap` numérico. Generalizá-los agora seria refatoração ampla e misturaria conceitos que este contrato separa. Permanecem **intactos**; o teste de compatibilidade prova que o catálogo novo não colide com eles e que o gate do IMOB nega as fontes novas.
- `callLegacyApi` (`packages/core/src/integrations/legacyApiConnector.ts`): sem lista de destinos, limite de tamanho, retry ou cache, e sem consumidor. É candidato a base do executor, **depois** de endurecido; não foi tocado.
- `channelBinding.ts` / webhook de WhatsApp: só referenciados por `channelBindingRef`; nada de WhatsApp foi implementado.

## 5. Preparado apenas por contrato (sem implementação)

Modalidades `authenticated_api`, `private_api`, `data_file`, `channel_message` e `manual_entry`; resultado normalizado; evidência de origem; proposta de atualização; referência de credencial. Nenhuma tem executor, conector, rota, worker, migração ou fixture operacional. Não há parceiro, credencial ou capacidade cadastrados.

## 6. Catálogo inicial

Quatro fontes, todas `mapped`, `usageCondition: not_assessed`, `authorizationGranted: false`. Nenhuma URL oficial, licença, periodicidade, limite, cobertura ou responsável foi encontrado em arquivo versionado do repositório, e **nenhum foi preenchido de memória nem por consulta à rede**.

| `sourceId` | Provedor | Modalidades (declaradas, não verificadas) | Pendente de confirmação |
|---|---|---|---|
| `receita.classif.ncm` | Receita Federal — Classif | `open_api`, `data_file` | cobertura, documentação oficial, licença/termos, periodicidade, limites, responsável, condição de uso; também **se** a API e o arquivo de fato existem nas modalidades declaradas |
| `ibge.localidades` | IBGE | `open_api` | idem |
| `bcb.ptax` | Banco Central do Brasil | `open_api` | idem |
| `mdic.comexstat` | MDIC — Comex Stat | `open_api` | idem |

As modalidades vêm da instrução do responsável pelo projeto (2026-11-03) e estão marcadas `declared`. `listUnverifiedDataSourceMetadata(source)` devolve a lista dos campos ainda não verificados. O catálogo é metadado puro: importá-lo não faz chamada, não lê ambiente ou segredo e não agenda job. O módulo é congelado (`Object.freeze` profundo).

**Para ir de `mapped` a `validated`**, cada fonte precisa de documentação oficial, licença/termos e modalidades **verificados** por pessoa identificada e de condição de uso avaliada. O schema recusa a transição sem isso.

## 7. Dependências e decisões em aberto (não executadas aqui)

1. **`ConnectorInstance` não guarda estado nem referência de credencial.** Faltam `sourceId`, habilitação, suspensão e `credentialRef` como colunas (ou como parte de `config`). Isso exige decisão e migração, **não feitas**; o teste de compatibilidade documenta a lacuna e falha se aparecer coluna de segredo.
2. **Executor de saída:** política de destinos (lista de hosts, bloqueio de IPs privados/metadados), limite de tamanho, timeout, retry, cache. Não há guarda de SSRF em nenhum ponto do código atual. A URL cadastrada **não** vale como permissão.
3. **Resolução de credenciais** a partir de `credref:...`: componente inexistente.
4. **Política de acesso:** definir qual política existente é avaliada para uma conexão (`TenantActionPolicy` vs. entitlement do produto). `accessPolicyRef` só carrega a referência.
5. **Generalização do gate do IMOB:** não feita. Se vier a ser desejada, é refatoração própria, com os testes do IMOB como rede de segurança.
6. **Catálogo em código, não em banco:** adequado para metadado de plataforma; fontes por tenant dependem do item 1.
7. **Baselines JSON e `check:*`:** não criados; estes são os contratos v1 iniciais. Mudança incompatível futura exige novo `schemaVersion`.

## 8. Requisitos da próxima etapa: importação do NCM (proposta)

Nada abaixo foi implementado. **Não liberar JSON no upload genérico** (`apps/api/src/routes/uploads.ts` permite hoje apenas PDF, Word, texto, PNG e JPEG, com limite de 5 MB e tipo informado pelo cliente) e não ampliar permissões ou formatos globais. A importação precisa de um caminho próprio, com permissão própria, e deve:

1. **Validar estrutura, conteúdo e tamanho:** limite de bytes específico, JSON válido por esquema versionado, campos obrigatórios, formato do código NCM, tipos e limites de profundidade/quantidade; rejeitar o que não conformar, com motivo estruturado.
2. **Não confiar no tipo informado pelo cliente:** verificar o conteúdo, não só o cabeçalho.
3. **Preservar o original** byte a byte (`storage.status: "preserved"`), separado do conteúdo normalizado.
4. **Calcular o hash** do original e do normalizado já no recebimento (hoje `UploadedDocument` não guarda hash; o Oráculo só calcula sha256 ao vincular a evidência).
5. **Versionar** cada importação (versão, instante, quem importou, origem declarada) e registrar a data de referência/publicação do arquivo quando conhecida, ou `unknown`.
6. **Detectar duplicidade** por hash do original e por versão/data de referência, sem sobrescrever a anterior; reimportar o mesmo conteúdo é no-op explícito.
7. **Permitir consultar a versão importada** (qual versão respondeu a cada consulta), distinguir versão vigente de anteriores e devolver `eiah.collection-result.v1` (`success`, `empty` ou `failure`).
8. **Isolar por escopo:** definir se a base NCM é compartilhada (`shared`) ou por tenant antes de gravar.
9. **Origem e validação separadas:** a importação é origem `manual_entry` ou `system_obtained`, `not_validated` até revisão humana; importar não equivale a validar nem a autorizar.
10. **Sem efeito em casos:** a consulta gera, no máximo, uma proposta de atualização (`eiah.case-update-proposal.v1`) para decisão humana.

## 9. Verificações executadas

Ver o registro de comandos e resultados na entrega que acompanha este documento. Resumo: typecheck de CI (`pnpm typecheck:oraculo-ci1`), `pnpm test:oraculo-s1` (inclui os dois novos arquivos de teste) e os testes do IMOB que consomem o registro e o gate, todos offline, sem rede e sem banco.
