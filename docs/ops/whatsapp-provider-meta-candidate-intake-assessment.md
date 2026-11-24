# WhatsApp Provider Candidate Intake — Meta Cloud API

## 1. Identificação e natureza

- Assessment date: 2026-11-24
- Assessment mode: selection-only
- Status: proposta/parcial
- Baseline: 2b9225da
- Branch: docs/whatsapp-meta-candidate-assessment
- Technical reference: 8da51340
- Observed staging deployment reference: f0da60cd

Este registro deriva do Candidate Intake F4.1 e da
Evidence Mapping Matrix F4.2.

Não substitui os templates canônicos, não constitui seleção
definitiva do provider e não autoriza implementação.

## 2. Referências normativas

- [F4.0 Selection-Only Charter](whatsapp-provider-selection-formal-phase-opening-selection-only-charter.md)
- [F4.1 Candidate Intake](whatsapp-provider-candidate-intake-template-preliminary-eligibility-checklist.md)
- [F4.2 Evidence Mapping](whatsapp-provider-candidate-evidence-mapping-intake-validation-matrix.md)
- [F4.3 Preliminary Review](whatsapp-provider-candidate-preliminary-review-packet-reviewer-assignment.md)
- [F4.4 Review Outcome](whatsapp-provider-candidate-preliminary-review-outcome-selection-no-go-record.md)
- [F4.5 Selection Closure](whatsapp-provider-selection-evidence-closure-candidate-review-boundary.md)
- [F5.0 Final Selection Charter](whatsapp-provider-final-selection-formal-phase-opening-final-selection-only-charter.md)

## 3. Candidate Intake — 25 campos

### 01. candidateId

Proposed: F4-CAND-2026-001

Status: provisional.

A pesquisa anterior não localizou registro correspondente
nas referências examinadas. Não constitui reserva formal
ou comprovação global de unicidade.

### 02. providerName

Meta WhatsApp Cloud API.

### 03. providerType

official.

Classificação preliminar baseada na documentação pública
identificada durante a avaliação anterior.

### 04. officialWebsite

https://developers.facebook.com/

### 05. jurisdiction

Pendente de ratificação da entidade contratante, legislação
aplicável e condições efetivamente aceitas pela EIAH.

### 06. commercialContact

Canal público identificado:

https://whatsappbusiness.com/developers/developer-hub/

Contato comercial específico e condições da conta pendentes.

### 07. technicalContact

https://developers.facebook.com/support/

Canal público identificado. Elegibilidade efetiva de
suporte e escalation path pendentes.

### 08. securityContact

Pendente de validação do canal oficial específico
para segurança e comunicação de vulnerabilidades.

### 09. supportedAPIs

- WhatsApp Cloud API.
- Meta Graph API.

Versões, limites e compatibilidade contratual completa
devem ser ratificados antes de eventual implementação.

### 10. webhookCapabilities

Capacidades reportadas na pesquisa documental anterior:

- GET challenge verification.
- POST event delivery.
- Signed notifications.
- Delivery acknowledgements.
- Delivery retries.
- Possibilidade de eventos duplicados.

Nenhum webhook real foi testado nesta etapa.

### 11. signatureVerification

Modelo reportado: HMAC-SHA256 sobre raw body,
com header X-Hub-Signature-256.

A implementação nativa Meta na EIAH permanece
não autorizada e não evidenciada.

### 12. replayProtection

Partial.

O contrato interno existente apresenta controle de replay.

A adequação ao protocolo Meta, à janela de reentrega
e à persistência durável permanece pendente.

### 13. idempotencySupport

Partial.

Identificadores de mensagens foram identificados
na documentação reportada.

A estratégia EIAH de idempotência durável e
tratamento de duplicidades permanece pendente.

### 14. secretManagementModel

Partial.

Separação proposta entre:

- Verify Token.
- App Secret.
- Access Token.

Storage, rotation, revocation, redaction e
secret boundary devem ser ratificados.

Fallback de segredo identificado na baseline stub
não deve ser tratado como adequado para exposição pública.

Nenhum segredo foi solicitado, utilizado ou registrado.

### 15. dataResidency

Partial.

A região Virginia, Estados Unidos, foi reportada na
inspeção anterior do serviço Render eiah-api-staging.

A residência efetiva dos dados Meta, subprocessadores,
persistência EIAH e fluxo internacional permanecem
pendentes de avaliação.

### 16. PIIHandling

Partial.

A documentação anterior reportou condições de retenção
e segurança da Cloud API.

A política EIAH de minimização, retenção, masking,
redaction, export e controle de acesso permanece pendente.

Não registrar conteúdo real de mensagens neste assessment.

### 17. complianceClaims

Partial.

Claims reportados na avaliação documental anterior:

- SOC 2 Type II.
- ISO 27001.
- Cláusulas de transferência internacional de dados.

Abrangência, vigência, aplicabilidade contratual e
conformidade EIAH não foram ratificadas.

### 18. SLOClaims

Partial.

Condições de entrega e reentrega foram identificadas
na documentação pública reportada.

SLA contratual, quotas, rate limits e baseline
operacional EIAH permanecem pendentes.

### 19. rollbackDisableSupport

Partial.

Mecanismos propostos:

- Desativação do ingresso EIAH.
- Bloqueio da rota na camada de borda.
- Desativação da assinatura do webhook Meta.
- Revogação controlada de credenciais.

Nenhum mecanismo foi executado ou testado.

### 20. observabilitySupport

Partial.

Fonte pública reportada:

https://metastatus.com/whatsapp-business-api

Baseline EIAH de métricas, alertas, logs e
procedimentos operacionais permanece pendente.

### 21. tenantWorkspaceScopeSupport

Partial.

O contrato interno WhatsApp read-only identificado
na baseline técnica contempla:

- Channel Binding.
- Tenant/workspace/scope.
- Entitlement.
- Fail-closed.

O mapeamento nativo Meta permanece proposta.

Identidade do canal, identidade do remetente e
autoridade interna EIAH devem permanecer distintas.

Telefone ou BSUID não constituem automaticamente
autenticação ou autorização no SaaS EIAH.

### 22. knownLimitations

- App Meta reportado como não publicado.
- Callback anteriormente observado associado ao Vercel.
- Vercel excluído do futuro fluxo WhatsApp.
- Adaptador nativo Meta não evidenciado.
- Idempotência durável pendente.
- Residência efetiva de dados pendente.
- Condições comerciais para AI Providers pendentes.
- Infraestrutura de ingresso ainda não ratificada.
- Nenhum teste operacional autorizado.

A situação dos painéis administrativos representa
observação histórica reportada, não revalidação atual.

### 23. requiredEvidenceRefs

Pending formal indexation.

As fontes públicas e referências técnicas devem ser
consolidadas no Evidence Mapping e no registro
documental correspondente.

Não atribuir aceite formal a referências não verificadas.

### 24. intakeOwner

Founder EIAH.

Designação ratificada pelo Founder na sessão de
governança de 2026-11-24, conforme autorização
expressa registrada na conversa de trabalho.

O Founder também ratificou sua função de Executive Sponsor.

A materialização deste registro não constitui assinatura
digital nem substitui revisões independentes aplicáveis.

Demais responsáveis humanos e reviewers permanecem
pendentes de designação formal.

### 25. reviewStatus

incomplete.

## 4. Escopo operacional futuro

Preparar a abertura de um canal inbound read-only
seguro e governado entre WhatsApp e EIAH.

Arquitetura proposta:

Meta WhatsApp
-> Cloudflare
-> Render EIAH API
-> Adaptador nativo Meta
-> Contrato interno WhatsApp Read-only.

O domínio api-staging.eiah.ia.br constitui proposta,
não configuração existente ou validada.

Vercel não integra a arquitetura pretendida.

## 5. Disciplina normativa de entrada

Em conformidade com AGENTS.md e IA_EIAH.md:

- Metadados do protocolo são entradas canônicas.
- Assinaturas e identificadores exigem validação
  determinística.
- O conteúdo textual possui natureza semântica.
- A camada de transporte não interpreta intenção.
- O adaptador não assume funções cognitivas.
- Nenhum agente ou engine deve ser acionado nesta etapa.

## 6. Limites de autorização

Não autorizados:

- Seleção final do provider.
- Implementação do adaptador.
- Chamadas reais à Graph API.
- Utilização de credenciais.
- Alteração de DNS ou webhook.
- Publicação do aplicativo Meta.
- Alteração do número empresarial.
- Envio de mensagens.
- Acionamento de agentes.
- Coordinator, Radar ou MarketScan.
- Criação de Runs.
- Mutações de negócio.
- Alterações operacionais.
- Produção.

## 7. Blocking gaps

- CANDIDATE_SECURITY_GAP
- CANDIDATE_PRIVACY_GAP
- CANDIDATE_EVIDENCE_MISSING
- CANDIDATE_ROLLBACK_GAP

A existência de owner para o intake não elimina
a necessidade de designação dos responsáveis e
reviewers exigidos pelas revisões específicas.

## 8. Resultado

- reviewStatus: incomplete
- providerFinalSelection: not authorized
- providerIntegration: blocked
- operationalReadiness: not evidenced
- assessmentMode: selection-only

Classification:

WHATSAPP_META_CANDIDATE_INTAKE_CONSOLIDATED_DRAFT_INCOMPLETE

Este documento registra uma avaliação preliminar.
Não constitui aprovação de procurement, autorização
de integração ou evidência de operação produtiva.
