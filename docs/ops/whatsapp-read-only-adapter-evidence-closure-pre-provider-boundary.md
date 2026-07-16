# WhatsApp Read-Only Adapter — Evidence Closure / Pre-Provider Boundary

## Objetivo

Este documento fecha a cadeia documental F2.8-F2.14 do WhatsApp Adapter em modo read-only e declara explicitamente o limite pre-provider.

A closure consolida evidencias, gates, bloqueios e proximos passos permitidos antes de qualquer avaliacao futura envolvendo provider real. Ela nao autoriza producao, nao autoriza provider real e nao altera o status operacional do WhatsApp Adapter.

## Status correto

| Status | Declaracao | Implicacao |
| --- | --- | --- |
| `read-only hardened` | A cadeia F2.8-F2.14 endurece contrato, runbook, observabilidade, healthcheck sintetico, contract gate, readiness e template de decisao para avaliacao documental read-only. | O adapter tem fronteiras e evidencias documentadas para operacao read-only simulada/avaliativa. |
| `non-operational` | Nao ha provider WhatsApp real integrado, secret produtivo, webhook produtivo ou execucao critica autorizada. | O adapter nao deve ser declarado operacional. |
| `provider blocked` | O limite pre-provider esta ativo e bloqueia integracao real, secrets produtivos, webhooks produtivos e mutacoes. | Qualquer promocao que tente cruzar essa fronteira deve ser classificada como bloqueada. |

## Evidence closure F2.8-F2.14

| Marco | Evidencia | Fechamento documental |
| --- | --- | --- |
| F2.8 | `ops/evidence/latest/f2-08-read-only-adapter-contract-freeze-compatibility-gate-2026-07-15.md` | Contrato read-only congelado, compatibility gate definido e mutacoes bloqueadas. |
| F2.9 | `ops/evidence/latest/f2-09-read-only-adapter-operational-runbook-rollback-policy-2026-07-15.md` | Runbook operacional, rollback/disable policy, incident classes, owners e fail-closed documentados. |
| F2.10 | `ops/evidence/latest/f2-10-read-only-adapter-observability-metrics-slo-baseline-2026-07-15.md` | Baseline de metricas, SLOs iniciais, thresholds e politica sideEffects=0 documentados. |
| F2.11 | `ops/evidence/latest/f2-11-read-only-adapter-synthetic-healthcheck-non-provider-dry-run-2026-07-15.md` | Healthcheck sintetico non-provider com paths accepted/fail-closed e ausencia de PII/sensiveis documentados. |
| F2.12 | `ops/evidence/latest/f2-12-read-only-adapter-synthetic-healthcheck-contract-gate-2026-07-15.md` | Contract gate do healthcheck sintetico, compatibilidade e bloqueios de drift documentados. |
| F2.13 | `ops/evidence/latest/f2-13-read-only-adapter-promotion-readiness-matrix-2026-07-15.md` | Promotion readiness matrix com estados `blocked`, `candidate` e `ready-for-review` documentada. |
| F2.14 | `ops/evidence/latest/f2-14-read-only-adapter-promotion-decision-record-template-2026-07-15.md` | Template de Promotion Decision Record para futura avaliacao, sem autorizacao produtiva. |

## Pre-provider boundary

O limite pre-provider permanece ativo ate existir aprovacao futura, explicita e separada para escopo produtivo. Enquanto esse limite estiver ativo:

- provider WhatsApp real permanece bloqueado;
- secret produtivo permanece bloqueado;
- webhook produtivo permanece bloqueado;
- mutacoes e acoes criticas permanecem bloqueadas;
- qualquer execucao deve preservar `sideEffects=0`, `providerExternalCall=0`, `mutationExternalSideEffect=0` e `criticalActionExecution=0`;
- readiness, decision record ou evidence closure nao podem ser interpretados como autorizacao de producao.

## Gates obrigatorios preservados

- F2.8 contract freeze e compatibility gate preservados.
- F2.9 runbook, rollback/disable policy, incident classes, owners e escalation preservados.
- F2.10 observability metrics, SLO baseline e thresholds preservados.
- F2.11 synthetic healthcheck non-provider preservado.
- F2.12 synthetic healthcheck contract gate preservado.
- F2.13 readiness matrix preservada para classificacao documental.
- F2.14 promotion decision record template preservado para futura revisao.
- Evidence Index deve apontar para todas as evidencias fisicas F2.8-F2.15.
- Checks documentais obrigatorios devem permanecer verdes antes de qualquer nova etapa.

## Bloqueios absolutos

- Integrar provider WhatsApp real.
- Usar secret produtivo.
- Habilitar webhook produtivo.
- Criar endpoint publico novo.
- Criar dashboard obrigatorio.
- Criar storage externo obrigatorio.
- Criar ledger produtivo obrigatorio.
- Criar mutacoes.
- Criar `lead.create`.
- Criar `lead.discard`.
- Executar acao critica.
- Alterar `ChatAgentLauncher`, runtime ou engine para este escopo.
- Alterar workflows, `release.yml`, `apps`, `packages` ou `scripts` para este escopo.
- Permitir PII/sensiveis em evidencia, log, bundle ou resultado serializado.
- Permitir `sideEffects != 0`, `providerExternalCall > 0`, `mutationExternalSideEffect > 0` ou `criticalActionExecution > 0`.
- Tratar esta closure como autorizacao produtiva.

## ReasonCodes de bloqueio

- `PRE_PROVIDER_BOUNDARY_ACTIVE`
- `PROVIDER_INTEGRATION_NOT_AUTHORIZED`
- `PRODUCTION_WEBHOOK_NOT_AUTHORIZED`
- `PRODUCTIVE_SECRET_NOT_AUTHORIZED`
- `MUTATION_NOT_AUTHORIZED`
- `CRITICAL_ACTION_NOT_AUTHORIZED`
- `EVIDENCE_CLOSURE_NOT_PRODUCTION_APPROVAL`

## DoD da cadeia read-only

A cadeia read-only F2.8-F2.15 e considerada documentalmente fechada quando todos os criterios abaixo estiverem verdadeiros:

- evidencias F2.8-F2.15 existem fisicamente em `ops/evidence/latest`;
- `docs/EVIDENCE_INDEX.md` referencia as evidencias fisicas;
- contrato read-only permanece congelado e compativel;
- runbook, rollback/disable, owners e escalation permanecem definidos;
- metricas, SLOs e thresholds read-only permanecem definidos;
- healthcheck sintetico non-provider e contract gate permanecem documentados;
- readiness matrix e decision record template permanecem sem autorizacao produtiva;
- provider real, secret produtivo, webhook produtivo e mutacoes permanecem bloqueados;
- PII/sensiveis permanecem ausentes dos artefatos documentais;
- `sideEffects=0`, `providerExternalCall=0`, `mutationExternalSideEffect=0` e `criticalActionExecution=0` permanecem requisitos absolutos;
- checks obrigatorios passam localmente.

## Proximos passos permitidos

- Manter e revisar evidencias documentais F2.8-F2.15.
- Reexecutar checks documentais antes de qualquer revisao futura.
- Atualizar documentacao se houver drift documental, mantendo o limite pre-provider.
- Revalidar healthcheck sintetico e contract gate se houver mudanca de contrato read-only.
- Abrir proposta futura separada para qualquer avaliacao de provider, sem executar integracao neste escopo.

## Proximos passos proibidos

- Declarar WhatsApp operacional.
- Declarar provider integrado.
- Declarar closure como autorizacao de producao.
- Integrar provider WhatsApp real.
- Usar ou solicitar secret produtivo.
- Habilitar webhook produtivo.
- Criar endpoint publico novo.
- Criar storage externo, dashboard ou ledger produtivo obrigatorio.
- Criar mutacoes, `lead.create`, `lead.discard` ou acao critica.
- Alterar `ChatAgentLauncher`, runtime, engine, workflows ou `release.yml` para esta closure.

## Provider/mutation boundary

A fronteira provider/mutation e fechada por padrao. Nenhum artefato F2.15 cria caminho para chamada externa de provider, mutacao produtiva, side effect externo, endpoint publico ou webhook produtivo.

Qualquer tentativa futura de cruzar essa fronteira deve abrir escopo novo, declarar risco, anexar evidencias F2.8-F2.15 e ser classificada como bloqueada ate aprovacao humana explicita.

## Nao-autorizacao produtiva

Esta closure e apenas proposta/parcial evidenciada documentalmente. Ela nao autoriza producao, nao autoriza provider real, nao autoriza secret produtivo, nao autoriza webhook produtivo, nao autoriza mutacoes e nao altera o status para operacional.

## Status final

Status: proposta/parcial evidenciada documentalmente.
