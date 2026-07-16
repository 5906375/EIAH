# WhatsApp Provider Integration — Formal Phase Opening / Design-Only Charter

## Objetivo

Este documento cria a abertura formal da fase F3 para uma avaliacao futura da integracao hipotetica de provider WhatsApp em modo estritamente design-only.

F3.0 e um artefato documental. Ele nao autoriza implementacao, nao autoriza execucao, nao autoriza producao, nao integra provider real, nao provisiona secret produtivo, nao habilita webhook produtivo e nao altera o estado `provider integration blocked`.

## Formal Phase Opening

A abertura formal da F3 existe para separar a closure de governanca F2.26 de qualquer trabalho futuro. F3.0 abre apenas uma fase de design, sem permissao tecnica para provider, secret, webhook, mutacao, runtime ou producao.

Esta abertura declara:

- F2.26 e a baseline de governanca pre-provider;
- F2.23 Final Readiness Freeze permanece ativo;
- F2.22 No-Go Ledger permanece ativo;
- F2.25 Explicit Non-Implementation Boundary permanece ativa;
- provider integration permanece `blocked`;
- qualquer implementacao futura exige fase posterior separada, com pre-condicao propria, approvals, evidencia e autorizacao explicita.

## Design-Only Charter

O charter F3.0 define que a fase pode produzir somente artefatos de design, revisao e planejamento. Nenhum item F3.0 pode ser usado como autorizacao para implementar, executar ou operar provider.

O charter pode organizar:

- perguntas de design;
- requisitos futuros;
- riscos e dependencias;
- owners e approvals necessarios;
- evidencias futuras esperadas;
- criterios de entrada e saida;
- boundaries e reasonCodes;
- proposta de proxima fase, se houver.

## Baseline F2.0-F2.26

F3.0 herda a baseline F2 completa:

| Marco | Papel na baseline |
| --- | --- |
| F2.0 | Design read-only, binding e fail-closed. |
| F2.1 | Contrato tecnico, envelope e assinatura. |
| F2.2 | Especificacao de endpoint/webhook futuro. |
| F2.3 | Handler read-only controlado. |
| F2.3a | Registro canonico de teste. |
| F2.4 | ChannelBinding e Replay Guard. |
| F2.5 | Hardening e matriz negativa. |
| F2.6 | Evidence bundle sanitizado. |
| F2.7 | Bundle export contract. |
| F2.8 | Contract freeze e compatibility gate. |
| F2.9 | Runbook e rollback policy. |
| F2.10 | Observability e SLO baseline. |
| F2.11 | Synthetic healthcheck non-provider. |
| F2.12 | Synthetic healthcheck contract gate. |
| F2.13 | Promotion readiness matrix. |
| F2.14 | Promotion decision record template. |
| F2.15 | Evidence closure e pre-provider boundary. |
| F2.16 | Gap register e entry criteria. |
| F2.17 | Design brief e non-execution plan. |
| F2.18 | Threat model e abuse case register. |
| F2.19 | Security review checklist e approval gate. |
| F2.20 | Evidence pack e executive review dossier. |
| F2.21 | Board review packet e meeting agenda. |
| F2.22 | Final pre-execution hold e No-Go Ledger. |
| F2.23 | Stop-line e final readiness freeze. |
| F2.24 | Phase transition proposal e board decision stub. |
| F2.25 | Next-phase charter e non-implementation boundary. |
| F2.26 | Governance closure e end-of-track summary. |

## F3 design-only scope

F3.0 permite somente:

- consolidar perguntas de design de provider;
- mapear dependencias futuras sem executar;
- preparar criterios de revisao futura;
- organizar owners e approvals requeridos;
- listar evidencias futuras minimas;
- revisar gaps F2.16 como bloqueadores;
- manter F2.22, F2.23, F2.25 e F2.26 como controles ativos;
- propor artefatos documentais futuros sem implementacao.

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
- alterar apps, packages ou scripts para provider;
- declarar WhatsApp operacional;
- declarar provider integrado;
- declarar F3.0 como autorizacao de implementacao.

## Entry criteria

F3.0 so pode existir como design-only quando:

1. F2.26 estiver mergeada em `main` com CI pos-merge verde.
2. F2.0-F2.26 estiverem indexadas em `docs/EVIDENCE_INDEX.md`.
3. F2.26 for tratada como baseline de governanca pre-provider.
4. F2.23 Final Readiness Freeze permanecer ativo.
5. F2.22 No-Go Ledger permanecer ativo.
6. F2.25 Explicit Non-Implementation Boundary permanecer ativa.
7. Provider integration permanecer `blocked`.
8. O escopo F3.0 excluir implementacao, execucao e producao.
9. Os blocked implementation actions permanecerem preservados.
10. Os checks documentais obrigatorios estiverem verdes.

## Exit criteria

F3.0 so pode ser encerrada quando:

1. o design-only charter estiver fisicamente documentado;
2. a evidencia F3.0 estiver fisica e indexada;
3. F2.26 permanecer baseline pre-provider;
4. F2.22, F2.23 e F2.25 permanecerem ativos;
5. provider integration permanecer `blocked`;
6. ausencia de provider real, secret produtivo, webhook produtivo, mutacoes e side effects estiver documentada;
7. checks obrigatorios passarem;
8. diff de isolamento confirmar ausencia de alteracoes em workflows, `release.yml`, apps, packages e scripts;
9. o status final permanecer `proposta/parcial evidenciada documentalmente`.

## Required approvals

Qualquer evolucao alem de F3.0 design-only exigira, no minimo:

- Board/executive sponsor;
- Security;
- Privacy/Compliance, se aplicavel;
- Platform governance;
- Backend/API;
- Product/Platform;
- DocOps.

F3.0 nao concede esses approvals. Ela apenas registra que approvals futuros sao obrigatorios para qualquer fase posterior.

## Required evidence

F3.0 requer:

- F2.0-F2.26 no Evidence Index;
- evidencia F2.26 como baseline de governanca pre-provider;
- prova de F2.23 freeze ativo;
- prova de F2.22 No-Go Ledger ativo;
- prova de F2.25 non-implementation boundary ativo;
- documento F3.0 design-only;
- evidencia F3.0 fisica e indexavel;
- checks obrigatorios verdes;
- prova de isolamento das superficies proibidas;
- confirmacao de ausencia de provider real, secret produtivo, webhook produtivo, mutacoes e side effects.

## Blocked implementation actions

Permanecem bloqueados:

- provider WhatsApp real;
- secret produtivo;
- webhook produtivo;
- endpoint publico novo;
- dashboard obrigatorio;
- storage externo obrigatorio;
- ledger produtivo obrigatorio;
- mutacoes;
- `lead.create`;
- `lead.discard`;
- acao critica;
- provider external call;
- mutation external side effect;
- `sideEffects != 0`;
- PII/sensiveis em logs, metricas, bundles ou evidencias;
- alteracoes em `ChatAgentLauncher`, runtime, engine, workflows, `release.yml`, apps, packages ou scripts para provider.

## Governance gates

F3.0 preserva os seguintes gates:

- precondition gate F2.26;
- Evidence Index gate;
- docs link integrity gate;
- isolation diff gate;
- F2.22 No-Go Ledger continuity gate;
- F2.23 freeze continuity gate;
- F2.25 non-implementation boundary gate;
- provider integration blocked gate;
- sideEffects zero gate;
- no production authorization gate.

## ReasonCodes

- `F3_FORMAL_PHASE_OPENING_ONLY`
- `F3_DESIGN_ONLY_CHARTER_ACTIVE`
- `DESIGN_ONLY_PHASE_NOT_IMPLEMENTATION_AUTHORIZATION`
- `PROVIDER_IMPLEMENTATION_STILL_BLOCKED`
- `PRODUCTIVE_SECRET_STILL_BLOCKED`
- `PRODUCTION_WEBHOOK_STILL_BLOCKED`
- `MUTATION_STILL_BLOCKED`
- `F2_FREEZE_REMAINS_ACTIVE`
- `F2_NON_IMPLEMENTATION_BOUNDARY_REMAINS_ACTIVE`

## Provider integration boundary

Provider integration permanece `blocked`. F3.0 nao cria provider, nao cria webhook, nao provisiona secret, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes e nao executa acao critica.

## Freeze continuity

F2.23 Final Readiness Freeze permanece ativo. F3.0 nao levanta freeze, nao levanta execution hold e nao altera o No-Go Ledger.

## Non-implementation boundary

F2.25 Explicit Non-Implementation Boundary permanece ativa. F3.0 nao autoriza implementacao direta ou indireta de provider, runtime, engine, launcher, workflows, apps, packages ou scripts.

## Nao-autorizacao de implementacao

F3.0 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine ou workflow.

## Nao-autorizacao de execucao

F3.0 nao autoriza execucao, integracao, configuracao, teste com provider real, provider external call, mutation external side effect, secret produtivo, webhook produtivo ou side effect.

## Nao-autorizacao produtiva

F3.0 nao e autorizacao de producao. A fase e design-only e preserva provider integration `blocked`.

## Status final

Status: proposta/parcial evidenciada documentalmente.
