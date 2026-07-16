# WhatsApp Read-Only Adapter — Pre-Provider Gap Register / Provider Integration Entry Criteria

## Objetivo

Este documento registra os gaps pre-provider e os criterios minimos de entrada para qualquer avaliacao futura de integracao de provider do WhatsApp Adapter.

F2.16 nao autoriza provider real, nao autoriza secret produtivo, nao autoriza webhook produtivo, nao autoriza mutacoes e nao altera o status `provider blocked` declarado em F2.15.

## Escopo

- Superficie atual: WhatsApp Adapter read-only.
- Estado atual herdado de F2.15: `read-only hardened`, `non-operational`, `provider blocked`.
- Uso permitido deste documento: registrar gaps, criterios de entrada e evidencias minimas para uma proposta futura separada.
- Uso proibido deste documento: tratar os criterios como aprovacao de integracao, producao ou operacao WhatsApp.

## Classificacao dos gaps

| Classificacao | Significado | Efeito |
| --- | --- | --- |
| `blocking` | Gap que impede qualquer avaliacao de provider enquanto aberto. | Mantem provider integration em `blocked`. |
| `required` | Gap que precisa estar resolvido antes de uma revisao formal, mas pode ser detalhado durante preparacao documental. | Impede `ready-for-review` se nao houver evidencia minima. |
| `advisory` | Gap recomendado para qualidade operacional, sem autorizar bypass dos gates obrigatorios. | Deve ser registrado como risco residual se permanecer aberto. |

## Gap register

| Gap ID | Classificacao | Gap | Evidencia minima | Owner minimo | ReasonCode |
| --- | --- | --- | --- | --- | --- |
| `WA-PROV-GAP-001` | `blocking` | Provider real nao autorizado nem selecionado em decisao governada. | Proposta futura separada com provider, escopo, riscos, limites e decisao humana explicita. | Product/Platform owner + Backend/API owner | `PROVIDER_ENTRY_CRITERIA_NOT_MET` |
| `WA-PROV-GAP-002` | `blocking` | Boundary de secret produtivo nao definido. | Plano de secret management sem valor sensivel em repo/log/evidencia, ownership de rotacao e rollback. | Security owner + Platform governance owner | `PROVIDER_SECRET_BOUNDARY_MISSING` |
| `WA-PROV-GAP-003` | `blocking` | Webhook produtivo nao autorizado. | Plano de webhook com assinatura, replay, idempotencia, disable e rollback, sem ativacao neste escopo. | Backend/API owner + Security owner | `PROVIDER_ENTRY_CRITERIA_NOT_MET` |
| `WA-PROV-GAP-004` | `blocking` | Rollback/disable para provider real nao provado. | Runbook atualizado com disable imediato, rollback de roteamento, rollback de secret e criterios de stop. | Backend/API owner + Tech lead | `PROVIDER_ROLLBACK_MISSING` |
| `WA-PROV-GAP-005` | `blocking` | Observability/SLO produtiva de provider nao definida. | Baseline de metricas de provider, SLOs, thresholds, alertas, fail-closed e prova de campos sanitizados. | Platform governance owner + DocOps owner | `PROVIDER_OBSERVABILITY_MISSING` |
| `WA-PROV-GAP-006` | `blocking` | Privacy/PII review de provider ausente. | Revisao de PII com data map, campos proibidos, masking, retention, logging e incident response. | Security owner + Product/Platform owner | `PROVIDER_PRIVACY_REVIEW_MISSING` |
| `WA-PROV-GAP-007` | `blocking` | Security review de provider ausente. | Revisao de assinatura, replay, idempotencia, auth, rate limit, secret rotation e abuse controls. | Security owner + Backend/API owner | `PROVIDER_SECURITY_REVIEW_MISSING` |
| `WA-PROV-GAP-008` | `blocking` | Promotion Decision Record de provider ausente. | Registro futuro baseado em F2.14, completo, aprovado por owners e limitado a escopo explicito. | Product/Platform owner + Founder/Executive owner | `PROVIDER_DECISION_RECORD_MISSING` |
| `WA-PROV-GAP-009` | `required` | Owners e escalation de janela de integracao nao designados. | Lista nominal de owners, responsabilidades, escalations e janela de suporte. | Product/Platform owner | `PROVIDER_OWNER_MISSING` |
| `WA-PROV-GAP-010` | `required` | Contract compatibility para payload real nao provada. | Contrato versionado, fixtures sanitizadas, compatibility gate e politica de breaking change. | Backend/API owner + Platform governance owner | `PRE_PROVIDER_GAP_OPEN` |
| `WA-PROV-GAP-011` | `required` | Synthetic provider dry-run futuro nao definido. | Dry run sem side effects, fixtures sanitizadas e comprovacao de `providerExternalCall` controlado somente em ambiente autorizado. | Backend/API owner | `PRE_PROVIDER_GAP_OPEN` |
| `WA-PROV-GAP-012` | `required` | Fail-closed de erros reais do provider nao mapeado. | Matriz de erros, timeout, assinatura invalida, replay, duplicidade, payload invalido e degradacao. | Backend/API owner + Platform governance owner | `PROVIDER_ENTRY_CRITERIA_NOT_MET` |
| `WA-PROV-GAP-013` | `advisory` | Dashboard operacional futuro nao definido. | Opcional: proposta de dashboard usando somente metricas sanitizadas e sem dependencia obrigatoria. | DocOps owner + Platform governance owner | `PRE_PROVIDER_GAP_OPEN` |
| `WA-PROV-GAP-014` | `advisory` | Playbook de comunicacao de incidente nao detalhado. | Opcional: matriz de comunicacao interna por severidade e owner. | Product/Platform owner | `PRE_PROVIDER_GAP_OPEN` |

## Provider Integration Entry Criteria

Qualquer proposta futura para iniciar avaliacao de provider deve cumprir todos os criterios abaixo antes de sair de `blocked`:

1. Todos os gaps `blocking` estao fechados com evidencia fisica e indexavel.
2. Gaps `required` estao fechados ou possuem plano aprovado por owners com risco residual explicito.
3. Owners minimos estao designados para Product/Platform, Backend/API, Security, Platform governance e DocOps.
4. Rollback/disable de provider real esta documentado e validado sem executar provider neste escopo.
5. Observability/SLO de provider esta definido com metricas sanitizadas, thresholds e incident mapping.
6. Privacy/PII review esta completo e prova ausencia de PII/sensiveis em evidencia, log e metrica.
7. Security/secret boundary esta completo e prova que secrets produtivos nao entram em repo, evidencia ou logs.
8. Promotion Decision Record futuro esta completo, com aprovacao humana e escopo explicitamente nao produtivo ate decisao separada.
9. F2.8-F2.15 permanecem referenciadas e sem drift.
10. `sideEffects=0`, `mutationExternalSideEffect=0` e `criticalActionExecution=0` permanecem requisitos ate etapa produtiva separada.

## Evidencia minima por gap

Cada gap fechado deve anexar:

- identificador do gap;
- classificacao;
- owner responsavel;
- evidencia fisica em `ops/evidence/latest` ou documento operacional versionado;
- data UTC;
- decisao humana quando aplicavel;
- reasonCode removido ou mantido;
- risco residual;
- confirmacao de que provider real, secret produtivo, webhook produtivo, mutacoes e side effects nao foram ativados por esta etapa.

## Owners/escalation requirements

Owners minimos para uma avaliacao futura:

| Area | Owner minimo | Escalation |
| --- | --- | --- |
| Product/Platform | Product/Platform owner | Founder/Executive owner |
| Adapter/API | Backend/API owner | Tech lead |
| Security/secret boundary | Security owner | Founder/Executive owner |
| Platform governance | Platform governance owner | Tech lead |
| Evidence/DocOps | DocOps owner | Platform governance owner |

Sem owner minimo designado, a avaliacao permanece `blocked` com `reasonCode=PROVIDER_OWNER_MISSING`.

## Rollback/disable requirements

Uma proposta futura deve definir, antes de qualquer integracao:

- disable imediato para provider, webhook e roteamento externo;
- rollback de secret e rotacao/revogacao;
- rollback de contrato se houver drift;
- plano de stop para PII, side effects, mutacao, fail-open, replay aceito ou provider indisponivel;
- owner acionado por severidade;
- evidencia minima pos-mitigacao.

Ausencia desses itens mantem `reasonCode=PROVIDER_ROLLBACK_MISSING`.

## Observability/SLO requirements

Uma proposta futura deve preservar os SLOs read-only e adicionar, sem ativar provider neste escopo:

- metricas de disponibilidade e erro do provider;
- metricas de assinatura, replay e duplicidade;
- metricas de rate limit e timeout;
- metricas de fail-closed por reasonCode;
- `provider external call` com regra de ambiente autorizado;
- `sideEffects violation = 0`;
- `PII leakage = 0`;
- `critical action execution = 0`;
- `mutation external side effect = 0`;
- thresholds e incident classes conectados ao runbook.

Ausencia desses itens mantem `reasonCode=PROVIDER_OBSERVABILITY_MISSING`.

## Privacy/PII requirements

Uma proposta futura deve provar:

- data map de campos recebidos do provider;
- lista de campos proibidos em logs, metricas, bundles e evidencias;
- masking antes de serializacao;
- ausencia de telefone bruto, texto bruto, payload bruto, assinatura, token, cookie ou Authorization em evidencia;
- retention e descarte;
- owner de privacy review;
- classificacao de incidente para PII leakage.

Ausencia desses itens mantem `reasonCode=PROVIDER_PRIVACY_REVIEW_MISSING`.

## Security/secret boundary requirements

Uma proposta futura deve provar:

- secrets produtivos fora do repositorio e de evidencias;
- mecanismo de provisionamento, rotacao e revogacao;
- segregacao por ambiente;
- assinatura de webhook;
- replay protection;
- idempotencia;
- rate limit ou abuse controls;
- ownership de incident response.

Ausencia desses itens mantem `reasonCode=PROVIDER_SECURITY_REVIEW_MISSING` ou `PROVIDER_SECRET_BOUNDARY_MISSING`.

## Decision record requirements

Qualquer tentativa futura de provider deve ter Promotion Decision Record especifico, com:

- referencia a F2.8-F2.16;
- gaps fechados ou riscos aceitos;
- owners e human approval;
- rollback/disable;
- observability/SLO;
- privacy/PII review;
- security/secret boundary;
- provider boundary status;
- decisao final limitada ao escopo aprovado.

Ausencia desse registro mantem `reasonCode=PROVIDER_DECISION_RECORD_MISSING`.

## ReasonCodes

- `PROVIDER_ENTRY_CRITERIA_NOT_MET`
- `PRE_PROVIDER_GAP_OPEN`
- `PROVIDER_OWNER_MISSING`
- `PROVIDER_ROLLBACK_MISSING`
- `PROVIDER_SECRET_BOUNDARY_MISSING`
- `PROVIDER_OBSERVABILITY_MISSING`
- `PROVIDER_PRIVACY_REVIEW_MISSING`
- `PROVIDER_SECURITY_REVIEW_MISSING`
- `PROVIDER_DECISION_RECORD_MISSING`

## Provider integration boundary

Provider integration permanece `blocked`. Este documento apenas define gaps e criterios de entrada para uma avaliacao futura separada.

F2.16 nao cria provider, nao cria webhook, nao provisiona secret, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes e nao executa acao critica.

## Nao-autorizacao de provider

F2.16 nao autoriza provider real, nao autoriza operacao WhatsApp, nao autoriza secret produtivo, nao autoriza webhook produtivo, nao autoriza mutacoes, nao autoriza `lead.create`, nao autoriza `lead.discard` e nao autoriza side effects.

## Status final

Status: proposta/parcial evidenciada documentalmente.
