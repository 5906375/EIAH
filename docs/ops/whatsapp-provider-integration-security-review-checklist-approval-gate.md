# WhatsApp Provider Integration — Security Review Checklist / Approval Gate

## Objetivo

Este documento define o Security Review Checklist e o Approval Gate documental para uma eventual revisao futura de integracao de provider WhatsApp.

F2.19 nao autoriza execucao, nao autoriza producao, nao integra provider real, nao provisiona secret produtivo, nao habilita webhook produtivo e nao altera o estado `provider blocked` herdado de F2.15-F2.18.

## Owners/reviewers obrigatorios

| Area | Reviewer obrigatorio | Responsabilidade | Escalation |
| --- | --- | --- | --- |
| Security | Security owner | Aprovar signature, replay, secret, PII, incident response e threat model. | Founder/Executive owner |
| Backend/API | Backend/API owner | Revisar webhook, payload validation, binding, entitlement e mutation blocking. | Tech lead |
| Platform governance | Platform governance owner | Validar fail-closed, SLOs, evidence, reasonCodes e provider boundary. | Tech lead |
| DocOps | DocOps owner | Validar evidencia, Evidence Index, runbook linkage e approval record. | Platform governance owner |
| Product/Platform | Product/Platform owner | Confirmar escopo, nao-autorizacao produtiva e decision record. | Founder/Executive owner |

Sem todos os reviewers obrigatorios, o estado deve permanecer `security-review-blocked`.

## Estados de aprovacao

| Estado | Significado | Efeito permitido |
| --- | --- | --- |
| `security-review-not-started` | Checklist ainda nao iniciado. | Nenhum. Provider integration continua `blocked`. |
| `security-review-blocked` | Checklist falhou, evidencia ausente ou reviewer obrigatorio ausente. | Nenhum. Corrigir bloqueios antes de nova revisao. |
| `security-review-deferred` | Revisao adiada por risco, pendencia ou evidencia incompleta. | Nenhum. Registrar pendencias e owners. |
| `security-review-ready-for-approval` | Checklist completo para aprovacao documental dos reviewers. | Permite somente revisao humana do gate. |
| `approved-for-next-design-review-only` | Reviewers aprovaram apenas proxima revisao de design. | Nao autoriza execucao, producao, provider real, secret produtivo, webhook produtivo ou mutacoes. |

## Security review checklist

| Item | Evidencia minima | Reviewer obrigatorio | Falha gera |
| --- | --- | --- | --- |
| signature verification | Algoritmo, headers, canonical string, cobertura de payload e fail-closed documentados. | Security owner + Backend/API owner | `SECURITY_SIGNATURE_VERIFICATION_NOT_APPROVED` |
| replay/idempotency | Janela de replay, store/idempotency key e comportamento para duplicidade documentados. | Security owner + Backend/API owner | `SECURITY_REPLAY_PROTECTION_NOT_APPROVED` |
| timestamp window | Skew permitido, rejeicao de timestamp ausente/futuro/antigo e clock assumptions documentados. | Security owner | `SECURITY_REPLAY_PROTECTION_NOT_APPROVED` |
| eventId uniqueness | Regra de unicidade por provider/eventId e colisao fail-closed documentada. | Backend/API owner | `SECURITY_REPLAY_PROTECTION_NOT_APPROVED` |
| payload validation | Schema, envelope, provider allowlist e campos obrigatorios documentados. | Backend/API owner + Platform governance owner | `SECURITY_REVIEW_NOT_APPROVED` |
| payload size limits | Limite antes de parsing e resposta fail-closed documentados. | Backend/API owner | `SECURITY_REVIEW_NOT_APPROVED` |
| PII masking | Data map, campos proibidos, masking antes de serializacao e redaction documentados. | Security owner + DocOps owner | `SECURITY_PRIVACY_REVIEW_NOT_APPROVED` |
| secret management | Secret store, rotacao, revogacao, segregacao por ambiente e redaction documentados. | Security owner | `SECURITY_SECRET_BOUNDARY_NOT_APPROVED` |
| tenant/workspace/scope binding | Resolucao governada e fail-closed para confusao de tenant/workspace/scope documentados. | Platform governance owner + Backend/API owner | `SECURITY_REVIEW_NOT_APPROVED` |
| entitlement enforcement | Entitlement obrigatorio e bypass blocked documentados. | Platform governance owner | `SECURITY_REVIEW_NOT_APPROVED` |
| read-only enforcement | Garantia `sideEffects=0` e fronteira read-only documentadas. | Platform governance owner | `SECURITY_REVIEW_NOT_APPROVED` |
| mutation blocking | Bloqueio de mutacoes, `lead.create` e `lead.discard` documentado. | Backend/API owner + Platform governance owner | `SECURITY_REVIEW_NOT_APPROVED` |
| critical action blocking | Bloqueio de acao critica e necessidade futura de HITL/policy documentados. | Security owner + Product/Platform owner | `SECURITY_REVIEW_NOT_APPROVED` |
| observability/SLO | Metricas sanitizadas, SLOs zero, thresholds e blind spot handling documentados. | Platform governance owner + DocOps owner | `SECURITY_OBSERVABILITY_NOT_APPROVED` |
| rollback/disable | Disable de provider/webhook, rollback de secret, roteamento e contrato documentados. | Backend/API owner + Security owner | `SECURITY_ROLLBACK_NOT_APPROVED` |
| incident response | Classes de incidente, owners, evidencias minimas e escalation documentados. | Security owner + DocOps owner | `SECURITY_REVIEW_NOT_APPROVED` |
| decision record | Promotion Decision Record completo e explicitamente nao produtivo documentado. | Product/Platform owner + DocOps owner | `SECURITY_DECISION_RECORD_NOT_APPROVED` |

## Approval gate documental

O approval gate so pode atingir `approved-for-next-design-review-only` quando:

1. todos os itens do checklist estiverem completos;
2. todos os owners/reviewers obrigatorios aprovarem;
3. F2.16 gaps blocking estiverem fechados ou explicitamente mantidos como bloqueadores;
4. F2.17 design brief continuar non-execution;
5. F2.18 threat model permanecer referenciado;
6. observability/SLO, rollback/disable, privacy/PII, secret boundary e decision record estiverem documentados;
7. provider integration continuar `blocked`;
8. a aprovacao declarar que nao autoriza producao, provider real, secret produtivo, webhook produtivo, mutacoes ou side effects.

## ReasonCodes

- `SECURITY_REVIEW_REQUIRED`
- `SECURITY_REVIEW_NOT_APPROVED`
- `SECURITY_SECRET_BOUNDARY_NOT_APPROVED`
- `SECURITY_WEBHOOK_BOUNDARY_NOT_APPROVED`
- `SECURITY_SIGNATURE_VERIFICATION_NOT_APPROVED`
- `SECURITY_REPLAY_PROTECTION_NOT_APPROVED`
- `SECURITY_PRIVACY_REVIEW_NOT_APPROVED`
- `SECURITY_OBSERVABILITY_NOT_APPROVED`
- `SECURITY_ROLLBACK_NOT_APPROVED`
- `SECURITY_DECISION_RECORD_NOT_APPROVED`
- `SECURITY_APPROVAL_NOT_PRODUCTION_AUTHORIZATION`

## Provider integration boundary

Provider integration permanece `blocked`. Este documento nao cria provider, nao cria webhook, nao provisiona secret, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes e nao executa acao critica.

## Nao-autorizacao de execucao

F2.19 nao autoriza execucao, integracao, configuracao, teste com provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, lead action, acao critica ou side effect.

## Nao-autorizacao produtiva

O approval gate documental nao autoriza producao. Mesmo `approved-for-next-design-review-only` permite apenas uma proxima revisao de design, em etapa separada, com novo escopo e nova evidencia.

## Status final

Status: proposta/parcial evidenciada documentalmente.
