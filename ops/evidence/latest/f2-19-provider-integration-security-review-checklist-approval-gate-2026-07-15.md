# F2.19 — Provider Integration Security Review Checklist / Approval Gate — 2026-07-15

## Resumo executivo

Foi criado o Security Review Checklist / Approval Gate documental para uma eventual revisao futura de integracao de provider WhatsApp.

F2.19 nao autoriza execucao, nao autoriza producao e mantem provider integration em `blocked`.

## Pré-condição F2.18

Pre-condicao comprovada antes das alteracoes:

- F2.18 mergeada em `main` no commit `a89b227bf6e00819c46ed90ff8db85772e2c636b`.
- `CI Monorepo`: `completed success`, run `29499435216`.
- `IMOB Worker Mutation E2E`: `completed success`, run `29499435365`.

## Arquivos lidos

- `CODEX.md`
- `/home/jusall/.codex/attachments/a8b2dfe4-7f3d-44d7-ae26-2583afcedf2f/pasted-text.txt`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/ops/whatsapp-provider-integration-threat-model-abuse-case-register.md`
- `docs/ops/whatsapp-provider-integration-design-brief-non-execution-plan.md`
- `docs/ops/whatsapp-read-only-adapter-pre-provider-gap-register.md`
- `docs/ops/whatsapp-read-only-adapter-evidence-closure-pre-provider-boundary.md`
- `docs/ops/whatsapp-read-only-adapter-observability.md`
- `docs/ops/whatsapp-read-only-adapter-operational-runbook.md`
- `ops/evidence/latest/f2-18-provider-integration-threat-model-abuse-case-register-2026-07-15.md`

## Problema resolvido

F2.18 definiu threat model e abuse cases, mas ainda faltava um checklist de security review com approval gate documental, reviewers obrigatorios, estados de aprovacao e reasonCodes especificos.

F2.19 resolve essa lacuna documental sem cruzar a fronteira pre-provider.

## Security review checklist

O checklist foi criado em `docs/ops/whatsapp-provider-integration-security-review-checklist-approval-gate.md`.

Ele exige revisao documental para:

- signature verification;
- replay/idempotency;
- timestamp window;
- eventId uniqueness;
- payload validation;
- payload size limits;
- PII masking;
- secret management;
- tenant/workspace/scope binding;
- entitlement enforcement;
- read-only enforcement;
- mutation blocking;
- critical action blocking;
- observability/SLO;
- rollback/disable;
- incident response;
- decision record.

## Approval gate

O approval gate so permite o estado `approved-for-next-design-review-only`, e apenas quando o checklist estiver completo, todos os reviewers obrigatorios aprovarem e a decisao declarar explicitamente que nao autoriza execucao nem producao.

O gate nao autoriza provider real, secret produtivo, webhook produtivo, mutacoes, `lead.create`, `lead.discard`, acoes criticas ou side effects.

## Owners/reviewers

- Security owner, com escalation para Founder/Executive owner.
- Backend/API owner, com escalation para Tech lead.
- Platform governance owner, com escalation para Tech lead.
- DocOps owner, com escalation para Platform governance owner.
- Product/Platform owner, com escalation para Founder/Executive owner.

Sem todos os reviewers obrigatorios, o estado deve permanecer `security-review-blocked`.

## Estados de aprovação

- `security-review-not-started`
- `security-review-blocked`
- `security-review-deferred`
- `security-review-ready-for-approval`
- `approved-for-next-design-review-only`

## Checklist obrigatório

- signature verification;
- replay/idempotency;
- timestamp window;
- eventId uniqueness;
- payload validation;
- payload size limits;
- PII masking;
- secret management;
- tenant/workspace/scope binding;
- entitlement enforcement;
- read-only enforcement;
- mutation blocking;
- critical action blocking;
- observability/SLO;
- rollback/disable;
- incident response;
- decision record.

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

Provider integration permanece `blocked`. F2.19 nao cria provider real, nao usa secret produtivo, nao habilita webhook produtivo, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes, nao cria `lead.create`, nao cria `lead.discard` e nao executa acao critica.

## Não-autorização de execução

F2.19 nao autoriza execucao, integracao, configuracao, teste com provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, lead action, acao critica ou side effect.

## Não-autorização produtiva

O approval gate documental nao autoriza producao. Mesmo `approved-for-next-design-review-only` permite apenas uma proxima revisao de design, em etapa separada, com novo escopo e nova evidencia.

## Checks executados

- `pnpm check:evidence-index`: passou.
  - `ok: true`
  - `refsChecked: 551`
- `pnpm check:docs-link-integrity`: passou.
  - `ok: true`
  - `filesChecked: 15`
- `git diff --check`: passou sem saida.
- `git diff -- .github/workflows release.yml apps packages scripts`: passou sem saida.

## Prova de isolamento

Escopo documental restrito aos arquivos esperados:

- `docs/ops/whatsapp-provider-integration-security-review-checklist-approval-gate.md`
- `ops/evidence/latest/f2-19-provider-integration-security-review-checklist-approval-gate-2026-07-15.md`
- `docs/EVIDENCE_INDEX.md`

Nao foram planejadas alteracoes em `.github/workflows`, `release.yml`, `apps`, `packages` ou `scripts`.

O diff de isolamento confirmou ausencia de alteracoes nessas superficies.

## Riscos residuais

- O checklist nao prova readiness operacional de provider.
- Approval gate documental nao substitui decision record futuro.
- Qualquer execucao futura sem security review aprovado e escopo separado deve permanecer bloqueada.

## Próximos passos

- Executar checks obrigatorios.
- Manter provider integration em `blocked`.
- Usar F2.19 apenas como checklist/gate documental para revisoes futuras.

## Status final

Status: proposta/parcial evidenciada documentalmente.
