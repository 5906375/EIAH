# WhatsApp Provider Integration — Next-Phase Charter / Explicit Non-Implementation Boundary

## Objetivo

Este documento cria o Next-Phase Charter e o Explicit Non-Implementation Boundary para uma eventual proxima fase formal da integracao hipotetica de provider WhatsApp.

F2.25 e um artefato documental. Ele nao autoriza implementacao, nao autoriza execucao, nao autoriza producao, nao integra provider real, nao provisiona secret produtivo, nao habilita webhook produtivo e nao altera o estado `provider integration blocked` herdado de F2.15-F2.24.

## Next-Phase Charter

O charter define o enquadramento minimo para solicitar uma proxima fase formal apos F2.24. Ele existe para separar proposta governada de implementacao real.

Qualquer proxima fase deve declarar:

- objetivo e nome da fase;
- escopo documental ou tecnico permitido;
- relacao com F2.8-F2.24;
- entry criteria;
- exit criteria;
- approvals requeridos;
- evidencias requeridas;
- governance gates;
- blocked implementation actions preservadas;
- confirmacao de que F2.23 freeze permanece ativo ate nova decisao formal;
- confirmacao de que provider integration permanece `blocked`.

## Explicit Non-Implementation Boundary

O boundary explicito de nao-implementacao impede que o charter seja interpretado como permissao para iniciar trabalho tecnico de provider.

Enquanto este boundary estiver ativo:

- nenhuma implementacao de provider pode ser iniciada;
- nenhuma chamada externa de provider pode ser feita;
- nenhum secret produtivo pode ser solicitado, armazenado ou provisionado;
- nenhum webhook produtivo pode ser habilitado;
- nenhuma mutacao, `lead.create`, `lead.discard` ou acao critica pode ser criada;
- nenhuma alteracao em `ChatAgentLauncher`, runtime, engine, workflows, `release.yml`, apps, packages ou scripts pode ser usada para cruzar a fronteira de provider.

## Next-phase scope

Uma proxima fase, se aprovada futuramente, pode conter somente atividades governadas e explicitamente nao produtivas, como:

- refinamento documental do escopo da fase;
- definicao de owners e approvals;
- matriz de riscos e evidencias faltantes;
- desenho de criterios de aceite;
- proposta de plano de testes futuro sem provider real;
- revisao de gaps F2.16;
- revisao de freeze continuity F2.23;
- preparacao de decision record futuro;
- definicao de checks documentais e prova de isolamento.

Esse escopo nao inclui implementacao, execucao ou producao.

## Out-of-scope

Estao fora de escopo:

- integrar provider WhatsApp real;
- usar, solicitar, armazenar ou provisionar secret produtivo;
- habilitar webhook produtivo;
- criar endpoint publico novo;
- criar dashboard obrigatorio;
- criar storage externo obrigatorio;
- criar ledger produtivo obrigatorio;
- criar mutacoes;
- criar `lead.create`;
- criar `lead.discard`;
- executar acao critica;
- fazer provider external call;
- gerar mutation external side effect;
- permitir `sideEffects != 0`;
- alterar `ChatAgentLauncher`;
- alterar runtime;
- alterar engine;
- alterar workflows;
- alterar `release.yml`;
- alterar apps, packages ou scripts para implementar provider;
- declarar WhatsApp operacional;
- declarar provider integrado;
- declarar F2.25 como autorizacao de implementacao.

## Entry criteria

Antes de abrir qualquer proxima fase formal, todos os criterios abaixo devem estar satisfeitos:

1. F2.24 mergeada em `main` com CI pos-merge verde.
2. F2.8-F2.24 indexadas em `docs/EVIDENCE_INDEX.md`.
3. F2.23 Final Readiness Freeze ainda ativo.
4. F2.22 No-Go Ledger ainda ativo.
5. Provider integration ainda `blocked`.
6. Escopo da proxima fase separado de implementacao, execucao e producao.
7. Approvals requeridos identificados com owners.
8. Evidence plan definido sem dados sensiveis.
9. Governance gates definidos antes de qualquer alteracao tecnica.
10. Blocked implementation actions preservadas.

## Exit criteria

Uma proxima fase documental so pode ser encerrada quando comprovar:

1. objetivo e escopo revisados por owners;
2. approvals ou decisao `no-go`/`defer` registrados;
3. evidencias fisicas e indexaveis criadas;
4. checks obrigatorios verdes;
5. prova de isolamento das superficies proibidas;
6. ausencia de provider real, secret produtivo, webhook produtivo, mutacoes e side effects;
7. freeze F2.23 preservado ou alterado apenas por nova autorizacao formal futura;
8. provider integration ainda `blocked`, salvo fase futura explicitamente autorizada para mudar esse estado;
9. status final conservador sem declarar WhatsApp operacional.

## Required approvals

Qualquer proxima fase deve exigir, no minimo:

- Board/executive sponsor;
- Security;
- Privacy/Compliance, se aplicavel;
- Platform governance;
- Backend/API;
- Product/Platform;
- DocOps.

Sem approvals requeridos, a proxima fase deve ficar em `no-go` ou `defer`.

## Required evidence

A evidencia minima para abertura ou encerramento de proxima fase deve incluir:

- referencia F2.8-F2.24 no Evidence Index;
- evidencia F2.24 da Phase Transition Proposal / Board Decision Stub;
- prova de F2.23 freeze ativo;
- prova de F2.22 No-Go Ledger ativo;
- lista de owners e approvals;
- reasonCodes aplicaveis;
- evidence plan sanitizado;
- prova de ausencia de PII/sensiveis;
- prova de ausencia de provider real, secret produtivo e webhook produtivo;
- prova de ausencia de mutacoes e side effects;
- checks obrigatorios verdes;
- diff de isolamento das superficies proibidas.

## Blocked implementation actions

As acoes abaixo permanecem bloqueadas:

- integrar provider WhatsApp real;
- selecionar ou configurar provider real para execucao;
- usar, solicitar, armazenar ou provisionar secret produtivo;
- habilitar webhook produtivo;
- criar endpoint publico novo;
- criar dashboard obrigatorio;
- criar storage externo obrigatorio;
- criar ledger produtivo obrigatorio;
- criar mutacoes;
- criar `lead.create`;
- criar `lead.discard`;
- executar acao critica;
- fazer provider external call;
- gerar mutation external side effect;
- permitir `sideEffects != 0`;
- alterar `ChatAgentLauncher`, runtime, engine, workflows, `release.yml`, apps, packages ou scripts para provider;
- registrar PII/sensiveis, telefone bruto, texto bruto, payload bruto, assinatura, token, cookie, Authorization ou secret em logs, metricas, bundles ou evidencias.

## Governance gates

Qualquer proxima fase deve passar por:

- precondition gate da fase anterior;
- Evidence Index gate;
- docs link integrity gate;
- isolation diff gate para `.github/workflows`, `release.yml`, apps, packages e scripts;
- approval gate;
- security/privacy review gate, quando aplicavel;
- freeze continuity gate;
- no-go ledger continuity gate;
- non-implementation boundary gate;
- sideEffects zero gate.

## ReasonCodes

- `NEXT_PHASE_CHARTER_ONLY`
- `NON_IMPLEMENTATION_BOUNDARY_ACTIVE`
- `NEXT_PHASE_CHARTER_NOT_IMPLEMENTATION_AUTHORIZATION`
- `PROVIDER_IMPLEMENTATION_STILL_BLOCKED`
- `PRODUCTIVE_SECRET_STILL_BLOCKED`
- `PRODUCTION_WEBHOOK_STILL_BLOCKED`
- `MUTATION_STILL_BLOCKED`
- `RUNTIME_CHANGE_NOT_AUTHORIZED`
- `IMPLEMENTATION_PHASE_REQUIRED`

## Provider integration boundary

Provider integration permanece `blocked`. Este charter nao cria provider, nao cria webhook, nao provisiona secret, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes e nao executa acao critica.

## Freeze continuity

F2.23 Final Readiness Freeze permanece ativo ate existir nova fase formal com escopo separado, approvals explicitos e evidencia fisica/indexavel. F2.25 nao levanta freeze, nao levanta execution hold e nao altera o No-Go Ledger.

## Nao-autorizacao de implementacao

F2.25 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine ou workflow.

## Nao-autorizacao de execucao

F2.25 nao autoriza execucao, integracao, configuracao, teste com provider real, provider external call, mutation external side effect, secret produtivo, webhook produtivo ou side effect.

## Nao-autorizacao produtiva

F2.25 nao e autorizacao de producao. O charter permite apenas enquadrar uma eventual proxima fase formal e documental, preservando provider integration `blocked`.

## Status final

Status: proposta/parcial evidenciada documentalmente.
