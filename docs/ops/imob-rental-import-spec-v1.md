# IMOB — Especificação do importador independente de locações e histórico (v1)

> Classificação documental: **PÚBLICA** (versão sanitizada para publicação). Documento de especificação; nada aqui está implementado e os requisitos de autorização são prospectivos.

## 0. Status deste documento

- Frente isolada em `experiment/imob-rental-import`. Nenhum código, schema, migration, teste ou importador foi implementado; este arquivo é a única alteração desta frente.
- Este documento é uma **especificação**. Os requisitos de autorização, concorrência e isolamento são **prospectivos** (“deve”): descrevem o que a implementação precisará atender e **não afirmam** que qualquer controle já exista ou esteja validado.
- As premissas arquiteturais em que a especificação se apoia estão resumidas na seção 1.
- Fora do escopo: qualquer extensão para cobrança, pagamento, Radar ou MKT (seção 4).

## 1. Premissas arquiteturais

- Modelos IMOB existentes, que o importador reaproveita por referência ou mantém intocados: `ImobOwner`, `ImobProperty`, `ImobLead`, `ImobCase`, `ImobCaseEvent`, `ImobMarketScanRun`, `UploadedDocument`. Não existe modelo genérico de contrato, locação ou pessoa — daí as entidades novas da seção 5.
- O intake documental atual (upload → extração determinística → mascaramento de PII → classificação → draft com TTL → confirmação → processamento assíncrono) **não persiste** os valores estruturados extraídos (aluguel, condomínio, caução, datas, índice de reajuste): eles só existem no draft temporário e na resposta do upload.
- Não há vínculo persistente entre um caso (`ImobCase`) e o documento original (`UploadedDocument`); o importador precisa registrar esse vínculo por conta própria (`RentalDocumentLink`, seção 5).
- A deduplicação de lead e proprietário já segue o padrão que esta especificação adota: identificador forte (documento, telefone ou e-mail) hidrata automaticamente; correspondência apenas por nome **nunca** funde automaticamente e sempre exige escolha humana explícita.
- O workspace possui papéis e permissões por usuário. O importador deve usar permissões individuais próprias (seção 9).
- Padrões de trava por unidade e de controle otimista de versão (seções 6 e 8) devem ser validados na implementação; não se presume reuso de mecanismos existentes.

## 2. Cenários de negócio que orientam os requisitos

Os cenários abaixo, descritos de forma genérica, orientam os requisitos funcionais. Nenhum dado real, nome, planilha ou contrato é, ou será, copiado para este repositório; os exemplos da seção 10 usam identificadores neutros.

- Unidades residenciais e comerciais com ocupação atual informada pelo gestor, com ou sem contrato vinculado; o vínculo com o arquivo do contrato pode permanecer pendente sem invalidar a informação de ocupação.
- Locações comerciais em que o locatário é dispensado de um ou mais encargos (por exemplo IPTU e condomínio). A existência efetiva de cada encargo, o responsável alternativo, o valor e a vigência da dispensa podem ser desconhecidos e permanecem desconhecidos, sem inferência.
- Acordos verbais, com valor mensal informado e sem documento escrito.
- Ocupantes e documentos históricos como candidatos ao histórico, sem inferência de data de saída, assinatura, pagamento ou distrato, e sem associação de documento à unidade apenas pelo nome do arquivo.

## 3. Decisões de escopo preservadas

- As informações de ocupação fornecidas pelo gestor são tratadas como **fatos informados**, não como dados já confirmados na plataforma.
- Princípios de desenho adotados: revalidação de autorização no momento da aplicação (seção 7) e confirmação humana antes de qualquer efeito.
- Nenhuma extensão para cobrança, pagamento, Radar ou MKT está incluída (seção 4).

## 4. Escopo e não-escopo

**Dentro do escopo**: cadastro de unidade, pessoa e papéis, locação, múltiplas partes por locação, valores de aluguel por período, encargos com dispensa separada de existência/responsável/valor/vigência, caução **prevista** (nunca recebimento), documentos vinculados e suas versões, ocupação atual separada de histórico, origem e confirmação humana por campo. Importação direta e transacional — sem confirmação do intake documental, sem `Run`, fila, worker, execução de agente ou LLM.

**Fora do escopo**: recebimento de caução, cobrança, pagamento de aluguel, qualquer integração automática com Radar ou MKT, qualquer melhoria do pipeline de intake documental existente (seção 11).

**Não decidido, e não presumido decidido por esta priorização**: separar locação do funil de `ImobLead` (recomendação arquitetural mantida, não uma aprovação de schema); nomes finais de campos/tabelas; escopos de autorização (seção 9, propostos, não aprovados).

## 5. Contrato de dados proposto

Convenção: todo campo relevante carrega `origin` (`"informed_by_manager"` | `"document_extraction"` | `"platform_confirmation"` | `"unknown"`), por campo, não pelo registro inteiro.

```
RentalUnit {
  id, tenantId, workspaceId
  unitLabel: string            // texto livre informado, sem padronização inventada
  unitType: "residential" | "commercial"
  propertyRef?: string          // ImobProperty.id, quando existir vínculo
}

Party {
  id, tenantId, workspaceId
  name: string                  // exatamente o informado — nunca nome completo inventado
  document?: string
  contact?: { phone?: string; email?: string }
}

RentalAgreement {
  id, tenantId, workspaceId
  unitId: string
  stableAgreementKey: string     // opaco, atribuído uma única vez — ver seção 6
  version: integer                // controle otimista — ver seção 8
  agreementType: "written" | "verbal" | "unknown"
  hasLinkedDocument: boolean       // derivado — count(documentLinks) > 0, independente de agreementType
  currentOccupancy: { value: "occupied" | "vacant" | "unknown", informedBy: "manager", asOf?: string }
  currentRentInformedByManager?: { amountCents: number, informedAt?: string }
}

RentalAgreementParty { agreementId, partyId, role: "tenant" | "co_tenant" | "guarantor" }

RentAmountPeriod {
  id, agreementId, amountCents
  periodStart?: string                                    // inclusivo
  periodEndType: "known" | "unknown" | "explicitly_open"
  periodEnd?: string                                        // exclusivo, só quando periodEndType === "known"
  supersededAt?: string
  correctsPeriodId?: string
  origin
}

ChargeCondition {
  agreementId, chargeType: "condo_fee" | "iptu"
  tenantWaived: "yes" | "no" | "unknown"
  chargeExists: "yes" | "no" | "unknown"
  effectiveResponsibleParty: string | "unknown"   // responsável EFETIVO, nunca "quem pagaria se não houvesse dispensa"
  amountCents: number | null                        // desconhecido = null, nunca 0
  effectivePeriod: { start?: string; end?: string } | "unknown"
}

DepositTerms { agreementId, expectedAmountCents?: number, expectedInstallments?: number, origin }
// Recebimento de caução está fora do escopo desta entrega — nenhuma estrutura de recebimento é proposta.

RentalDocumentLink {
  agreementId, documentRef: string   // UploadedDocument.id
  role: string                        // texto livre, ex. "faixas_de_aluguel"
  verificationStatus: "not_verified" | "human_reviewed"
  supersedesLinkId?: string           // só quando há conflito real no MESMO campo/período
}

RentalHistoryEvent {   // append-only, mesmo padrão de ImobCaseEvent — disciplinar, não garantido por banco
  id, agreementId, type: string
  actorType: "manager_report" | "document_extraction" | "human_confirmation" | "system"
  payload: object
  createdAt: string   // servidor
}
```

## 6. Identidade e deduplicação

`stableAgreementKey` é opaco e **nunca** derivado de `unitId`+`partyId`(s)+`agreementType` — essa combinação é só um sinal para gerar candidatos de correspondência, nunca identidade automática. As mesmas partes podem celebrar mais de uma locação na mesma unidade.

**Caminho A — chave estável presente na linha importada**: buscar `RentalAgreement` por `(tenantId, workspaceId, stableAgreementKey)`; se não existir nesse tenant/workspace, rejeitar como erro de referência (nunca criar sob uma chave "adivinhada"); se existir, verificar autorização (seção 9) e vincular.

**Caminho B — sem identificador confiável**: apresentar candidatos (locações na mesma unidade com sobreposição de identificador forte de pessoa) e exigir decisão humana explícita — vincular a um candidato ou criar deliberadamente uma nova locação, mesmo que unidade/partes/tipo coincidam com um candidato.

**Persistência e reuso da resolução**: a resolução de um item não gera automaticamente uma chave reutilizável pelo próprio sistema. O resultado do lote devolve claramente `sourceRowRef → stableAgreementKey`; cabe a quem prepara o lote seguinte carregar essa referência adiante. Sem isso, todo reenvio sem `stableAgreementKey` explícito volta ao Caminho B — esta é a garantia real do desenho, não uma limitação a "corrigir depois".

**Uma constraint única em `stableAgreementKey` não impede duplicação** quando dois processos, sem coordenação, atribuem chaves *diferentes* à mesma locação real — ela só impede duas linhas com a *mesma* chave. Por isso, a resolução do Caminho B, na fase de commit, roda sob uma trava explícita por unidade (`SELECT ... FOR UPDATE` sobre a unidade, ou trava consultiva do Postgres por `(tenantId, workspaceId, unitId)` — padrão a validar na implementação) — dentro dela, os candidatos são reconsultados; se uma locação nova foi criada por outro processo desde a revisão humana, a decisão anterior é invalidada e o item volta para nova revisão com a lista atualizada.

**Identidade da própria unidade, na primeira importação**: mesma lógica — `RentalUnit` também precisa de resolução por candidato (não união automática por rótulo de texto), com a mesma trava, para evitar duas unidades duplicadas quando dois itens do primeiro lote referenciam a "mesma" unidade por texto diferente.

**Não é prometido**: reconhecimento automático perfeito; proibição de duas locações simultâneas na mesma unidade (regra de negócio não aprovada — ver seção 13); deduplicação de pessoa por nome isolado (nunca) ou entre tenants diferentes por CPF/CNPJ (nunca).

## 7. Fluxo revisão → confirmação → aplicação

Sem `Run`, fila, worker, execução de agente ou LLM, em toda esta seção.

```
ImportBatchItem { id, tenantId, workspaceId, sourceBatchId, sourceRowRef
  content: object, contentVersion: integer, resolution: {...} | null
  status: "pending_review" | "confirmed" | "applied" | "rejected" }

ImportBatchItemConfirmation { itemId
  confirmedContentVersion: integer     // == contentVersion no instante da confirmação
  confirmedSnapshot: object             // cópia imutável do content + resolution mostrados ao humano
  confirmedByUserId, confirmedAt        // derivados do servidor, nunca do corpo da requisição }
```

Quatro estados distintos: **(1) simulação sem escrita** — valida contra o contrato, nada toca o banco, nem staging; **(2) lote de revisão persistido** — grava em `ImportBatchItem` com `status: "pending_review"`, sobrevive a reinício de processo; **(3) confirmação** — captura `confirmedSnapshot`/`confirmedContentVersion`, não aplica ainda; **(4) aplicação transacional** — só então muta os registros de destino.

Qualquer edição do `content`/`resolution` após a confirmação incrementa `contentVersion`, invalidando a confirmação anterior sem campo extra — a aplicação sempre compara `confirmedContentVersion` com o `contentVersion` atual.

**Na aplicação, dentro de uma única transação por unidade lógica**: reler item + confirmação; verificar `confirmedContentVersion === contentVersion` atual; verificar `RentalAgreement.version` do destino contra a versão capturada na confirmação (se vinculado); revalidar autorização de quem aplica (pode ser diferente de quem confirmou — nunca presumido); aplicar a mutação usando **exclusivamente `confirmedSnapshot`**, nunca uma releitura do `content` mutável; gravar `status: "applied"`, `appliedAt` (servidor) e um resultado idempotente, na mesma transação.

**Reenvio após commit com falha de resposta HTTP**: o reenvio lê `status === "applied"` e devolve o resultado já gravado, sem repetir a mutação.

**Itens já aplicados não são editáveis como staging** — uma correção sobre um registro aplicado é uma operação própria, versionada (seção 8), auditável, não uma reedição do item de importação original.

## 8. Concorrência e versionamento

Substitui qualquer noção de "última escrita prevalece". `RentalAgreement.version` (e campos equivalentes em `RentAmountPeriod`/`ChargeCondition`) incrementa em toda escrita. Toda correção lê a versão atual e escreve com `WHERE id = ? AND version = ?` na mesma instrução que muta os dados — zero linhas afetadas é conflito explícito, nunca fusão automática, exige releitura do estado atual antes de nova tentativa.

`sourceBatchId` de um registro **reutilizado** por um lote posterior nunca é sobrescrito — o registro mantém seu `sourceBatchId` de criação; reutilizações geram `RentalHistoryEvent` separados.

## 9. Autorização — proposta, não aprovada

| Operação | Escopo proposto | Observação |
|---|---|---|
| Preparar/revisar lote | `imob.rental_import.prepare` | — |
| Confirmar item | `imob.rental_import.confirm` | Exige `userId` real |
| Aplicar | `imob.rental_import.apply` | Revalidado no momento da aplicação, independente de quem confirmou |
| Consultar | `imob.rental.read` | — |
| Corrigir | `imob.rental.correct` | Sujeito ao controle de versão (seção 8) |
| Exportar | `imob.rental.export` | Escopo próprio — não herdado de outras superfícies |
| Vincular documento | `imob.rental.document.link` | Cria `RentalDocumentLink` — não inclui download |
| Baixar documento | Permissão individual específica de leitura de documento (a definir) | Sujeito ao requisito de acesso a documentos abaixo |

**Requisito — acesso a documentos:** O acesso a documentos deve observar permissões individuais, escopo do workspace e políticas de autorização aplicáveis. A habilitação operacional depende da validação desses controles.

Nomes de escopo, isoladamente, não implementam autorização. A origem da concessão (armazenamento de papéis existente ou novo) é decisão pendente. **Requisito:** nenhum papel ou escopo do importador pode ser concedido por provisionamento ou promoção implícitos; a concessão deve ser explícita e auditável. Os escopos acima são propostos como novos e específicos e não reutilizam permissões de outras superfícies como definição suficiente.

Acordo verbal **não exige documento vinculado** — `agreementType: "verbal"` é válido com `documentLinks: []`.

**Tokens de serviço**: proposta explícita — não recebem `imob.rental_import.confirm`/`.apply` por padrão (exigem decisão humana identificável); `.prepare`/`.review`/`.read`/`.export` poderiam ser concedidos por decisão explícita, não assumida aqui.

**Requisito:** toda consulta e mutação inclui `tenantId`/`workspaceId` no `WHERE`, dentro da própria transação.

## 10. Exemplos fictícios e genéricos

Os exemplos abaixo ilustram a estrutura dos dados da seção 5 e as regras funcionais (desconhecido nunca vira zero; acordo verbal não exige documento; período em aberto). Identificadores, nomes e valores são **inventados** e não reproduzem nenhum caso real.

**Exemplo 1 — contrato escrito, com documento vinculado, duas partes, período com fim conhecido e caução prevista**

```json
{
  "unit": { "id": "unit-ex-a", "unitLabel": "Unidade de Exemplo A", "unitType": "commercial" },
  "parties": [
    { "id": "party-ex-a1", "name": "Pessoa Exemplo A1", "document": null },
    { "id": "party-ex-a2", "name": "Pessoa Exemplo A2", "document": null }
  ],
  "agreement": {
    "id": "agr-ex-a", "stableAgreementKey": "sak-ex-a", "version": 1,
    "agreementType": "written", "hasLinkedDocument": true,
    "currentOccupancy": { "value": "occupied", "informedBy": "manager", "asOf": "2026-01-01" }
  },
  "agreementParties": [
    { "agreementId": "agr-ex-a", "partyId": "party-ex-a1", "role": "tenant" },
    { "agreementId": "agr-ex-a", "partyId": "party-ex-a2", "role": "co_tenant" }
  ],
  "rentPeriods": [
    { "id": "rap-ex-a1", "agreementId": "agr-ex-a", "amountCents": 120000, "periodStart": "2026-01-01", "periodEndType": "known", "periodEnd": "2027-01-01", "origin": "document_extraction" }
  ],
  "depositTerms": { "agreementId": "agr-ex-a", "expectedAmountCents": 240000, "expectedInstallments": 2, "origin": "informed_by_manager" },
  "documentLinks": [
    { "agreementId": "agr-ex-a", "documentRef": "doc-ex-a1", "role": "contrato", "verificationStatus": "not_verified" }
  ]
}
```

**Exemplo 2 — encargos: um com todos os dados conhecidos e outro totalmente desconhecido (desconhecido é `null`, nunca `0`)**

```json
{
  "unit": { "id": "unit-ex-b", "unitLabel": "Unidade de Exemplo B", "unitType": "residential" },
  "parties": [
    { "id": "party-ex-b1", "name": "Pessoa Exemplo B1", "document": null }
  ],
  "agreement": {
    "id": "agr-ex-b", "stableAgreementKey": "sak-ex-b", "version": 3,
    "agreementType": "written", "hasLinkedDocument": false,
    "currentOccupancy": { "value": "occupied", "informedBy": "manager", "asOf": null }
  },
  "charges": [
    { "agreementId": "agr-ex-b", "chargeType": "condo_fee", "tenantWaived": "no", "chargeExists": "yes", "effectiveResponsibleParty": "party-ex-b1", "amountCents": 35000, "effectivePeriod": { "start": "2026-02-01", "end": "2027-02-01" } },
    { "agreementId": "agr-ex-b", "chargeType": "iptu", "tenantWaived": "unknown", "chargeExists": "unknown", "effectiveResponsibleParty": "unknown", "amountCents": null, "effectivePeriod": "unknown" }
  ],
  "documentLinks": []
}
```

**Exemplo 3 — acordo verbal, sem documento vinculado, ocupação desconhecida e período em aberto**

```json
{
  "unit": { "id": "unit-ex-c", "unitLabel": "Unidade de Exemplo C", "unitType": "residential" },
  "agreement": {
    "id": "agr-ex-c", "stableAgreementKey": "sak-ex-c", "version": 1,
    "agreementType": "verbal", "hasLinkedDocument": false,
    "currentOccupancy": { "value": "unknown", "informedBy": "manager", "asOf": null }
  },
  "rentPeriods": [
    { "id": "rap-ex-c1", "agreementId": "agr-ex-c", "amountCents": 80000, "periodEndType": "explicitly_open", "origin": "informed_by_manager" }
  ],
  "documentLinks": []
}
```

*(Exemplos puramente ilustrativos da estrutura de dados.)*

## 11. Intake documental — dependências e limites (fora desta entrega)

O importador independente **não** usa o draft, o `Run`, a fila, o worker nem a rota de exportação do intake documental. Melhorias do intake são entrega separada, sem prazo imposto por este documento, e incluem:

- Transporte dos valores extraídos (`extractedLease`/`classification`) do draft até um destino persistente.
- Vínculo persistente entre `ImobCase`/`ImobCaseEvent` e `UploadedDocument`.

O importador define seu próprio controle de versão (seção 8) e sua própria área de staging (seção 7). A única dependência compartilhada é o acesso a `UploadedDocument` quando documentos são vinculados; o requisito de acesso a documentos está na seção 9, e a habilitação operacional depende da validação desses controles.

## 12. Primeira unidade de implementação futura — proposta, não implementada

**Problema resolvido**: existência de um schema mínimo e isolado para unidade/pessoa/locação/período/encargo/vínculo de documento, com identidade e versionamento desde a criação — sem ainda ligar isso a nenhuma rota de importação.

**Comportamento resultante**: nenhum, do ponto de vista de produto — só schema; nenhum endpoint novo nesta unidade.

**Arquivos previstos** (não criados): novas migrations em `packages/db/prisma/migrations/`; adição dos modelos da seção 5 a `packages/db/prisma/schema.prisma`.

**Schema/migrations necessários**: `RentalUnit`, `Party`, `RentalAgreement` (com `version`), `RentalAgreementParty`, `RentAmountPeriod`, `ChargeCondition`, `DepositTerms`, `RentalDocumentLink`, `RentalHistoryEvent` — todos com `tenantId`/`workspaceId` e `@@unique([tenantId, workspaceId, stableAgreementKey])` em `RentalAgreement`.

**Autorização**: nenhuma nesta unidade — schema isolado não expõe rota.

**Testes significativos** (não criados): constraint de unicidade de `stableAgreementKey` rejeita duplicata no mesmo tenant/workspace; a mesma chave em tenants diferentes não colide; `version` incrementa e um `UPDATE` com versão desatualizada afeta zero linhas.

**Critérios de aceite**: migrations aplicam limpo sobre a base atual; nenhuma tabela `Imob*` existente é alterada; nenhuma rota nova é exposta.

**Riscos e limitações**: schema sozinho não é um importador funcional nem um piloto apto a dados reais — não resolve autorização (seção 9, ainda proposta), fluxo de revisão (seção 7, ainda não implementado) nem a trava de concorrência da seção 6.

**Explicitamente fora do escopo desta unidade**: qualquer rota HTTP, qualquer lógica de resolução de identidade, qualquer importação de dado real. **A criação destas tabelas não autoriza, por si só, nenhuma importação.**

## 13. Políticas pendentes de decisão, com recomendação

| Decisão | Recomendação |
|---|---|
| Separar locação do funil de `ImobLead` | Recomendo separar (entidades novas da seção 5) — permanece recomendação arquitetural a ratificar, não uma aprovação de schema |
| Permitir duas locações simultâneas na mesma unidade | Não proíbo por padrão; recomendo permitir, dado que o cenário pode ocorrer na prática — decisão de negócio a ratificar |
| Escopos de `imob.rental.*` (seção 9) | Recomendo como ponto de partida, não aprovados |
| Tokens de serviço em `.prepare`/`.review`/`.export` | Recomendo permitir com decisão explícita; nunca `.confirm`/`.apply` sem `userId` real |
| Origem e provisionamento dos papéis do importador | Decisão pendente. **Requisito:** nenhum papel do importador pode ser concedido por provisionamento ou promoção implícitos (seção 9) |

## 14. Limitações e lacunas de conhecimento

Este documento é uma especificação: não implementa nem valida comportamento em execução. Não foram mapeados os consumidores de tokens de serviço no IMOB (seção 9). Branches históricas específicas de IMOB não foram comparadas em detalhe. **Nenhuma garantia de segurança é afirmada:** os requisitos de autorização, concorrência e isolamento são prospectivos e dependem de implementação, testes e revisão futuros.
