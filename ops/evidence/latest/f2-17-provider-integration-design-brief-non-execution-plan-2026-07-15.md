# F2.17 — Provider Integration Design Brief / Non-Execution Plan — 2026-07-15

## Resumo executivo

Foi criado um Provider Integration Design Brief / Non-Execution Plan para uma integracao futura hipotetica de provider WhatsApp.

F2.17 e design-only, nao autoriza execucao e mantem provider integration em `blocked`.

## Pré-condição F2.16

Pre-condicao comprovada antes das alteracoes:

- F2.16 mergeada em `main` no commit `dba2d080fc618b97abf268223785d064c5abd307`.
- `CI Monorepo`: `completed success`, run `29497966289`.
- `IMOB Worker Mutation E2E`: `completed success`, run `29497966217`.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/ops/whatsapp-read-only-adapter-pre-provider-gap-register.md`
- `docs/ops/whatsapp-read-only-adapter-evidence-closure-pre-provider-boundary.md`
- `docs/ops/whatsapp-read-only-adapter-promotion-decision-record-template.md`
- `docs/ops/whatsapp-read-only-adapter-promotion-readiness-matrix.md`
- `docs/ops/whatsapp-read-only-adapter-observability.md`
- `docs/ops/whatsapp-read-only-adapter-operational-runbook.md`
- `ops/evidence/latest/f2-16-pre-provider-gap-register-provider-integration-entry-criteria-2026-07-15.md`

## Problema resolvido

F2.16 definiu gaps e entry criteria para qualquer avaliacao futura de provider, mas ainda faltava um design brief explicitamente nao executavel que descrevesse a arquitetura hipotetica sem cruzar o limite pre-provider.

F2.17 resolve essa lacuna documental, mantendo provider integration bloqueada.

## Design brief

O design brief criado em `docs/ops/whatsapp-provider-integration-design-brief-non-execution-plan.md` descreve uma arquitetura futura hipotetica:

1. Provider real enviaria evento para webhook produtivo somente se autorizado em etapa futura.
2. Webhook aplicaria assinatura, timestamp, replay, duplicidade, tamanho e schema antes de roteamento interno.
3. Evento validado seria convertido para envelope governado e sanitizado.
4. Channel binding resolveria tenant, workspace, scope e entitlement em modo fail-closed.
5. Adapter preservaria contrato versionado e export auditavel sem PII/sensiveis.
6. Qualquer mutacao ou acao critica exigiria etapa separada com HITL, policy, receipt/ledger quando aplicavel e decision record proprio.

Este design e hipotetico e nao executavel por F2.17.

## Non-execution plan

O plano de nao-execucao declara que:

- provider integration permanece `blocked`;
- provider real nao deve ser configurado;
- secret produtivo nao deve ser provisionado;
- webhook produtivo nao deve ser habilitado;
- endpoint publico novo nao deve ser criado;
- event verification real de provider nao deve ser ativada;
- rollback/disable real de provider nao deve ser ativado;
- observability produtiva de provider nao deve ser ativada;
- mutacoes, `lead.create`, `lead.discard` e acoes criticas permanecem bloqueadas;
- qualquer proposta de execucao deve retornar para F2.16 entry criteria e F2.14 decision record.

## Provider boundary

Provider WhatsApp real permanece fora do escopo. F2.17 nao cria provider SDK, credencial, endpoint, chamada externa ou roteamento externo.

## Secret boundary

Secret produtivo permanece nao provisionado. F2.17 nao define valor, nome de secret, secret store real, variavel de ambiente produtiva ou injecao de secret.

## Webhook boundary

Webhook produtivo permanece desabilitado. F2.17 nao cria endpoint publico novo, nao altera roteamento externo e nao ativa webhook de provider.

## Event verification boundary

Event verification real de provider permanece nao ativa. O design futuro exige assinatura, timestamp, replay guard, idempotencia, schema, tamanho, allowlist e fail-closed, mas F2.17 nao implementa nem ativa esses mecanismos.

## Rollback/disable boundary

Rollback/disable real de provider permanece nao ativado. O design futuro deve prever disable de provider/webhook, rollback de roteamento externo, revogacao/rotacao de secret, rollback contratual e stop criteria.

## Observability/SLO boundary

Observability produtiva de provider permanece nao ativa. O design futuro deve estender F2.10 com metricas sanitizadas e preservar SLOs zero para side effects, PII leakage, critical action execution e mutation external side effect.

## Privacy/PII boundary

Privacy/PII review permanece prerequisito. F2.17 exige que qualquer desenho futuro prove data map, masking, retention/descarte e ausencia de telefone bruto, texto bruto, payload bruto, assinatura, token, cookie ou Authorization em logs, metricas, bundles e evidencias.

## Security review boundary

Security review permanece prerequisito. O design futuro deve cobrir assinatura, replay protection, idempotencia, rate limit, abuse controls, secret lifecycle, segregacao por ambiente e incident response.

## Decision record prerequisite

Qualquer tentativa futura de execucao exige Promotion Decision Record especifico, referenciando F2.8-F2.17, gap closure F2.16, owners, human approval, rollback/disable, observability/SLO, privacy/PII, security/secret boundary e provider boundary.

## ReasonCodes

- `PROVIDER_DESIGN_ONLY`
- `PROVIDER_EXECUTION_NOT_AUTHORIZED`
- `PROVIDER_SECRET_NOT_PROVISIONED`
- `PRODUCTION_WEBHOOK_NOT_ENABLED`
- `PROVIDER_EVENT_VERIFICATION_NOT_ACTIVE`
- `PROVIDER_ROLLBACK_NOT_ACTIVATED`
- `PROVIDER_OBSERVABILITY_NOT_ACTIVE`

## Não-autorização de execução

F2.17 nao autoriza execucao, integracao, configuracao, teste com provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, lead action, acao critica ou side effect.

## Checks executados

- `pnpm check:evidence-index`: passou.
  - `ok: true`
  - `refsChecked: 547`
- `pnpm check:docs-link-integrity`: passou.
  - `ok: true`
  - `filesChecked: 15`
- `git diff --check`: passou sem saida.
- `git diff -- .github/workflows release.yml apps packages scripts`: passou sem saida.

## Prova de isolamento

Escopo documental restrito aos arquivos esperados:

- `docs/ops/whatsapp-provider-integration-design-brief-non-execution-plan.md`
- `ops/evidence/latest/f2-17-provider-integration-design-brief-non-execution-plan-2026-07-15.md`
- `docs/EVIDENCE_INDEX.md`

Nao foram planejadas alteracoes em `.github/workflows`, `release.yml`, `apps`, `packages` ou `scripts`.

O diff de isolamento confirmou ausencia de alteracoes nessas superficies.

## Riscos residuais

- O design brief e hipotetico e nao prova readiness de provider.
- Gaps F2.16 permanecem bloqueadores ate evidencia futura separada.
- Qualquer execucao futura sem decision record deve permanecer bloqueada.

## Próximos passos

- Executar checks obrigatorios.
- Manter provider integration em `blocked`.
- Usar F2.17 apenas como design brief non-execution para revisoes futuras.

## Status final

Status: proposta/parcial evidenciada documentalmente.
