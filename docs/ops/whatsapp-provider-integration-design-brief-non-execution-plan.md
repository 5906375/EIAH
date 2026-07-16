# WhatsApp Provider Integration — Design Brief / Non-Execution Plan

## Objetivo

Este documento descreve uma arquitetura futura hipotetica para integracao de provider WhatsApp e registra um plano de nao-execucao.

F2.17 e design-only. Nao autoriza execucao, nao integra provider real, nao provisiona secret produtivo, nao habilita webhook produtivo e nao altera o estado `provider blocked` herdado de F2.15/F2.16.

## Design brief

A integracao futura, se algum dia for autorizada por etapa separada, deve preservar a cadeia read-only ja evidenciada e acrescentar uma camada provider-governed sem bypass de contrato, runbook, observabilidade, privacy, security e decision record.

Arquitetura hipotetica:

1. Provider WhatsApp real envia evento para webhook produtivo autorizado em etapa futura.
2. Webhook aplica verificacao de assinatura, timestamp, replay, duplicidade, tamanho e schema antes de qualquer roteamento interno.
3. Evento validado e convertido para envelope governado e sanitizado.
4. Channel binding resolve tenant, workspace, scope e entitlement em modo fail-closed.
5. Adapter preserva contrato versionado e export auditavel sem PII/sensiveis.
6. Qualquer mutacao ou acao critica exige etapa separada com HITL, policy, receipt/ledger quando aplicavel e decision record proprio.

Esta arquitetura e hipotetica e nao deve ser executada por F2.17.

## Non-execution plan

Enquanto F2.17 estiver vigente:

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

Provider WhatsApp real permanece fora do escopo. Nenhum provider SDK, credencial, endpoint, chamada externa ou roteamento externo e criado por este documento.

## Secret boundary

Secret produtivo permanece nao provisionado. Este documento nao define valor, nome de secret, secret store real, variavel de ambiente produtiva ou mecanismo de injecao de secret.

Uma etapa futura deve provar secret management, rotacao, revogacao, segregacao por ambiente e ausencia de secret em repo, logs, bundles e evidencias.

## Production webhook boundary

Webhook produtivo permanece desabilitado. F2.17 nao cria endpoint publico novo, nao altera roteamento externo e nao ativa webhook de provider.

Qualquer webhook futuro exige decisao separada, assinatura, replay protection, idempotencia, rate limit, disable imediato e rollback.

## Event verification boundary

Event verification real de provider permanece nao ativa. O design futuro deve exigir:

- assinatura valida;
- timestamp dentro da janela;
- replay guard;
- idempotencia por `eventId`;
- schema e tamanho validos;
- provider allowlist;
- fail-closed para qualquer divergencia.

F2.17 nao implementa nem ativa essa verificacao.

## Rollback/disable boundary

Rollback/disable real de provider permanece nao ativado. O design futuro deve prever:

- disable de provider e webhook;
- rollback de roteamento externo;
- revogacao/rotacao de secret;
- rollback contratual quando houver drift;
- stop criteria para PII, side effects, mutacao, fail-open, replay aceito ou indisponibilidade de provider.

## Observability/SLO boundary

Observability produtiva de provider permanece nao ativa. O design futuro deve estender F2.10 com metricas sanitizadas de provider, assinatura, replay, duplicidade, timeout, rate limit, fail-closed e incident mapping.

SLOs zero continuam obrigatorios ate decisao separada:

- `sideEffects violation = 0`;
- `PII leakage = 0`;
- `critical action execution = 0`;
- `mutation external side effect = 0`.

## Privacy/PII boundary

Privacy/PII review permanece prerequisito. O design futuro deve provar data map do provider, masking antes de serializacao, retention/descarte e ausencia de telefone bruto, texto bruto, payload bruto, assinatura, token, cookie ou Authorization em logs, metricas, bundles e evidencias.

## Security review boundary

Security review permanece prerequisito. O design futuro deve cobrir assinatura, replay protection, idempotencia, rate limit, abuse controls, secret lifecycle, segregacao por ambiente e incident response.

## Decision record prerequisite

Qualquer tentativa futura de execucao exige Promotion Decision Record especifico, referenciando F2.8-F2.17, F2.16 gap closure, owners, human approval, rollback/disable, observability/SLO, privacy/PII, security/secret boundary e provider boundary.

Sem decision record aprovado, provider integration permanece `blocked`.

## ReasonCodes

- `PROVIDER_DESIGN_ONLY`
- `PROVIDER_EXECUTION_NOT_AUTHORIZED`
- `PROVIDER_SECRET_NOT_PROVISIONED`
- `PRODUCTION_WEBHOOK_NOT_ENABLED`
- `PROVIDER_EVENT_VERIFICATION_NOT_ACTIVE`
- `PROVIDER_ROLLBACK_NOT_ACTIVATED`
- `PROVIDER_OBSERVABILITY_NOT_ACTIVE`

## Nao-autorizacao de execucao

F2.17 nao autoriza execucao, integracao, configuracao, teste com provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, lead action, acao critica ou side effect.

## Status final

Status: proposta/parcial evidenciada documentalmente.
