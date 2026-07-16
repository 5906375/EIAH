# WhatsApp Provider Integration — Board Review Packet / Meeting Agenda

## Objetivo

Este documento cria o Board Review Packet e a Meeting Agenda para uma eventual revisao de board da integracao hipotetica de provider WhatsApp.

F2.21 e um artefato documental. Ele nao autoriza execucao, nao autoriza producao, nao integra provider real, nao provisiona secret produtivo, nao habilita webhook produtivo e nao altera o estado `provider blocked` herdado de F2.15-F2.20.

## Board review packet

O packet organiza os materiais necessarios para que o board avalie apenas se existe base documental para uma proxima revisao governada.

O packet deve carregar sempre estas conclusoes:

- provider integration permanece `blocked`;
- board review nao autoriza producao;
- F2.21 nao autoriza execucao;
- readiness, executive review ou board review nao autorizam provider real;
- provider real, secret produtivo, webhook produtivo, mutacoes e side effects continuam bloqueados.

## Required attendees

| Attendee | Responsabilidade minima | Ausencia gera |
| --- | --- | --- |
| Executive sponsor | Confirmar escopo executivo, decisao permitida e nao-autorizacao produtiva. | `BOARD_REQUIRED_ATTENDEE_MISSING` |
| Security | Revisar threat model, checklist de seguranca, assinatura, replay, secret e incident response. | `BOARD_SECURITY_REVIEW_MISSING` |
| Backend/API | Revisar boundary de webhook, payload validation, binding, entitlement e mutation blocking. | `BOARD_REQUIRED_ATTENDEE_MISSING` |
| Platform governance | Revisar fail-closed, SLOs, reasonCodes, evidence chain e provider boundary. | `BOARD_REQUIRED_ATTENDEE_MISSING` |
| Product/Platform | Revisar escopo, decision framing, next actions e limites de produto. | `BOARD_REQUIRED_ATTENDEE_MISSING` |
| DocOps | Validar evidencias, Evidence Index, pre-read e registro de decisao. | `BOARD_REQUIRED_ATTENDEE_MISSING` |
| Privacy/Compliance, se aplicavel | Revisar privacy posture, PII handling, retention, data map e compliance residual. | `BOARD_PRIVACY_REVIEW_MISSING` quando aplicavel |

Sem os attendees obrigatorios, a reuniao deve ser classificada como incompleta e nao pode produzir `approve-for-next-review-only`.

## Decision scope

O board pode decidir apenas entre:

- `no-go`;
- `defer`;
- `approve-for-next-review-only`.

O board nao pode autorizar:

- execucao de integracao;
- producao;
- provider WhatsApp real;
- secret produtivo;
- webhook produtivo;
- endpoint publico novo;
- mutacoes;
- `lead.create`;
- `lead.discard`;
- acao critica;
- side effects.

## Pre-read materials

| Material | Caminho | Objetivo |
| --- | --- | --- |
| Evidence Pack / Executive Review Dossier | `docs/ops/whatsapp-provider-integration-evidence-pack-executive-review-dossier.md` | Consolidar F2.8-F2.19, posturas, gaps, approvals e decision framing. |
| Security Review Checklist / Approval Gate | `docs/ops/whatsapp-provider-integration-security-review-checklist-approval-gate.md` | Revisar checklist, reviewers, estados e approval gate documental. |
| Threat Model / Abuse Case Register | `docs/ops/whatsapp-provider-integration-threat-model-abuse-case-register.md` | Revisar assets, trust boundaries, actors, attack surfaces e fail-closed responses. |
| Design Brief / Non-Execution Plan | `docs/ops/whatsapp-provider-integration-design-brief-non-execution-plan.md` | Revisar arquitetura hipotetica e limites de nao-execucao. |
| Pre-Provider Gap Register | `docs/ops/whatsapp-read-only-adapter-pre-provider-gap-register.md` | Revisar gaps `blocking`, `required`, `advisory` e entry criteria. |
| Evidencia F2.20 | `ops/evidence/latest/f2-20-provider-integration-evidence-pack-executive-review-dossier-2026-07-15.md` | Confirmar a consolidacao executiva e checks documentais. |

## Evidence checklist

Antes da reuniao, DocOps deve confirmar:

- todos os pre-read materials existem fisicamente;
- `docs/EVIDENCE_INDEX.md` aponta para a evidencia F2.20 e para a nova evidencia F2.21 depois da tarefa;
- F2.8-F2.20 continuam referenciadas sem drift;
- F2.16 gaps `blocking` estao explicitamente abertos ou fechados com evidencia;
- F2.19 security review permanece nao produtivo;
- F2.20 executive review permanece nao produtivo;
- provider integration permanece `blocked`;
- nao ha PII/sensiveis, secret produtivo, payload bruto, telefone bruto, texto bruto, assinatura, token, cookie ou Authorization nos artefatos;
- `sideEffects=0`, `providerExternalCall=0`, `mutationExternalSideEffect=0` e `criticalActionExecution=0` permanecem requisitos absolutos.

## Meeting agenda

| Ordem | Topico | Owner sugerido | Saida esperada |
| --- | --- | --- | --- |
| 1 | context | Executive sponsor + Product/Platform | Confirmar escopo de board review documental e nao-autorizacao produtiva. |
| 2 | evidence review | DocOps | Confirmar pre-read, evidencias F2.8-F2.20 e Evidence Index. |
| 3 | open gaps | Product/Platform + Platform governance | Revisar gaps F2.16 e classificar bloqueios ativos. |
| 4 | risk posture | Executive sponsor + Platform governance | Confirmar risco `partial/proposal`, gaps ativos e producao fora de escopo. |
| 5 | security posture | Security | Revisar F2.18/F2.19 e blockers de assinatura, replay, secret e approval. |
| 6 | privacy posture | Privacy/Compliance, se aplicavel, + Security | Confirmar requisitos de PII, data map, masking, retention e redaction. |
| 7 | operational posture | Backend/API + Platform governance | Confirmar `read-only hardened`, `non-operational` e `provider blocked`. |
| 8 | provider boundary | Backend/API + Security | Confirmar bloqueio de provider real, secret produtivo, webhook produtivo e mutacoes. |
| 9 | decision framing | Executive sponsor | Selecionar `no-go`, `defer` ou `approve-for-next-review-only`. |
| 10 | next actions | Product/Platform + DocOps | Registrar owners, pendencias, evidencia minima e proxima revisao, se houver. |

## Open gaps

O board deve assumir como abertos, salvo evidencia futura explicita:

- provider real nao selecionado nem autorizado;
- secret boundary produtivo nao aprovado/provisionado;
- webhook produtivo nao aprovado/habilitado;
- rollback/disable real de provider nao provado;
- observability/SLO produtiva de provider nao ativa;
- privacy/PII review de provider real nao concluido;
- security review nao produtivo;
- Promotion Decision Record produtivo ausente;
- gaps F2.16 `blocking` ainda aplicaveis.

## Decision options

| Decision option | Condicao | Efeito permitido |
| --- | --- | --- |
| `no-go` | Qualquer pedido de producao, provider real, secret produtivo, webhook produtivo, mutacao, side effect, attendee obrigatorio ausente, evidence pack incompleto ou gap blocking aberto sem tratamento. | Nenhum. Mantem provider integration `blocked`. |
| `defer` | Evidencia incompleta, review pendente, Privacy/Compliance aplicavel ausente, risco sem owner ou pre-read insuficiente. | Nenhum. Registrar pendencias, owners e data de nova revisao. |
| `approve-for-next-review-only` | Board entende que o packet esta suficiente para preparar uma proxima revisao documental em escopo separado. | Permite apenas proxima revisao governada; nao autoriza execucao nem producao. |

## Non-decision items

Os itens abaixo estao fora da decisao do board F2.21:

- habilitar producao;
- integrar provider WhatsApp real;
- escolher ou contratar provider;
- provisionar secret produtivo;
- habilitar webhook produtivo;
- criar endpoint publico novo;
- criar dashboard obrigatorio;
- criar storage externo obrigatorio;
- criar ledger produtivo obrigatorio;
- criar mutacoes, `lead.create` ou `lead.discard`;
- executar acao critica;
- alterar `ChatAgentLauncher`, runtime, engine, workflows, `release.yml`, apps, packages ou scripts.

## ReasonCodes

- `BOARD_REVIEW_REQUIRED`
- `BOARD_REVIEW_PACKET_ONLY`
- `BOARD_EVIDENCE_PACK_INCOMPLETE`
- `BOARD_REQUIRED_ATTENDEE_MISSING`
- `BOARD_SECURITY_REVIEW_MISSING`
- `BOARD_PRIVACY_REVIEW_MISSING`
- `BOARD_OPEN_GAPS_REMAIN`
- `BOARD_DECISION_NOT_PRODUCTION_AUTHORIZATION`
- `PROVIDER_INTEGRATION_STILL_BLOCKED`

## Provider integration boundary

Provider integration permanece `blocked`. Este packet nao cria provider, nao cria webhook, nao provisiona secret, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes e nao executa acao critica.

## Nao-autorizacao de execucao

F2.21 nao autoriza execucao, integracao, configuracao, teste com provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, lead action, acao critica ou side effect.

## Nao-autorizacao produtiva

Board review nao e autorizacao de producao. Mesmo uma decisao `approve-for-next-review-only` permite apenas uma proxima revisao documental, em etapa separada, com novo escopo e nova evidencia.

## Status final

Status: proposta/parcial evidenciada documentalmente.
