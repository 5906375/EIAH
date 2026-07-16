# WhatsApp Provider Integration — Phase Transition Proposal / Board Decision Stub

## Objetivo

Este documento cria a Phase Transition Proposal e o Board Decision Stub para uma eventual avaliacao futura de abertura de proxima fase da integracao hipotetica de provider WhatsApp.

F2.24 e um artefato documental. Ele nao autoriza execucao, nao autoriza producao, nao integra provider real, nao provisiona secret produtivo, nao habilita webhook produtivo e nao altera o estado `provider integration blocked` herdado de F2.15-F2.23.

## Phase Transition Proposal

A proposta de transicao de fase serve apenas para preparar uma eventual decisao futura sobre abrir uma nova fase formal. Ela nao levanta o freeze F2.23 e nao altera o No-Go Ledger F2.22.

Qualquer proposta de transicao deve declarar:

- a fase proposta e seu objetivo;
- a baseline F2.8-F2.23 referenciada e indexada;
- o motivo para solicitar nova fase formal;
- os approvals requeridos;
- as evidencias requeridas;
- os riscos residuais;
- os blocked execution actions preservados;
- a confirmacao de que provider integration permanece `blocked` ate aprovacao futura separada.

## Board Decision Stub

O Board Decision Stub e um modelo documental para registrar uma decisao futura do board sobre a abertura de uma nova fase formal.

O stub nao e uma decisao real, nao substitui ata, approval record ou decision record futuro, e nao autoriza producao. Ele apenas padroniza os campos minimos para uma decisao futura.

Campos minimos do stub:

| Campo | Obrigatorio | Regra |
| --- | --- | --- |
| `decisionId` | Sim | Identificador unico da decisao futura. |
| `date` | Sim | Data da avaliacao. |
| `requestedNextPhase` | Sim | Nome da fase proposta. |
| `requester` | Sim | Responsavel pela proposta. |
| `approvers` | Sim | Lista de approvals requeridos e status. |
| `decisionState` | Sim | Um de `no-go`, `defer`, `approve-to-open-next-phase-only`. |
| `evidenceRefs` | Sim | Referencias F2.8-F2.23 e evidencias adicionais futuras. |
| `freezeStatus` | Sim | Deve declarar `F2.23 freeze remains active` ate nova decisao formal. |
| `providerBoundaryStatus` | Sim | Deve declarar `provider integration blocked`. |
| `executionAuthorization` | Sim | Deve declarar `not authorized`. |
| `productionAuthorization` | Sim | Deve declarar `not authorized`. |
| `reasonCodes` | Sim | ReasonCodes aplicaveis. |
| `nextActions` | Sim | Acoes documentais permitidas, sem execucao. |

## Decision states

| Estado | Significado | Efeito permitido |
| --- | --- | --- |
| `no-go` | A proposta nao pode avancar para nova fase. | Nenhum. Mantem freeze ativo e provider integration `blocked`. |
| `defer` | A decisao e adiada por evidencia, approval, risco ou escopo insuficiente. | Nenhum. Registrar pendencias e owners. |
| `approve-to-open-next-phase-only` | O board permite abrir uma nova fase formal, separada e nao-executiva por padrao. | Permite apenas criar a proxima fase governada; nao autoriza execucao, producao, provider real, secret produtivo, webhook produtivo, mutacoes ou side effects. |

## Required approvals

- Board/executive sponsor.
- Security.
- Privacy/Compliance, se aplicavel.
- Platform governance.
- Backend/API.
- Product/Platform.
- DocOps.

Sem todos os approvals requeridos, o estado deve ser `no-go` ou `defer`.

## Required evidence

Qualquer decisao futura deve anexar:

- F2.8-F2.23 indexadas em `docs/EVIDENCE_INDEX.md`;
- CI pos-merge verde da fase imediatamente anterior;
- No-Go Ledger ativo;
- Final Readiness Freeze ativo;
- Security Review Gate;
- Executive Dossier;
- Board Packet;
- evidencia futura especifica da fase proposta, quando existir;
- prova de ausencia de provider real, secret produtivo, webhook produtivo, mutacoes e side effects nesta etapa.

## Conditions to open next phase

Uma proxima fase formal so pode ser aberta quando:

1. F2.8-F2.23 estiverem indexadas e sem drift documental conhecido.
2. F2.23 freeze permanecer ativo durante a avaliacao.
3. F2.22 No-Go Ledger permanecer ativo durante a avaliacao.
4. Required approvals estiverem presentes ou a decisao for `defer`/`no-go`.
5. Required evidence estiver completa.
6. Escopo da proxima fase estiver separado de execucao produtiva.
7. Blocked execution actions permanecerem bloqueadas.
8. O board decision stub declarar que nao autoriza execucao nem producao.
9. Os checks documentais obrigatorios estiverem verdes.
10. Houver prova de isolamento das superficies proibidas.

## Blocked execution actions

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
- Permitir `sideEffects != 0`.
- Registrar PII/sensiveis, telefone bruto, texto bruto, payload bruto, assinatura, token, cookie, Authorization ou secret em logs, metricas, bundles ou evidencias.
- Alterar `ChatAgentLauncher`, runtime, engine, workflows, `release.yml`, apps, packages ou scripts para executar provider.
- Declarar WhatsApp operacional, provider integrado ou F2.24 como autorizacao de integracao.

## ReasonCodes

- `PHASE_TRANSITION_PROPOSAL_ONLY`
- `BOARD_DECISION_STUB_ONLY`
- `PHASE_TRANSITION_NOT_EXECUTION_AUTHORIZATION`
- `NEXT_PHASE_APPROVAL_REQUIRED`
- `PROVIDER_EXECUTION_STILL_BLOCKED`
- `PRODUCTIVE_SECRET_STILL_BLOCKED`
- `PRODUCTION_WEBHOOK_STILL_BLOCKED`
- `MUTATION_STILL_BLOCKED`
- `FREEZE_REMAINS_ACTIVE`

## Provider integration boundary

Provider integration permanece `blocked`. Esta proposta nao cria provider, nao cria webhook, nao provisiona secret, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes e nao executa acao critica.

## Freeze continuity

F2.23 Final Readiness Freeze permanece ativo. F2.24 nao levanta freeze, nao levanta execution hold e nao altera o No-Go Ledger.

Qualquer tentativa futura de alterar esse estado exige nova fase formal, approvals explicitos e evidencia indexavel separada.

## Nao-autorizacao de execucao

F2.24 nao autoriza execucao, integracao, configuracao, teste com provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, lead action, acao critica ou side effect.

## Nao-autorizacao produtiva

O Board Decision Stub nao e autorizacao de producao. Mesmo `approve-to-open-next-phase-only` permite apenas abrir uma proxima fase formal, sem execucao e sem producao.

## Status final

Status: proposta/parcial evidenciada documentalmente.
