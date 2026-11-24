# WhatsApp Provider Candidate — Meta Evidence Mapping

## 1. Natureza

- Assessment date: 2026-11-24
- Candidate: Meta WhatsApp Cloud API
- Candidate ID: F4-CAND-2026-001 (provisional)
- Baseline: 2b9225da
- Mode: selection-only
- Status: proposta/parcial
- Intake reviewStatus: incomplete
- Provider final selection: not authorized
- Provider integration: blocked

## 2. Referências

- [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md)
- [F4.1 Candidate Intake](whatsapp-provider-candidate-intake-template-preliminary-eligibility-checklist.md)
- [F4.2 Evidence Mapping Matrix](whatsapp-provider-candidate-evidence-mapping-intake-validation-matrix.md)
- [F5.0 Final Selection Charter](whatsapp-provider-final-selection-formal-phase-opening-final-selection-only-charter.md)

## 3. Metodologia

Os 25 mappings abaixo derivam diretamente da matriz F4.2.

São preservados os identificadores, campos, categorias,
evidências requeridas, métodos de validação, owners,
reviewers e critérios canônicos de aceite.

As observações Meta derivam do intake materializado.

A classificação informacional documented, partial ou
pending não constitui status formal da F4.2.

Todos os mappings permanecem blocked nesta materialização,
pois os revisores humanos e as decisões de validação
específicas não foram formalmente ratificados.

O Founder foi ratificado como Intake Owner e Executive
Sponsor, sem substituir revisões independentes aplicáveis.

O motivo canônico original de cada mapping é preservado
separadamente do motivo bloqueante observado nesta avaliação.

Os links ao intake são referências documentais de trabalho,
não comprovação automática das evidências mínimas exigidas.

## 4. Evidence Mapping — 25 campos

### `F4.2-MAP-001` — `candidateId`

- mappingId: `F4.2-MAP-001`
- candidateField: `candidateId`
- category: `intake identity`
- requiredEvidence: Intake record fisico com identificador unico.
- validationMethod: `document review`
- owner: Product/Platform
- reviewer: DocOps
- acceptanceCriteria: Identificador presente, unico e rastreavel.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Identificador provisório; unicidade formal pendente.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: partial
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Campo ausente ou duplicado.
- canonicalReasonCode: `CANDIDATE_EVIDENCE_MAPPING_INCOMPLETE`

### `F4.2-MAP-002` — `providerName`

- mappingId: `F4.2-MAP-002`
- candidateField: `providerName`
- category: `intake identity`
- requiredEvidence: Fonte oficial ou declaracao documental do candidato.
- validationMethod: `document review`
- owner: Product/Platform
- reviewer: DocOps
- acceptanceCriteria: Nome consistente entre intake e evidencia.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Meta WhatsApp Cloud API identificada.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: documented
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Nome ausente ou sem evidencia.
- canonicalReasonCode: `INTAKE_VALIDATION_EVIDENCE_MISSING`

### `F4.2-MAP-003` — `providerType`

- mappingId: `F4.2-MAP-003`
- candidateField: `providerType`
- category: `commercial/cost`
- requiredEvidence: Classificacao `official`, `aggregator`, `partner` ou `other` com justificativa.
- validationMethod: `document review`
- owner: Product/Platform
- reviewer: Platform governance
- acceptanceCriteria: Tipo documentado e coerente com o escopo selection-only.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Classificação official preliminar.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: documented
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Tipo ausente ou nao justificavel.
- canonicalReasonCode: `INTAKE_VALIDATION_CRITERIA_INCOMPLETE`

### `F4.2-MAP-004` — `officialWebsite`

- mappingId: `F4.2-MAP-004`
- candidateField: `officialWebsite`
- category: `operational support`
- requiredEvidence: URL oficial indexavel ou evidencia de canal publico.
- validationMethod: `document review`
- owner: Product/Platform
- reviewer: DocOps
- acceptanceCriteria: Fonte acessivel e associada ao candidato.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Portal oficial reportado.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: documented
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Website ausente ou nao verificavel.
- canonicalReasonCode: `INTAKE_VALIDATION_EVIDENCE_MISSING`

### `F4.2-MAP-005` — `jurisdiction`

- mappingId: `F4.2-MAP-005`
- candidateField: `jurisdiction`
- category: `privacy/compliance`
- requiredEvidence: Evidencia de jurisdicao, entidade legal ou area de operacao.
- validationMethod: `privacy/compliance review`
- owner: Privacy/Compliance
- reviewer: Platform governance
- acceptanceCriteria: Jurisdicao documentada para avaliacao posterior.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Entidade contratante e jurisdição a ratificar.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: partial
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Jurisdicao ausente.
- canonicalReasonCode: `INTAKE_VALIDATION_EVIDENCE_MISSING`

### `F4.2-MAP-006` — `commercialContact`

- mappingId: `F4.2-MAP-006`
- candidateField: `commercialContact`
- category: `commercial/cost`
- requiredEvidence: Contato comercial ou canal formal equivalente.
- validationMethod: `document review`
- owner: Product/Platform
- reviewer: DocOps
- acceptanceCriteria: Owner comercial identificavel sem expor segredo ou PII sensivel.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Canal público reportado; condições comerciais pendentes.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: partial
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Contato ausente.
- canonicalReasonCode: `INTAKE_VALIDATION_OWNER_MISSING`

### `F4.2-MAP-007` — `technicalContact`

- mappingId: `F4.2-MAP-007`
- candidateField: `technicalContact`
- category: `operational support`
- requiredEvidence: Contato tecnico ou canal de suporte tecnico.
- validationMethod: `document review`
- owner: Backend/API
- reviewer: Product/Platform
- acceptanceCriteria: Canal tecnico documentado para revisao futura.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Developer Support reportado; escalation pendente.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: partial
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Contato tecnico ausente.
- canonicalReasonCode: `INTAKE_VALIDATION_OWNER_MISSING`

### `F4.2-MAP-008` — `securityContact`

- mappingId: `F4.2-MAP-008`
- candidateField: `securityContact`
- category: `security`
- requiredEvidence: Contato de seguranca, disclosure policy ou canal security.
- validationMethod: `security review`
- owner: Security
- reviewer: Platform governance
- acceptanceCriteria: Canal security documentado e revisavel.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Canal específico de segurança a validar.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: pending
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Security contact ausente.
- canonicalReasonCode: `INTAKE_VALIDATION_OWNER_MISSING`

### `F4.2-MAP-009` — `supportedAPIs`

- mappingId: `F4.2-MAP-009`
- candidateField: `supportedAPIs`
- category: `contract compatibility`
- requiredEvidence: Documentacao de APIs, versoes e limites.
- validationMethod: `contract review`
- owner: Backend/API
- reviewer: Platform governance
- acceptanceCriteria: APIs listadas sem exigir integracao real.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Cloud API e Graph API; versões e limites pendentes.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: partial
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: APIs ausentes ou incompatibilidade nao analisada.
- canonicalReasonCode: `INTAKE_VALIDATION_EVIDENCE_MISSING`

### `F4.2-MAP-010` — `webhookCapabilities`

- mappingId: `F4.2-MAP-010`
- candidateField: `webhookCapabilities`
- category: `webhook/event model`
- requiredEvidence: Documentacao de eventos, payloads, headers e delivery semantics.
- validationMethod: `contract review`
- owner: Backend/API
- reviewer: Security
- acceptanceCriteria: Capacidades documentadas sem habilitar webhook produtivo.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Handshake, eventos assinados e retries reportados.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: documented
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Webhook/event model ausente.
- canonicalReasonCode: `INTAKE_VALIDATION_EVIDENCE_MISSING`

### `F4.2-MAP-011` — `signatureVerification`

- mappingId: `F4.2-MAP-011`
- candidateField: `signatureVerification`
- category: `security`
- requiredEvidence: Modelo de assinatura, headers, algoritmo e fail-closed esperado.
- validationMethod: `security review`
- owner: Security
- reviewer: Backend/API
- acceptanceCriteria: Verificacao documentada para avaliacao futura; ausencia bloqueia.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. HMAC-SHA256 reportado; implementação não autorizada.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: documented
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Assinatura ausente ou invalida.
- canonicalReasonCode: `INTAKE_VALIDATION_BLOCKED`

### `F4.2-MAP-012` — `replayProtection`

- mappingId: `F4.2-MAP-012`
- candidateField: `replayProtection`
- category: `replay/idempotency`
- requiredEvidence: Timestamp, janela de validade, nonce ou replay guard documentado.
- validationMethod: `security review`
- owner: Security
- reviewer: Backend/API
- acceptanceCriteria: Replay control documentado e compativel com fail-closed.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Replay guard interno; adequação durável pendente.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: partial
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Replay protection ausente.
- canonicalReasonCode: `INTAKE_VALIDATION_BLOCKED`

### `F4.2-MAP-013` — `idempotencySupport`

- mappingId: `F4.2-MAP-013`
- candidateField: `idempotencySupport`
- category: `replay/idempotency`
- requiredEvidence: EventId, idempotency key ou duplicate handling documentado.
- validationMethod: `contract review`
- owner: Backend/API
- reviewer: Platform governance
- acceptanceCriteria: Duplicidade tratavel sem side effects.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Identificadores reportados; idempotência durável pendente.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: partial
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Idempotencia ausente.
- canonicalReasonCode: `INTAKE_VALIDATION_BLOCKED`

### `F4.2-MAP-014` — `secretManagementModel`

- mappingId: `F4.2-MAP-014`
- candidateField: `secretManagementModel`
- category: `secret management`
- requiredEvidence: Modelo de storage, rotation, revocation e redaction.
- validationMethod: `security review`
- owner: Security
- reviewer: Platform governance
- acceptanceCriteria: Secret boundary documentado; nenhum secret produtivo usado.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Secret boundary, rotação e revogação pendentes.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: partial
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Secret boundary ausente.
- canonicalReasonCode: `INTAKE_VALIDATION_BLOCKED`

### `F4.2-MAP-015` — `dataResidency`

- mappingId: `F4.2-MAP-015`
- candidateField: `dataResidency`
- category: `privacy/compliance`
- requiredEvidence: Data residency, subprocessors ou regiao de tratamento.
- validationMethod: `privacy/compliance review`
- owner: Privacy/Compliance
- reviewer: Security
- acceptanceCriteria: Localizacao e fluxo de dados documentados.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Render Virginia reportado; residência efetiva pendente.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: partial
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Data residency ausente.
- canonicalReasonCode: `INTAKE_VALIDATION_EVIDENCE_MISSING`

### `F4.2-MAP-016` — `PIIHandling`

- mappingId: `F4.2-MAP-016`
- candidateField: `PIIHandling`
- category: `PII/sensitive data handling`
- requiredEvidence: Politica de PII, retention, masking, redaction e export.
- validationMethod: `privacy/compliance review`
- owner: Privacy/Compliance
- reviewer: DocOps
- acceptanceCriteria: PII/sensitive safety documentada; vazamento bloqueia.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Políticas Meta reportadas; política EIAH pendente.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: partial
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: PII handling ausente ou inseguro.
- canonicalReasonCode: `INTAKE_VALIDATION_BLOCKED`

### `F4.2-MAP-017` — `complianceClaims`

- mappingId: `F4.2-MAP-017`
- candidateField: `complianceClaims`
- category: `privacy/compliance`
- requiredEvidence: Claims de compliance com referencias fisicas ou indexaveis.
- validationMethod: `privacy/compliance review`
- owner: Privacy/Compliance
- reviewer: Platform governance
- acceptanceCriteria: Claims rastreaveis e nao usados como aprovacao automatica.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Claims SOC 2 e ISO 27001 sem ratificação.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: partial
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Claims sem evidencia.
- canonicalReasonCode: `INTAKE_VALIDATION_EVIDENCE_MISSING`

### `F4.2-MAP-018` — `SLOClaims`

- mappingId: `F4.2-MAP-018`
- candidateField: `SLOClaims`
- category: `observability/SLO`
- requiredEvidence: SLO, rate limit, delivery status e metricas disponiveis.
- validationMethod: `observability review`
- owner: Platform governance
- reviewer: Backend/API
- acceptanceCriteria: Claims documentados para baseline futuro.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. SLA, quotas, rate limits e baseline pendentes.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: partial
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Observability/SLO ausente.
- canonicalReasonCode: `INTAKE_VALIDATION_EVIDENCE_MISSING`

### `F4.2-MAP-019` — `rollbackDisableSupport`

- mappingId: `F4.2-MAP-019`
- candidateField: `rollbackDisableSupport`
- category: `rollback/disable`
- requiredEvidence: Disable path, credential revocation, webhook pause e rollback docs.
- validationMethod: `rollback review`
- owner: Platform governance
- reviewer: Security
- acceptanceCriteria: Disable/rollback documentado antes de qualquer continuidade.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Mecanismos propostos; procedimento não validado.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: partial
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Rollback/disable ausente.
- canonicalReasonCode: `INTAKE_VALIDATION_BLOCKED`

### `F4.2-MAP-020` — `observabilitySupport`

- mappingId: `F4.2-MAP-020`
- candidateField: `observabilitySupport`
- category: `observability/SLO`
- requiredEvidence: Logs, metrics, alertability e status de entrega disponiveis.
- validationMethod: `observability review`
- owner: Platform governance
- reviewer: DocOps
- acceptanceCriteria: Sinais documentados sem criar dashboard obrigatorio.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Status público reportado; baseline EIAH pendente.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: partial
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Observability ausente.
- canonicalReasonCode: `INTAKE_VALIDATION_EVIDENCE_MISSING`

### `F4.2-MAP-021` — `tenantWorkspaceScopeSupport`

- mappingId: `F4.2-MAP-021`
- candidateField: `tenantWorkspaceScopeSupport`
- category: `tenant/workspace/scope safety`
- requiredEvidence: Modelo de conta, tenant, workspace, entitlement e escopo.
- validationMethod: `tenant/workspace/scope review`
- owner: Backend/API
- reviewer: Platform governance
- acceptanceCriteria: Boundary multi-tenant/workspace documentado.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Binding interno existente; mapeamento Meta proposto.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: partial
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Escopo ausente ou confuso.
- canonicalReasonCode: `INTAKE_VALIDATION_BLOCKED`

### `F4.2-MAP-022` — `knownLimitations`

- mappingId: `F4.2-MAP-022`
- candidateField: `knownLimitations`
- category: `operational support`
- requiredEvidence: Limitacoes, riscos conhecidos, quotas e restricoes.
- validationMethod: `document review`
- owner: Product/Platform
- reviewer: Platform governance
- acceptanceCriteria: Limites declarados e rastreaveis.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Limitações técnicas e comerciais identificadas.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: documented
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Limitacoes omitidas.
- canonicalReasonCode: `INTAKE_VALIDATION_CRITERIA_INCOMPLETE`

### `F4.2-MAP-023` — `requiredEvidenceRefs`

- mappingId: `F4.2-MAP-023`
- candidateField: `requiredEvidenceRefs`
- category: `evidence governance`
- requiredEvidence: Referencias fisicas/indexaveis em docs ou evidencias.
- validationMethod: `evidence index validation`
- owner: DocOps
- reviewer: Platform governance
- acceptanceCriteria: Evidence refs existem fisicamente e sao indexaveis.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Referências documentais sem indexação formal.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: partial
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Evidencia inexistente ou nao indexada.
- canonicalReasonCode: `INTAKE_VALIDATION_EVIDENCE_MISSING`

### `F4.2-MAP-024` — `intakeOwner`

- mappingId: `F4.2-MAP-024`
- candidateField: `intakeOwner`
- category: `ownership`
- requiredEvidence: Owner nomeado para intake e follow-up documental.
- validationMethod: `document review`
- owner: Product/Platform
- reviewer: DocOps
- acceptanceCriteria: Owner presente e responsavel por gaps.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Founder ratificado como Intake Owner.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: documented
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Owner ausente.
- canonicalReasonCode: `INTAKE_VALIDATION_OWNER_MISSING`

### `F4.2-MAP-025` — `reviewStatus`

- mappingId: `F4.2-MAP-025`
- candidateField: `reviewStatus`
- category: `decision governance`
- requiredEvidence: Status de intake coerente com evidencias, gaps e decisionRefs.
- validationMethod: `document review`
- owner: Platform governance
- reviewer: DocOps
- acceptanceCriteria: Status permitido e nao interpretado como selecao final.
- status: `blocked`
- blockingGap: Reviewer humano e decisão específica não ratificados. Review status permanece incomplete.
- evidenceRefs: Referência preliminar ao [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md); evidência mínima ainda não formalmente aceita.
- decisionRefs: pending-formal-validation-decision
- reasonCode: `INTAKE_VALIDATION_OWNER_MISSING`
- informationalCoverage: documented
- canonicalDefaultStatus: `not-mapped`
- canonicalBlockingGap: Status invalido ou promocao indevida.
- canonicalReasonCode: `INTAKE_VALIDATION_NOT_PROVIDER_SELECTION`

## 5. Intake Validation Matrix — 12 categorias

| Category | Status | Blocking gap |
| --- | --- | --- |
| security | blocked | Assinatura, secret boundary e revisão Security. |
| privacy/compliance | blocked | Jurisdição, residência e transferência internacional. |
| contract compatibility | blocked | Versões, payloads e contrato interno. |
| webhook/event model | blocked | Handshake, assinatura e delivery semantics. |
| replay/idempotency | blocked | Controle durável e tratamento de duplicidades. |
| secret management | blocked | Storage, rotation, revocation e redaction. |
| observability/SLO | blocked | Baseline operacional, métricas e alertas. |
| rollback/disable | blocked | Procedimento e responsáveis pela desativação. |
| tenant/workspace/scope safety | blocked | Binding nativo e isolamento. |
| PII/sensitive data handling | blocked | Retenção, masking e export. |
| operational support | blocked | Escalation e responsáveis humanos. |
| commercial/cost | blocked | Quotas, custos e condições AI Providers. |

## 6. Cobertura informacional

- documented: 8/25
- partial: 16/25
- pending: 1/25

- Formal mappings blocked: 25/25
- Formal categories blocked: 12/12
- Accepted-for-selection-review-only: 0/25


A cobertura informacional foi recalculada conforme o
intake materializado, incluindo a ratificação do Founder.

Não representa percentual de prontidão operacional,
elegibilidade formal ou aprovação do provider.

## 7. Delta técnico proposto — não implementar

- Handshake GET Meta.
- Verificação HMAC-SHA256 sobre raw body.
- Validação WABA e Phone Number ID.
- Normalização para o contrato interno existente.
- Channel Binding e isolamento tenant/workspace.
- Entitlement fail-closed.
- Replay e idempotência durável.
- ACK compatível com o protocolo Meta.
- Gestão de segredos sem fallback inseguro.
- Minimização de PII.
- Observabilidade e rollback.
- Avaliação LGPD e transferência internacional.

Identidade do canal, identidade do remetente e autoridade
interna EIAH devem permanecer distintas.

## 8. Critérios futuros de aceite — proposta

1. HTTPS e handshake válidos, sem Vercel.
2. Assinatura válida aceita; assinatura inválida rejeitada.
3. Isolamento WABA e Phone Number ID.
4. Entitlement fail-closed.
5. Idempotência durável, inclusive após restart.
6. ACK após disposição segura e durável do evento.
7. Proteção de PII e credenciais.
8. Observabilidade.
9. Rollback demonstrável.
10. Preservação do contrato F2.12.
11. Zero Runs, zero agentes acionados e zero mensagens enviadas.
12. Evidências reais registradas e indexadas.

Nenhum critério operacional foi testado nesta etapa.

## 9. Fronteira normativa

A camada de transporte valida entradas canônicas
deterministicamente e não interpreta conteúdo semântico.

Não introduzir cognição, agentes, engine, launcher,
Coordinator, Radar ou MarketScan nesta etapa.

Não alterar código operacional ou infraestrutura.

Não executar provider external calls, testes reais,
mutações de negócio ou ações críticas.

## 10. Resultado

- reviewStatus: incomplete
- providerFinalSelection: not authorized
- providerIntegration: blocked
- assessmentMode: selection-only
- operationalReadiness: not evidenced

Reason codes:

- CANDIDATE_EVIDENCE_MAPPING_INCOMPLETE
- INTAKE_VALIDATION_OWNER_MISSING
- INTAKE_VALIDATION_EVIDENCE_MISSING
- INTAKE_VALIDATION_BLOCKED
- PROVIDER_FINAL_SELECTION_NOT_AUTHORIZED
- PROVIDER_INTEGRATION_STILL_BLOCKED

Classification:

WHATSAPP_META_EVIDENCE_MAPPING_MATERIALIZED_BLOCKED

A materialização documental não constitui seleção final,
aprovação de procurement ou autorização de integração.
