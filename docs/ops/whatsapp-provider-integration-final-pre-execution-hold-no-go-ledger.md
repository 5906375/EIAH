# WhatsApp Provider Integration — Final Pre-Execution Hold / No-Go Ledger

## Objetivo

Este documento cria o Final Pre-Execution Hold e o No-Go Ledger documental para a integracao hipotetica de provider WhatsApp.

F2.22 e um artefato documental. Ele nao autoriza execucao, nao autoriza producao, nao integra provider real, nao provisiona secret produtivo, nao habilita webhook produtivo e nao altera o estado `provider integration blocked` herdado de F2.15-F2.21.

## Final pre-execution hold

O Final Pre-Execution Hold e o bloqueio formal antes de qualquer execucao de provider. Ele consolida que a cadeia documental F2.8-F2.21 existe, mas nao equivale a autorizacao de execucao.

Enquanto o hold estiver ativo:

- qualquer execucao de provider deve ser rejeitada;
- qualquer tentativa de secret produtivo deve ser rejeitada;
- qualquer tentativa de webhook produtivo deve ser rejeitada;
- qualquer mutacao ou acao critica deve ser rejeitada;
- qualquer interpretacao de F2.8-F2.22 como autorizacao produtiva deve ser rejeitada.

## No-Go Ledger

O No-Go Ledger registra os bloqueios ativos e seus reasonCodes. Ele deve ser tratado como ledger documental de decisao negativa, nao como ledger produtivo, transacional ou operacional.

| Bloqueio | Estado | ReasonCode |
| --- | --- | --- |
| Hold final pre-execution ativo | Ativo | `PRE_EXECUTION_HOLD_ACTIVE` |
| No-Go Ledger ativo | Ativo | `NO_GO_LEDGER_ACTIVE` |
| Provider execution | Bloqueado | `PROVIDER_EXECUTION_BLOCKED` |
| Provider approval | Ausente | `PROVIDER_APPROVAL_MISSING` |
| Board execution approval | Ausente | `BOARD_EXECUTION_APPROVAL_MISSING` |
| Security execution approval | Ausente | `SECURITY_EXECUTION_APPROVAL_MISSING` |
| Privacy execution approval | Ausente | `PRIVACY_EXECUTION_APPROVAL_MISSING` |
| Productive secret | Bloqueado | `PRODUCTIVE_SECRET_BLOCKED` |
| Production webhook | Bloqueado | `PRODUCTION_WEBHOOK_BLOCKED` |
| Mutation execution | Bloqueado | `MUTATION_EXECUTION_BLOCKED` |
| Production authorization | Ausente | `FINAL_HOLD_NOT_PRODUCTION_AUTHORIZATION` |

## Estado atual

| Estado | Valor F2.22 | Implicacao |
| --- | --- | --- |
| Read-only chain | `read-only hardened` | A cadeia read-only possui evidencias documentais e gates locais anteriores, mas nao prova provider real. |
| Operational status | `non-operational` | WhatsApp provider nao deve ser declarado operacional. |
| Provider integration | `provider integration blocked` | Integracao real permanece bloqueada. |
| Execution hold | `execution hold active` | Nenhuma execucao, segredo, webhook, mutacao ou acao critica pode iniciar por esta etapa. |

## Motivos de bloqueio

- F2.16 gaps `blocking` permanecem aplicaveis enquanto nao houver evidencia futura especifica.
- Provider real nao foi aprovado para execucao.
- Board review F2.21 nao autorizou execucao nem producao.
- Security approval produtivo nao existe.
- Privacy/Compliance approval produtivo nao existe.
- Secret produtivo permanece bloqueado.
- Webhook produtivo permanece bloqueado.
- Provider event verification real permanece nao ativo.
- Rollback/disable real de provider nao foi provado em etapa autorizada.
- Observability/SLO produtiva de provider nao foi ativada.
- Promotion Decision Record produtivo nao existe.
- Mutacoes, `lead.create`, `lead.discard` e acoes criticas permanecem bloqueadas.

## Prohibited actions

- Integrar provider WhatsApp real.
- Usar, solicitar, armazenar ou provisionar secret produtivo.
- Habilitar webhook produtivo.
- Criar endpoint publico novo.
- Criar dashboard obrigatorio.
- Criar storage externo obrigatorio.
- Criar ledger produtivo obrigatorio.
- Criar mutacoes.
- Criar `lead.create`.
- Criar `lead.discard`.
- Executar acao critica.
- Fazer provider external call.
- Gerar mutation external side effect.
- Registrar PII/sensiveis, telefone bruto, texto bruto, payload bruto, assinatura, token, cookie, Authorization ou secret em logs, metricas, bundles ou evidencias.
- Alterar `ChatAgentLauncher`, runtime, engine, workflows, `release.yml`, apps, packages ou scripts para este escopo.
- Declarar WhatsApp operacional, provider integrado ou F2.22 como autorizacao de integracao.

## Conditions for lifting hold

O hold so pode ser considerado para levantamento em etapa futura separada quando todas as condicoes abaixo estiverem satisfeitas com evidencia fisica e indexavel:

1. Todos os gaps `blocking` de F2.16 fechados ou formalmente mantidos como bloqueadores sem tentativa de execucao.
2. Provider approval explicito, com escopo, owner, risco e decision record proprio.
3. Board execution approval explicito, separado de F2.21, declarando escopo e limites.
4. Security execution approval explicito cobrindo assinatura, replay, idempotencia, secret lifecycle, rate limits, abuse controls e incident response.
5. Privacy/Compliance approval explicito cobrindo data map, masking, retention, redaction e incident response.
6. Secret boundary produtivo aprovado sem valor sensivel em repo, logs, bundles ou evidencias.
7. Production webhook boundary aprovado com assinatura, replay guard, idempotencia, rate limit, disable e rollback.
8. Rollback/disable real de provider documentado, testado em ambiente autorizado e com owners.
9. Observability/SLO produtiva de provider definida com metricas sanitizadas, thresholds e incident mapping.
10. Promotion Decision Record especifico aprovado, limitado ao escopo futuro e sem bypass de HITL/policy para acoes criticas.
11. Checks e evidencias futuras comprovando ausencia de PII/sensiveis, side effects indevidos, mutacoes nao autorizadas e fail-open.

Sem todas as condicoes, o hold permanece ativo.

## Required future approvals

| Approval futuro | Owner minimo | Deve comprovar |
| --- | --- | --- |
| Provider execution approval | Product/Platform owner + Backend/API owner | Provider, escopo, ambiente, limites e decisao humana explicita. |
| Board execution approval | Executive sponsor | Autorizacao futura separada, sem confundir F2.21/F2.22 com producao. |
| Security execution approval | Security owner | Signature, replay, idempotencia, secret lifecycle, abuse controls e incident response. |
| Privacy/Compliance approval | Privacy/Compliance, se aplicavel, + Security owner | Data map, PII masking, retention, redaction e evidencias sanitizadas. |
| Secret boundary approval | Security owner + Platform governance owner | Provisionamento, rotacao, revogacao, segregacao por ambiente e redaction. |
| Webhook production approval | Backend/API owner + Security owner | Webhook, verificacao, idempotencia, rate limit, disable e rollback. |
| Rollback/disable approval | Backend/API owner + Tech lead | Stop criteria, rollback de roteamento, rollback de secret e evidencias pos-mitigacao. |
| Observability/SLO approval | Platform governance owner + DocOps owner | Metricas sanitizadas, thresholds, SLOs e incident mapping. |
| Decision record approval | Product/Platform owner + DocOps owner + Executive sponsor | Registro completo, escopo, owners, riscos e nao-bypass de gates. |

## ReasonCodes

- `PRE_EXECUTION_HOLD_ACTIVE`
- `NO_GO_LEDGER_ACTIVE`
- `PROVIDER_EXECUTION_BLOCKED`
- `PROVIDER_APPROVAL_MISSING`
- `BOARD_EXECUTION_APPROVAL_MISSING`
- `SECURITY_EXECUTION_APPROVAL_MISSING`
- `PRIVACY_EXECUTION_APPROVAL_MISSING`
- `PRODUCTIVE_SECRET_BLOCKED`
- `PRODUCTION_WEBHOOK_BLOCKED`
- `MUTATION_EXECUTION_BLOCKED`
- `FINAL_HOLD_NOT_PRODUCTION_AUTHORIZATION`

## Provider integration boundary

Provider integration permanece `blocked`. Este hold nao cria provider, nao cria webhook, nao provisiona secret, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes e nao executa acao critica.

## Nao-autorizacao de execucao

F2.22 nao autoriza execucao, integracao, configuracao, teste com provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, lead action, acao critica ou side effect.

## Nao-autorizacao produtiva

O No-Go Ledger nao e autorizacao de producao. Ele registra bloqueios ativos e deve impedir interpretacao de F2.22 como autorizacao de integracao, provider, webhook, secret, mutacao ou operacao WhatsApp.

## Status final

Status: proposta/parcial evidenciada documentalmente.
