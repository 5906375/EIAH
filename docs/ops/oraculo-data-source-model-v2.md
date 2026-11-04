# Oráculo SC — modelo de fornecedores, fontes, proveniência e canais (v2, estrutural)

**Status:** parcial. Contratos, categorias e catálogo candidato implementados e testados **offline**. Nenhuma conexão foi ativada, nenhuma fonte foi consultada, nenhum arquivo foi importado e nenhum dado real existe neste repositório por causa desta entrega.

**Base:** `main@77c91444`. Continua o documento `docs/ops/oraculo-data-source-contracts-v1.md` (etapa 1), que permanece válido. Os contratos `v1` **não foram alterados** (ver seção 5).

## 1. Estado encontrado antes das alterações

| Conceito | Equivalente existente | Observação |
|---|---|---|
| Fornecedor | **Nenhum** | Nenhum modelo Prisma nem contrato representa a organização que fornece informação. `supplierRef` (contrato v1) era texto livre. "partners" do IMOB são delegações de marketplace; `providerId` do IMOB identifica a *implementação de um conector* (`internal_crm`, …). Termos parecidos, conceitos diferentes. |
| Fonte | Registro do IMOB (`marketSourceRegistry`) e `eiah.data-source.v1` (etapa 1) | O v1 exigia `provider` como texto obrigatório, o que força um valor quando o responsável ainda não foi identificado. |
| Conexão | `ConnectorInstance` (sem consumidor) e `eiah.data-source-connection.v1` | Autenticação existia só dentro de duas modalidades (`authScheme`). |
| Canal | `channelBinding.ts` (hash do telefone → tenant/workspace/escopo) e o webhook de WhatsApp (stub) | Sem fornecedor, sem vínculo a caso, sem anexos. |
| Consumidor | Sem contrato próprio. Existem `agentSlug`/`AgentInstall`, escopos `log.oraculo_preparation.*` e `TenantActionPolicy` | Continua sendo só **referenciado** (`accessPolicyRef`); nenhum mecanismo de autorização novo foi criado. |

## 2. Modelo e cardinalidades

```text
Fornecedor ──(papéis)──< Fonte >── 0..1 ──> Plataforma/módulo
                          │
                          ├── 1..N modalidades (candidatas ≠ confirmadas)
                          └── 1..N Conexões ── escopo próprio ── condições próprias
Fornecedor 1 ──< N vínculos de canal (remetentes)   ·   Vínculo ──< N eventos de entrada
```

Verificado por teste (não só declarado): um fornecedor tem várias categorias e várias fontes; uma fonte tem várias partes responsáveis com papéis distintos (`publisher`, `data_owner`, `operator`, `intermediary`, `institutional_responsible`) e várias modalidades; uma fonte tem várias conexões, cada uma com escopo e condições próprios; vários vínculos de canal apontam para **um** cadastro de fornecedor. Não existe fornecedor-categoria, nem fornecedor duplicado por canal, nem percentual de propriedade institucional.

**Categoria × natureza × modalidade** são eixos independentes (`dataProviderCategorySchema` × `dataProviderNatureSchema` × `dataSourceAccessModeSchema`):

- Categorias (13): órgão público, organismo internacional, autoridade portuária, terminal portuário, depot/terminal de vazios, armador, agente marítimo, transportadora, agente de carga, despachante aduaneiro, importador/exportador, provedor de software ou dados, especialista/entidade setorial. Classificação desconhecida ou a confirmar é permitida.
- Natureza: setor público, setor privado, público internacional, sociedade civil/setorial, pessoa física, mista.
- Modalidade: `open_api`, `authenticated_api`, `data_file`, `private_api`, `channel_message`, `manual_entry` (inalteradas).

## 3. Contratos novos (todos aditivos)

| Contrato | `schemaVersion` | Arquivo |
|---|---|---|
| Fornecedor | `eiah.data-provider.v1` | `packages/contracts/src/dataSourceModel.ts` |
| Plataforma | `eiah.data-platform.v1` | idem |
| Fonte v2 | `eiah.data-source.v2` | idem |
| Condições de acesso da conexão | `eiah.data-source-access-conditions.v1` | idem |
| Evidência de origem v2 | `eiah.origin-evidence.v2` | `dataSourceProvenance.ts` |
| Divergência entre fontes | `eiah.source-divergence.v1` | idem |
| Vínculo fornecedor×canal×tenant | `eiah.supplier-channel-link.v1` | `supplierChannel.ts` |
| Evento de entrada de canal | `eiah.channel-inbound-event.v1` | idem |

Catálogo candidato: `packages/contracts/src/dataSourceCandidateCatalog.ts`. Primitivos internos (fora do barrel): `dataSourcePrimitives.ts`.

### 3.1 Incerteza por campo (substitui o "verificado único")

Não existe `metadata_verified`. Cada campo é um de quatro estados (`factV2`), e nenhum implica outro:

| Estado | Significado | Exige |
|---|---|---|
| `unknown` | ninguém afirmou nada | — (**não** é aceitação de termos nem ausência de restrição) |
| `declared` | alguém afirmou; a confirmar | base da declaração |
| `verified` | confirmado | quem, quando e **evidência da verificação** |
| `not_applicable` | o campo não se aplica | justificativa |

`confirmedAccessModes` aceita só `unknown`, `verified` ou `not_applicable`: modalidade **declarada** é *candidata* (`candidateAccessModes`), nunca confirmada.

Regras: condição de uso `permitted*` exige licença **verificada**; `validated`/`active` exigem modalidades confirmadas, licença, documentação, autenticação e responsáveis verificados, granularidade específica e condição de uso permitida; um conjunto declarado `collection_to_select` não sai de `mapped` e não recebe conexão. Mesmo ativa, a fonte tem `authorizationGranted: false`.

### 3.2 Autenticação e condições de acesso

Autenticação é **independente** da modalidade e do formato: um arquivo pode exigir credencial, uma API "pública" pode exigir chave/registro, um fornecedor privado pode não exigir nenhuma. A autenticação, os limites, o custo, a periodicidade e as condições de reutilização de *uma* conexão ficam em `eiah.data-source-access-conditions.v1`, ligado à conexão v1 por `connectionId` e escopo idênticos, **sem alterar** o contrato de conexão v1. `checkAccessConditionsAgainstConnection` aponta conflitos de credencial/esquema e credencial exigida mas ausente numa configuração completa. `unknown` não é exigência nem dispensa.

### 3.3 Origem, integridade, autenticidade, atualidade, validação, aprovação, autorização

Dimensões separadas em `eiah.origin-evidence.v2`:

| Dimensão | O que registra | O que **não** prova |
|---|---|---|
| Origem | fornecedor declarou · obtida de sistema · inserida manualmente | "oficial" não é validação, atualidade nem permissão |
| Integridade | hash (e referência ao conteúdo original, quando houver) | autoria |
| Autenticidade | método declarado/verificado/falho, **se** disponível | veracidade do conteúdo |
| Atualidade | avaliada: atual / desatualizada / desconhecida | — |
| Validação | revisão realizada, responsável, resultado | permissão para agir |
| Aprovação | decisão humana (decisor ≠ solicitante; aprovar exige validar) | autorização operacional |
| Autorização | **referência** a uma decisão do Core (`allowed`/`denied`) | o registro nunca concede (`grantsAuthorization: false`) |

Nada disso implementa assinatura, verificação criptográfica ou prova de qualquer tipo; são campos para registrar o que uma etapa futura efetivamente verificar. `upgradeOriginEvidenceV1ToV2` migra o v1 sem perda e sem promover nenhuma dimensão.

### 3.4 Divergências

`eiah.source-divergence.v1` representa conflito de valores, datas/versões diferentes, derivação de uma mesma origem e pendência de esclarecimento. **Não resolve**: não há votação, média, maioria, peso ou confiança (campos rejeitados por `.strict()`), e `automaticResolution` é o literal `false`. Claims compartilhando `originGroupId`, ou ligadas por derivação, contam como **uma** origem (`countIndependentOrigins` descreve proveniência; não é critério de decisão). Tipos de informação diferentes (estatística agregada, referência, previsão, evento observado, confirmação operacional) não formam conflito comparável. A regra de prevalência é declarada por domínio; sem ela, nada prevalece. A resolução só existe como decisão **humana** registrada, citando a regra declarada.

### 3.5 Fornecedor por canal

`eiah.supplier-channel-link.v1` e `eiah.channel-inbound-event.v1` preparam a vinculação futura. Escopo tenant/workspace obrigatório; remetente por **referência opaca** (telefone/e-mail em claro são rejeitados) com estado de verificação; associação ao caso `resolved`/`pending`/`ambiguous` (ambígua carrega candidatos e não escolhe); anexos **apenas referenciados** (`handling: "referenced_only"`, sem conteúdo, URL ou bytes); mensagem não embutida. Capacidades declaradas (`receive`, `query`, `request_update`, `propose_case_change`, `execute_action`) são declarações: `grantsAuthorization: false`, `outbound: "not_enabled"` e `transportProvider: "not_selected"` são literais. WhatsApp é canal; sua presença não comprova identidade, veracidade nem autorização.

## 4. Responsabilidades

| Camada | Responsabilidade | Estado |
|---|---|---|
| **Core** | Acesso, políticas, escopo, credenciais e autorização, conforme a implementação existente (`TenantActionPolicy`, entitlements, `ChannelBinding`) | Não alterado |
| **Infraestrutura compartilhada** | Contratos e mecanismos comuns em `packages/contracts` (zod `.strict()`, `schemaVersion`) | Contratos entregues; sem executor, resolvedor de credenciais, agendador, auditoria |
| **Oráculo SC** | Interpretação de domínio, associação ao caso, propostas de atualização (`eiah.case-update-proposal.v1`, etapa 1), regras de prevalência por domínio | Contratos prontos; nada implementado |
| **Adaptadores futuros** | Comunicar com a fonte e converter para `eiah.collection-result.v1` | Inexistentes |

Nenhum mecanismo de autorização paralelo foi criado, e nenhuma responsabilidade existente foi deslocada.

## 5. Compatibilidade com a etapa 1

- Os arquivos `dataSources.ts` e `dataSourceCatalog.ts` (v1) estão **byte a byte iguais**; um teste fixa o SHA-256 de ambos. Alterá-los passa a exigir decisão consciente (novo `schemaVersion` e novo valor no teste).
- `eiah.data-source.v2` é aditivo. A migração `upgradeDataSourceV1ToV2` preserva identidade, versão, finalidade, domínio, estado e todos os fatos `unknown`/`declared`, guarda o rótulo de provedor v1 em `legacyProviderLabel`, e **recusa** (`V1_VERIFIED_FACT_WITHOUT_EVIDENCE`) um fato `verified` do v1, que não tem evidência da verificação exigida pelo v2.
- As 4 fontes iniciais do v2 são geradas por essa migração a partir do catálogo v1, e um teste compara campo a campo.
- `checkConnectionAgainstSourceV2` distingue `ACCESS_MODE_NOT_DECLARED` de `ACCESS_MODE_NOT_CONFIRMED` (modalidade só candidata). O `checkConnectionAgainstSource` v1 continua disponível.

## 6. Catálogo candidato

Tudo `mapped`, `usageCondition: not_assessed`, `authorizationGranted: false`, escopo compartilhado. O que está afirmado vem **exclusivamente** da instrução do responsável pelo projeto (2026-11-03) e está `declared`. O resto é `unknown`; nada foi preenchido de memória nem por consulta à rede.

| `sourceId` | Nome | Responsável (papel) | Estado do que se sabe |
|---|---|---|---|
| `receita.classif.ncm` | Receita Federal/Classif — NCM | `receita-federal` (institucional, declarado) | modalidades candidatas: `open_api`, `data_file` (declaradas) |
| `ibge.localidades` | IBGE — Localidades | `ibge` (idem) | candidata: `open_api` |
| `bcb.ptax` | Banco Central — PTAX | `banco-central` (idem) | candidata: `open_api` |
| `mdic.comexstat` | MDIC — Comex Stat | `mdic` (idem) | candidata: `open_api` |
| `lexml.service-to-confirm` | LexML | **desconhecido** (responsabilidade institucional a confirmar) | modalidade desconhecida |
| `imprensa-nacional.dou-inlabs` | Imprensa Nacional — DOU/INLABS | `imprensa-nacional` (declarado) | modalidade desconhecida |
| `antaq.datasets-to-select` | ANTAQ — conjuntos a selecionar | `antaq` (declarado) | `collection_to_select`: não recebe conexão até selecionar |
| `un.comtrade.service-to-confirm` | UN Comtrade | **desconhecido** (serviço e responsável a confirmar) | modalidade desconhecida |
| `omc.data-services-to-select` | OMC — serviços de dados a selecionar | `omc` (declarado) | `collection_to_select` |

Fornecedores cadastrados (7, todos `declared`): Receita Federal, IBGE, Banco Central, MDIC, Imprensa Nacional, ANTAQ, OMC. **Não** há fornecedor para LexML nem para UN Comtrade (responsável a confirmar) e **nenhuma** empresa privada. Plataforma: `siscomex.portal-unico` — não é organização nem fonte; operadores e módulos por identificar; nenhuma fonte aponta para ela até um módulo ser identificado.

Para `lexml`, `un.comtrade` e `omc`, o `domain` é uma classificação de catálogo; `other` (OMC) foi usado onde a instrução não permite afirmar mais.

**Ainda desconhecido, em todas as 9 fontes:** cobertura, tipos de informação, documentação oficial, autenticação, licença/termos, condições de reutilização, limites, custos, periodicidade e responsável interno; **modalidade confirmada**; condição de uso. Nas 5 candidatas, também a modalidade candidata.

## 7. Referência conceitual: redes de oráculos

A separação entre provedor, transporte, evidência e consumidor, a identificação da origem, a rastreabilidade e o tratamento explícito de divergências inspiraram o desenho. **Não** foi implementado nem declarado: integração com Chainlink, blockchain, token, smart contract, DON/consenso descentralizado, CCIP, Proof of Reserve, assinatura digital pelo fornecedor, imutabilidade ou veracidade garantidas. Nenhuma dependência dessas tecnologias foi adicionada; testes verificam que os módulos novos só importam `zod` e módulos locais e que nenhum `package.json` ganhou esse tipo de dependência.

## 8. Pendências para futuras conexões

1. **Executor de saída** (política de destinos/SSRF, limites, retry, cache): inexistente. A URL cadastrada não é permissão.
2. **`ConnectorInstance`** não guarda `sourceId`, habilitação, suspensão nem `credentialRef`; decisão e migração pendentes.
3. **Resolução de credenciais** a partir de `credref:…`.
4. **Política de acesso** a avaliar por conexão (qual das existentes) e **consumidor** (quem pode consultar o quê): sem contrato próprio.
5. **Confirmação de cada fonte** por pessoa identificada, com evidência (a documentação e os termos oficiais ainda não foram lidos).
6. **Cadastro persistente** de fornecedores/fontes por tenant (o catálogo candidato é código, só para metadado de plataforma).
7. **Decisão de provedor de WhatsApp**, persistência de eventos e anexos, e política de verificação de remetente.
8. **Regras de prevalência** por domínio (nenhuma existe) e quem as ratifica.
9. **Importação do NCM** (requisitos na seção 8 do documento da etapa 1).
10. Identificar **módulos e operadores** do Portal Único e **conjuntos** da ANTAQ/OMC antes de qualquer conexão.

## 9. Achados × implementação × recomendações

| Achado | Implementado | Recomendação (não implementada) |
|---|---|---|
| Não existe fornecedor como entidade | `eiah.data-provider.v1` | Cadastro persistente por escopo, quando houver fornecedor real |
| `provider` obrigatório forçava valor | `eiah.data-source.v2` com `responsibleParties` incerto | Adotar o v2 como contrato corrente; manter o v1 só para leitura |
| Autenticação presa à modalidade | `eiah.data-source-access-conditions.v1` | Persistir junto com a conexão (decisão sobre `ConnectorInstance`) |
| "Verificado" único não serve | `factV2` por campo, com evidência | Processo humano de verificação por fonte |
| Origem/hash/assinatura/revisão se confundem | `eiah.origin-evidence.v2` | Só implementar verificação quando houver método real e decisão |
| Falta representar conflito | `eiah.source-divergence.v1` | Motor de reconciliação **só** com regra de domínio ratificada |
| WhatsApp só como stub sem vínculo | contratos de vínculo e evento | Decidir provedor, persistência e verificação antes de qualquer código |

## 10. Verificações

Esta validação (contratos, catálogo candidato e testes) foi executada localmente durante a preparação da mudança, **offline**, sem banco, rede, serviços, workers ou Docker. Seus registros permanecem como evidência local não indexável e não integram este commit. A validação versionada depende dos testes e do CI associados à mudança.
