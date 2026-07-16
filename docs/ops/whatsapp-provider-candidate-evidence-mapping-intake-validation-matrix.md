# WhatsApp Provider Selection — Provider Candidate Evidence Mapping / Intake Validation Matrix

## Objetivo

Este documento cria o Provider Candidate Evidence Mapping e a Intake Validation Matrix da F4.2 para uma avaliacao futura hipotetica de candidatos a provider WhatsApp em modo selection-only.

F4.2 e um artefato documental. Ele nao autoriza selecao final de provider, implementacao, execucao, producao, provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacoes ou side effects. Provider integration permanece `blocked`, provider final selection permanece `not authorized`, o F4.0 Selection-Only Charter permanece ativo e o F4.1 Candidate Intake permanece a fonte de intake.

## Provider Candidate Evidence Mapping

O evidence mapping conecta cada campo obrigatorio do intake F4.1 a uma evidencia minima, metodo de validacao, owner, reviewer, criterio de aceite, status e reasonCode. O status maximo permitido e `accepted-for-selection-review-only`.

| mappingId | candidateField | category | requiredEvidence | validationMethod | owner | reviewer | acceptanceCriteria | status | blockingGap | reasonCode |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `F4.2-MAP-001` | `candidateId` | `intake identity` | Intake record fisico com identificador unico. | `document review` | Product/Platform | DocOps | Identificador presente, unico e rastreavel. | `not-mapped` | Campo ausente ou duplicado. | `CANDIDATE_EVIDENCE_MAPPING_INCOMPLETE` |
| `F4.2-MAP-002` | `providerName` | `intake identity` | Fonte oficial ou declaracao documental do candidato. | `document review` | Product/Platform | DocOps | Nome consistente entre intake e evidencia. | `not-mapped` | Nome ausente ou sem evidencia. | `INTAKE_VALIDATION_EVIDENCE_MISSING` |
| `F4.2-MAP-003` | `providerType` | `commercial/cost` | Classificacao `official`, `aggregator`, `partner` ou `other` com justificativa. | `document review` | Product/Platform | Platform governance | Tipo documentado e coerente com o escopo selection-only. | `not-mapped` | Tipo ausente ou nao justificavel. | `INTAKE_VALIDATION_CRITERIA_INCOMPLETE` |
| `F4.2-MAP-004` | `officialWebsite` | `operational support` | URL oficial indexavel ou evidencia de canal publico. | `document review` | Product/Platform | DocOps | Fonte acessivel e associada ao candidato. | `not-mapped` | Website ausente ou nao verificavel. | `INTAKE_VALIDATION_EVIDENCE_MISSING` |
| `F4.2-MAP-005` | `jurisdiction` | `privacy/compliance` | Evidencia de jurisdicao, entidade legal ou area de operacao. | `privacy/compliance review` | Privacy/Compliance | Platform governance | Jurisdicao documentada para avaliacao posterior. | `not-mapped` | Jurisdicao ausente. | `INTAKE_VALIDATION_EVIDENCE_MISSING` |
| `F4.2-MAP-006` | `commercialContact` | `commercial/cost` | Contato comercial ou canal formal equivalente. | `document review` | Product/Platform | DocOps | Owner comercial identificavel sem expor segredo ou PII sensivel. | `not-mapped` | Contato ausente. | `INTAKE_VALIDATION_OWNER_MISSING` |
| `F4.2-MAP-007` | `technicalContact` | `operational support` | Contato tecnico ou canal de suporte tecnico. | `document review` | Backend/API | Product/Platform | Canal tecnico documentado para revisao futura. | `not-mapped` | Contato tecnico ausente. | `INTAKE_VALIDATION_OWNER_MISSING` |
| `F4.2-MAP-008` | `securityContact` | `security` | Contato de seguranca, disclosure policy ou canal security. | `security review` | Security | Platform governance | Canal security documentado e revisavel. | `not-mapped` | Security contact ausente. | `INTAKE_VALIDATION_OWNER_MISSING` |
| `F4.2-MAP-009` | `supportedAPIs` | `contract compatibility` | Documentacao de APIs, versoes e limites. | `contract review` | Backend/API | Platform governance | APIs listadas sem exigir integracao real. | `not-mapped` | APIs ausentes ou incompatibilidade nao analisada. | `INTAKE_VALIDATION_EVIDENCE_MISSING` |
| `F4.2-MAP-010` | `webhookCapabilities` | `webhook/event model` | Documentacao de eventos, payloads, headers e delivery semantics. | `contract review` | Backend/API | Security | Capacidades documentadas sem habilitar webhook produtivo. | `not-mapped` | Webhook/event model ausente. | `INTAKE_VALIDATION_EVIDENCE_MISSING` |
| `F4.2-MAP-011` | `signatureVerification` | `security` | Modelo de assinatura, headers, algoritmo e fail-closed esperado. | `security review` | Security | Backend/API | Verificacao documentada para avaliacao futura; ausencia bloqueia. | `not-mapped` | Assinatura ausente ou invalida. | `INTAKE_VALIDATION_BLOCKED` |
| `F4.2-MAP-012` | `replayProtection` | `replay/idempotency` | Timestamp, janela de validade, nonce ou replay guard documentado. | `security review` | Security | Backend/API | Replay control documentado e compativel com fail-closed. | `not-mapped` | Replay protection ausente. | `INTAKE_VALIDATION_BLOCKED` |
| `F4.2-MAP-013` | `idempotencySupport` | `replay/idempotency` | EventId, idempotency key ou duplicate handling documentado. | `contract review` | Backend/API | Platform governance | Duplicidade tratavel sem side effects. | `not-mapped` | Idempotencia ausente. | `INTAKE_VALIDATION_BLOCKED` |
| `F4.2-MAP-014` | `secretManagementModel` | `secret management` | Modelo de storage, rotation, revocation e redaction. | `security review` | Security | Platform governance | Secret boundary documentado; nenhum secret produtivo usado. | `not-mapped` | Secret boundary ausente. | `INTAKE_VALIDATION_BLOCKED` |
| `F4.2-MAP-015` | `dataResidency` | `privacy/compliance` | Data residency, subprocessors ou regiao de tratamento. | `privacy/compliance review` | Privacy/Compliance | Security | Localizacao e fluxo de dados documentados. | `not-mapped` | Data residency ausente. | `INTAKE_VALIDATION_EVIDENCE_MISSING` |
| `F4.2-MAP-016` | `PIIHandling` | `PII/sensitive data handling` | Politica de PII, retention, masking, redaction e export. | `privacy/compliance review` | Privacy/Compliance | DocOps | PII/sensitive safety documentada; vazamento bloqueia. | `not-mapped` | PII handling ausente ou inseguro. | `INTAKE_VALIDATION_BLOCKED` |
| `F4.2-MAP-017` | `complianceClaims` | `privacy/compliance` | Claims de compliance com referencias fisicas ou indexaveis. | `privacy/compliance review` | Privacy/Compliance | Platform governance | Claims rastreaveis e nao usados como aprovacao automatica. | `not-mapped` | Claims sem evidencia. | `INTAKE_VALIDATION_EVIDENCE_MISSING` |
| `F4.2-MAP-018` | `SLOClaims` | `observability/SLO` | SLO, rate limit, delivery status e metricas disponiveis. | `observability review` | Platform governance | Backend/API | Claims documentados para baseline futuro. | `not-mapped` | Observability/SLO ausente. | `INTAKE_VALIDATION_EVIDENCE_MISSING` |
| `F4.2-MAP-019` | `rollbackDisableSupport` | `rollback/disable` | Disable path, credential revocation, webhook pause e rollback docs. | `rollback review` | Platform governance | Security | Disable/rollback documentado antes de qualquer continuidade. | `not-mapped` | Rollback/disable ausente. | `INTAKE_VALIDATION_BLOCKED` |
| `F4.2-MAP-020` | `observabilitySupport` | `observability/SLO` | Logs, metrics, alertability e status de entrega disponiveis. | `observability review` | Platform governance | DocOps | Sinais documentados sem criar dashboard obrigatorio. | `not-mapped` | Observability ausente. | `INTAKE_VALIDATION_EVIDENCE_MISSING` |
| `F4.2-MAP-021` | `tenantWorkspaceScopeSupport` | `tenant/workspace/scope safety` | Modelo de conta, tenant, workspace, entitlement e escopo. | `tenant/workspace/scope review` | Backend/API | Platform governance | Boundary multi-tenant/workspace documentado. | `not-mapped` | Escopo ausente ou confuso. | `INTAKE_VALIDATION_BLOCKED` |
| `F4.2-MAP-022` | `knownLimitations` | `operational support` | Limitacoes, riscos conhecidos, quotas e restricoes. | `document review` | Product/Platform | Platform governance | Limites declarados e rastreaveis. | `not-mapped` | Limitacoes omitidas. | `INTAKE_VALIDATION_CRITERIA_INCOMPLETE` |
| `F4.2-MAP-023` | `requiredEvidenceRefs` | `evidence governance` | Referencias fisicas/indexaveis em docs ou evidencias. | `evidence index validation` | DocOps | Platform governance | Evidence refs existem fisicamente e sao indexaveis. | `not-mapped` | Evidencia inexistente ou nao indexada. | `INTAKE_VALIDATION_EVIDENCE_MISSING` |
| `F4.2-MAP-024` | `intakeOwner` | `ownership` | Owner nomeado para intake e follow-up documental. | `document review` | Product/Platform | DocOps | Owner presente e responsavel por gaps. | `not-mapped` | Owner ausente. | `INTAKE_VALIDATION_OWNER_MISSING` |
| `F4.2-MAP-025` | `reviewStatus` | `decision governance` | Status de intake coerente com evidencias, gaps e decisionRefs. | `document review` | Platform governance | DocOps | Status permitido e nao interpretado como selecao final. | `not-mapped` | Status invalido ou promocao indevida. | `INTAKE_VALIDATION_NOT_PROVIDER_SELECTION` |

## Intake Validation Matrix

A Intake Validation Matrix transforma as categorias do F4.1 em criterios de validacao selection-only. Nenhuma linha autoriza selecao final, implementacao, execucao ou producao.

| Category | Candidate fields | Validation criteria | Required methods | Default blocking gap | Allowed terminal status |
| --- | --- | --- | --- | --- | --- |
| `security` | `securityContact`, `signatureVerification`, `secretManagementModel` | Security contact, assinatura, secret boundary e fail-closed documentados. | `security review`, `document review` | Security evidence ausente ou boundary violado. | `accepted-for-selection-review-only` |
| `privacy/compliance` | `jurisdiction`, `dataResidency`, `PIIHandling`, `complianceClaims` | Fluxo de dados, jurisdicao, PII handling e claims rastreaveis. | `privacy/compliance review` | PII/sensitive safety nao provada. | `accepted-for-selection-review-only` |
| `contract compatibility` | `supportedAPIs`, `requiredEvidenceRefs` | APIs, versoes, payloads e compatibilidade documental mapeadas. | `contract review`, `evidence index validation` | Evidencia de contrato ausente. | `accepted-for-selection-review-only` |
| `webhook/event model` | `webhookCapabilities`, `signatureVerification` | Eventos, headers, payloads, delivery semantics e verificacao documentados. | `contract review`, `security review` | Webhook produtivo sugerido ou evidencia ausente. | `accepted-for-selection-review-only` |
| `replay/idempotency` | `replayProtection`, `idempotencySupport` | Janela de replay, eventId, duplicate handling e sideEffects=0 documentados. | `security review`, `contract review` | Replay/idempotency ausente. | `accepted-for-selection-review-only` |
| `secret management` | `secretManagementModel` | Storage, rotation, revocation, redaction e ambiente documentados. | `security review` | Secret produtivo solicitado, usado ou nao delimitado. | `accepted-for-selection-review-only` |
| `observability/SLO` | `SLOClaims`, `observabilitySupport` | Metricas, logs, status de entrega, alertabilidade e SLO claims mapeados. | `observability review` | Baseline observability ausente. | `accepted-for-selection-review-only` |
| `rollback/disable` | `rollbackDisableSupport` | Disable path, webhook pause, revoke credentials e rollback owner documentados. | `rollback review` | Rollback/disable ausente. | `accepted-for-selection-review-only` |
| `tenant/workspace/scope safety` | `tenantWorkspaceScopeSupport` | Account model, tenant/workspace mapping, entitlement e isolamento documentados. | `tenant/workspace/scope review` | Confusao de tenant/workspace/scope. | `accepted-for-selection-review-only` |
| `PII/sensitive data handling` | `PIIHandling`, `dataResidency` | Retention, masking, redaction, export e ausencia de PII em evidencias. | `privacy/compliance review` | PII/sensitive leakage risk. | `accepted-for-selection-review-only` |
| `operational support` | `technicalContact`, `securityContact`, `knownLimitations` | Suporte, escalation, incident path e limitacoes documentadas. | `document review` | Owner/reviewer ausente. | `accepted-for-selection-review-only` |
| `commercial/cost` | `commercialContact`, `providerType`, `knownLimitations` | Pricing, quotas, rate limits e constraints comerciais documentados. | `document review`, `contract review` | Custo/limites sem evidencia. | `accepted-for-selection-review-only` |

## Campos obrigatorios da matriz

Toda linha de validacao deve conter:

- `mappingId`
- `candidateField`
- `category`
- `requiredEvidence`
- `validationMethod`
- `owner`
- `reviewer`
- `acceptanceCriteria`
- `status`
- `blockingGap`
- `evidenceRefs`
- `decisionRefs`
- `reasonCode`

Linha sem qualquer campo obrigatorio deve permanecer `blocked` ou `missing-evidence`.

## Validation methods

- `document review`
- `security review`
- `privacy/compliance review`
- `contract review`
- `rollback review`
- `observability review`
- `tenant/workspace/scope review`
- `evidence index validation`
- `docs link integrity validation`
- `isolation diff validation`

## Status de validacao

- `not-mapped`: campo ou categoria ainda nao conectado a evidencia minima.
- `missing-evidence`: evidencia requerida ausente, inexistente ou nao indexavel.
- `in-review`: evidencia presente e em revisao documental.
- `blocked`: gap bloqueante, owner ausente, criterio incompleto, boundary violado ou check falhando.
- `accepted-for-selection-review-only`: aceito apenas para continuidade de revisao selection-only, sem selecao final.
- `rejected`: rejeitado documentalmente, sem selecao ou execucao.

## Blocking gaps

- Mapping inexistente ou incompleto.
- Evidencia requerida ausente, inexistente, nao fisica ou nao indexavel.
- Owner ou reviewer ausente.
- Acceptance criteria ausentes, ambiguos ou fora de selection-only.
- `evidenceRefs` ou `decisionRefs` ausentes quando requeridos.
- `reasonCode` ausente ou inconsistente.
- Status ausente, invalido ou tratado como selecao final.
- Security, privacy/compliance, contract, rollback, observability, tenant/workspace/scope ou PII safety nao comprovados.
- `pnpm check:evidence-index` falhando.
- `pnpm check:docs-link-integrity` falhando.
- `git diff --check` falhando.
- Isolation diff indicando alteracoes em `.github/workflows`, `release.yml`, apps, packages ou scripts.
- Qualquer provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, `lead.create`, `lead.discard`, acao critica, provider external call, mutation external side effect ou `sideEffects != 0`.

## ReasonCodes

- `CANDIDATE_EVIDENCE_MAPPING_ONLY`
- `INTAKE_VALIDATION_MATRIX_ONLY`
- `CANDIDATE_EVIDENCE_MAPPING_INCOMPLETE`
- `INTAKE_VALIDATION_EVIDENCE_MISSING`
- `INTAKE_VALIDATION_OWNER_MISSING`
- `INTAKE_VALIDATION_CRITERIA_INCOMPLETE`
- `INTAKE_VALIDATION_BLOCKED`
- `INTAKE_VALIDATION_NOT_PROVIDER_SELECTION`
- `PROVIDER_FINAL_SELECTION_NOT_AUTHORIZED`
- `PROVIDER_INTEGRATION_STILL_BLOCKED`

## Provider selection boundary

Provider final selection permanece `not authorized`. F4.2 nao seleciona provider, nao recomenda provider como final, nao aprova procurement, nao cria contrato, nao cria configuracao e nao permite interpretar mapping, matriz, status ou evidencias como selecao implicita.

## Provider integration boundary

Provider integration permanece `blocked`. F4.2 nao cria provider, nao integra provider real, nao solicita ou usa secret produtivo, nao habilita webhook produtivo, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes e nao executa acao critica.

## Selection-only continuity

F4.0 Selection-Only Charter permanece ativo. F4.1 Candidate Intake permanece a fonte para campos e categorias da matriz. F4.2 apenas adiciona evidence mapping e intake validation, preservando F3.6 pre-selection boundary, F3.5 No-Go Decision Record e F2.26 governance closure.

## Nao-autorizacao de selecao final de provider

F4.2 nao autoriza selecao final de provider. O status `accepted-for-selection-review-only` permite somente continuidade de revisao documental selection-only.

## Nao-autorizacao de implementacao

F4.2 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine, launcher, workflow, app, package ou script.

## Nao-autorizacao de execucao

F4.2 nao autoriza execucao, configuracao, teste com provider real, provider external call, mutation external side effect, uso de secret produtivo, webhook produtivo, mutacao, lead action, acao critica ou `sideEffects != 0`.

## Nao-autorizacao produtiva

F4.2 nao e autorizacao de producao. Evidence mapping, intake validation matrix, F4.1 intake, F4.0 charter, F3.6 boundary ou F3.5 No-Go Decision Record nao podem ser tratados como permissao para operar WhatsApp, selecionar provider final, integrar provider, provisionar secret produtivo, habilitar webhook produtivo ou executar mutacoes.

## Status final

Status: proposta/parcial evidenciada documentalmente.
