# WhatsApp Provider Integration — Design Questions Register / Decision Log

## Objetivo

Este documento cria o Design Questions Register e o Decision Log da F3.1 para a integracao futura hipotetica de provider WhatsApp.

F3.1 e um artefato documental de design-only. Ele nao autoriza implementacao, nao autoriza execucao, nao autoriza producao, nao integra provider real, nao provisiona secret produtivo, nao habilita webhook produtivo, nao cria mutacoes e nao altera o estado `provider integration blocked` herdado de F2.22, F2.23, F2.25, F2.26 e F3.0.

## Design Questions Register

O register consolida perguntas de design que precisam ser respondidas antes de qualquer avaliacao futura fora da fase design-only.

Cada pergunta deve permanecer rastreavel, ter owner minimo, evidencias esperadas, impacto de boundary e estado explicito. Uma resposta no register nao e autorizacao de implementacao; ela apenas reduz ambiguidade documental para futura revisao governada.

| QuestionId | Pergunta | Owner minimo | Status inicial | Evidencia requerida | Boundary impact |
| --- | --- | --- | --- | --- | --- |
| `F3-DQ-001` | Qual provider WhatsApp futuro poderia ser avaliado, se uma fase posterior autorizar revisao de design? | Product/Platform; Backend/API; Platform governance | `open` | Criterios de selecao, riscos de contrato, dependencias externas, approval de governance | Provider selection permanece nao autorizada. |
| `F3-DQ-002` | Qual modelo de assinatura e verificacao de evento seria exigido para eventos de provider? | Security; Backend/API | `open` | Algoritmo, canonical string, headers cobertos, payload coverage, fail-closed matrix | Event verification real permanece inativa. |
| `F3-DQ-003` | Qual janela de timestamp, replay guard e deduplicacao seria aceitavel para eventos reais? | Security; Backend/API; Platform governance | `open` | Janela temporal, idempotencia, unicidade de `eventId`, resposta para replay/duplicidade | Provider event ingestion permanece bloqueado. |
| `F3-DQ-004` | Qual politica de secret rotation, revogacao e segregacao por ambiente seria obrigatoria? | Security; Platform governance | `open` | Modelo de storage, rotacao, revogacao, redaction, controles por ambiente | Secret produtivo permanece nao provisionado e nao autorizado para uso. |
| `F3-DQ-005` | Qual boundary de PII/sensiveis seria exigido para payloads, logs, metricas, bundles e evidencias? | Privacy/Compliance; Security; DocOps | `open` | Data map, masking, retention, redaction, proibicao de dados brutos | PII/sensiveis permanecem proibidos em evidencias e observability. |
| `F3-DQ-006` | Qual envelope de evento futuro preservaria compatibilidade com a cadeia read-only e o bundle export? | Backend/API; Platform governance | `open` | Schema versionado, mapeamento provider-to-envelope, compatibility gate | Contrato read-only congelado nao pode ser relaxado. |
| `F3-DQ-007` | Quais metricas, SLOs e thresholds seriam obrigatorios para uma fase futura de provider? | Platform governance; Backend/API; Security | `open` | Baseline de observability, alertas, incident classes, zero-SLOs | Observability real de provider permanece inativa. |
| `F3-DQ-008` | Qual plano de rollback/disable seria obrigatorio para levantar qualquer hold futuro? | Platform governance; Backend/API; Security | `open` | Disable plan, rollback steps, stop criteria, owner on-call | Rollback/disable futuro nao esta ativado. |
| `F3-DQ-009` | Quais owners e approvals minimos seriam exigidos para qualquer decisao futura? | Executive sponsor; Platform governance; Product/Platform; DocOps | `open` | RACI, approvers, escalation, human approval | Ausencia de approvals mantem provider integration bloqueado. |
| `F3-DQ-010` | Qual evidencia minima seria exigida antes de sair de design-only? | Platform governance; Security; Privacy/Compliance; Backend/API; DocOps | `blocked` | Decision record completo, security/privacy approvals, checks, isolamento, gates F2/F3 | Saida de design-only permanece nao autorizada. |

## Decision Log

O Decision Log registra decisoes de design derivadas do register. Ele nao pode registrar decisao produtiva, approval de execucao, selecao efetiva de provider, uso de secret, habilitacao de webhook, criacao de mutacao ou alteracao tecnica.

| DecisionId | Pergunta vinculada | Estado | Decisao | Evidencia refs | Observacao |
| --- | --- | --- | --- | --- | --- |
| `F3-DL-001` | `F3-DQ-001` | `open` | Provider futuro ainda nao selecionado. | F3.0; F2.16; F2.23; F2.26 | Qualquer selecao exige fase futura explicita. |
| `F3-DL-002` | `F3-DQ-002` | `open` | Modelo de assinatura real ainda nao aprovado. | F2.18; F2.19; F3.0 | Verificacao real de eventos permanece inativa. |
| `F3-DL-003` | `F3-DQ-004` | `open` | Secret produtivo permanece bloqueado. | F2.22; F2.23; F3.0 | Nenhum secret produtivo pode ser solicitado ou usado. |
| `F3-DL-004` | `F3-DQ-010` | `blocked` | Saida de design-only nao autorizada. | F2.25; F2.26; F3.0 | Provider integration permanece `blocked`. |

## Campos obrigatorios

Cada pergunta do register deve conter:

- `questionId`
- `question`
- `context`
- `owner`
- `status`
- `options`
- `requiredEvidence`
- `boundaryImpact`
- `blockers`
- `decision`
- `decisionDate`
- `evidenceRefs`

Cada entrada do Decision Log deve conter os mesmos campos quando aplicavel e deve referenciar ao menos uma pergunta existente por `questionId`.

## Decision states

- `open`: pergunta ou decisao ainda sem resposta suficiente.
- `deferred`: resposta postergada para fase futura sem liberar implementacao.
- `answered-design-only`: resposta documental suficiente para design, sem autorizacao de execucao.
- `blocked`: decisao bloqueada por boundary, evidencia ausente, approval ausente ou freeze ativo.
- `superseded`: entrada substituida por decisao documental posterior, mantendo rastreabilidade.

Nenhum estado equivale a aprovacao produtiva, integracao real ou autorizacao de implementacao.

## Perguntas minimas

F3.1 exige que qualquer register futuro preserve, no minimo, perguntas sobre:

- provider futuro;
- assinatura e verificacao de evento;
- timestamp, replay e duplicidade;
- secret rotation, revogacao e boundary por ambiente;
- PII/sensitive data boundary;
- envelope e compatibilidade com contratos read-only;
- observability, SLOs e thresholds;
- rollback/disable;
- owners, escalation e approvals;
- evidencia necessaria para sair de design-only.

## ReasonCodes

- `DESIGN_QUESTION_REGISTER_ONLY`
- `DECISION_LOG_ONLY`
- `DECISION_LOG_INCOMPLETE`
- `DESIGN_DECISION_PENDING`
- `DESIGN_DECISION_NOT_IMPLEMENTATION_AUTHORIZATION`
- `PROVIDER_SELECTION_NOT_AUTHORIZED`
- `SECRET_DECISION_NOT_AUTHORIZED_FOR_USE`
- `WEBHOOK_DECISION_NOT_AUTHORIZED_FOR_PRODUCTION`
- `PROVIDER_IMPLEMENTATION_STILL_BLOCKED`

## Provider integration boundary

Provider integration permanece `blocked`. F3.1 nao cria provider real, nao usa secret produtivo, nao habilita webhook produtivo, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes, nao cria `lead.create`, nao cria `lead.discard` e nao executa acao critica.

## Design-only continuity

F3.1 preserva o Design-Only Charter F3.0. O register e o log sao instrumentos de organizacao de perguntas e decisoes documentais; eles nao levantam F2.23 Final Readiness Freeze, F2.22 No-Go Ledger, F2.25 Non-Implementation Boundary ou F2.26 governance baseline.

## Nao-autorizacao de implementacao

F3.1 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine, launcher, workflow, app, package ou script.

## Nao-autorizacao de execucao

F3.1 nao autoriza execucao, integracao, configuracao, teste com provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, lead action, acao critica, provider external call, mutation external side effect ou `sideEffects != 0`.

## Nao-autorizacao produtiva

F3.1 nao e autorizacao de producao. Nenhuma decisao registrada neste documento pode ser tratada como permissao para operar WhatsApp, integrar provider, provisionar secret produtivo, habilitar webhook produtivo ou executar mutacoes.

## Status final

Status: proposta/parcial evidenciada documentalmente.
