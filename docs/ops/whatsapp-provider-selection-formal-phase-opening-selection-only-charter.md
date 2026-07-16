# WhatsApp Provider Selection — Formal Phase Opening / Selection-Only Charter

## Objetivo

Este documento cria a Formal Phase Opening e o Selection-Only Charter da F4.0 para uma avaliacao futura hipotetica de selecao de provider WhatsApp.

F4.0 e um artefato documental. Ele abre somente uma fase de avaliacao selection-only. F4.0 nao autoriza selecao final de provider, nao autoriza implementacao, nao autoriza execucao, nao autoriza producao, nao seleciona provider real, nao integra provider WhatsApp real, nao provisiona secret produtivo, nao habilita webhook produtivo, nao cria mutacoes e nao altera o estado `provider integration blocked`.

## Formal Phase Opening

A abertura formal da F4.0 existe para separar a closure design-only F3.6 de qualquer avaliacao futura de selecao. A fase F4.0 permite organizar criterios, evidencias, approvals e gates para uma avaliacao selection-only, sem converter essa avaliacao em decisao final de provider.

Esta abertura declara:

- F3.6 Pre-Selection Boundary e a baseline imediata;
- F3.5 No-Go Decision Record permanece ativo;
- F2.26 governance closure permanece baseline de governanca;
- provider integration permanece `blocked`;
- provider final selection permanece `not authorized`;
- qualquer selecao final exige decisao futura separada, evidencias completas e approval explicito;
- qualquer implementacao futura exige fase posterior separada, pre-condicao propria, approvals, evidencia e autorizacao explicita.

## Selection-Only Charter

O charter F4.0 define que a fase pode produzir somente artefatos de avaliacao, comparacao, revisao e governanca para selecao. Nenhum item F4.0 pode ser usado como autorizacao para selecionar definitivamente, implementar, executar ou operar provider.

O charter pode organizar:

- criterios de selecao;
- candidatos hipoteticos;
- matriz comparativa;
- evidencias requeridas;
- owners e approvals necessarios;
- riscos e dependencias;
- decision records futuros;
- governance gates;
- proposta de proxima fase, se houver.

## Baseline F2/F3

F4.0 herda e preserva:

- F2.26 Governance Closure / End-of-Track Summary como baseline de governanca pre-provider.
- F2.22 No-Go Ledger como controle ativo.
- F2.23 Final Readiness Freeze como controle ativo.
- F2.25 Non-Implementation Boundary como controle ativo.
- F3.0 Design-Only Charter como baseline de design.
- F3.5 No-Go Decision Record como bloqueio ativo contra promocao prematura.
- F3.6 Design-Only Closure / Pre-Selection Boundary como baseline imediata para selection-only.

## Selection-only scope

F4.0 permite somente:

- definir criterios de avaliacao selection-only;
- listar candidatos hipoteticos sem selecao final;
- mapear evidencias necessarias por candidato;
- comparar riscos documentais;
- mapear requisitos de security, privacy, contract, observability, rollback, tenant/scope, PII e cost/commercial;
- definir owners e reviewers minimos;
- preparar decision record futuro sem decisao final;
- confirmar que provider integration permanece `blocked`;
- confirmar que provider final selection permanece `not authorized`;
- preservar ausencia de provider real, secret produtivo, webhook produtivo, mutacoes e side effects.

## Out-of-scope

Estao fora de escopo:

- selecionar provider real ou final;
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
- declarar provider selecionado;
- declarar provider integrado;
- declarar F4.0 como autorizacao de implementacao.

## Entry criteria

F4.0 so pode existir como selection-only quando:

1. F3.6 estiver mergeada em `main` com CI pos-merge verde.
2. F3.6 estiver indexada em `docs/EVIDENCE_INDEX.md`.
3. F3.6 for tratada como baseline pre-selection.
4. F3.5 No-Go Decision Record permanecer ativo.
5. F2.26 governance closure permanecer baseline.
6. Provider integration permanecer `blocked`.
7. Provider final selection permanecer `not authorized`.
8. O escopo F4.0 excluir selecao final, implementacao, execucao e producao.
9. Os blocked implementation actions permanecerem preservados.
10. Os checks documentais obrigatorios estiverem verdes.

## Exit criteria

F4.0 so pode ser encerrada quando:

1. o selection-only charter estiver fisicamente documentado;
2. a evidencia F4.0 estiver fisica e indexada;
3. F3.6 permanecer baseline pre-selection;
4. F3.5 No-Go Decision Record permanecer ativo;
5. F2.26 permanecer baseline de governanca;
6. provider integration permanecer `blocked`;
7. provider final selection permanecer `not authorized`;
8. ausencia de provider real, secret produtivo, webhook produtivo, mutacoes e side effects estiver documentada;
9. checks obrigatorios passarem;
10. diff de isolamento confirmar ausencia de alteracoes em workflows, `release.yml`, apps, packages e scripts;
11. o status final permanecer `proposta/parcial evidenciada documentalmente`.

## Required approvals

Qualquer avaliacao selection-only futura exigira, no minimo:

- Security;
- Privacy/Compliance, se aplicavel;
- Backend/API;
- Platform governance;
- Product/Platform;
- DocOps;
- Executive sponsor, se aplicavel.

F4.0 nao concede esses approvals. Ele apenas registra que approvals futuros sao obrigatorios para qualquer avaliacao ou decisao posterior.

## Required evidence

F4.0 requer:

- `docs/EVIDENCE_INDEX.md`;
- F2.26 governance closure e evidencia indexavel;
- F3.0 design-only charter e evidencia indexavel;
- F3.5 No-Go Decision Record e evidencia indexavel;
- F3.6 design-only closure / pre-selection boundary e evidencia indexavel;
- documento F4.0 selection-only charter;
- evidencia F4.0 fisica e indexavel;
- checks obrigatorios verdes;
- prova de isolamento das superficies proibidas;
- confirmacao de ausencia de provider real, secret produtivo, webhook produtivo, mutacoes e side effects.

## Selection governance gates

F4.0 preserva os seguintes gates:

- precondition gate F3.6;
- Evidence Index gate;
- docs link integrity gate;
- isolation diff gate;
- F2.26 governance baseline gate;
- F3.6 pre-selection boundary baseline gate;
- F3.5 No-Go Decision Record continuity gate;
- provider integration blocked gate;
- provider final selection not authorized gate;
- sideEffects zero gate;
- no implementation authorization gate;
- no execution authorization gate;
- no production authorization gate.

## Blocked implementation actions

Permanecem bloqueados:

- provider final selection;
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

## ReasonCodes

- `F4_FORMAL_PHASE_OPENING_ONLY`
- `F4_SELECTION_ONLY_CHARTER_ACTIVE`
- `SELECTION_ONLY_PHASE_NOT_IMPLEMENTATION_AUTHORIZATION`
- `PROVIDER_FINAL_SELECTION_NOT_AUTHORIZED`
- `PROVIDER_IMPLEMENTATION_STILL_BLOCKED`
- `PRODUCTIVE_SECRET_STILL_BLOCKED`
- `PRODUCTION_WEBHOOK_STILL_BLOCKED`
- `MUTATION_STILL_BLOCKED`
- `F3_PRE_SELECTION_BOUNDARY_BASELINE`

## Provider selection boundary

Provider final selection permanece `not authorized`. F4.0 nao seleciona provider, nao recomenda provider como final, nao aprova procurement, nao cria contrato, nao cria configuracao e nao permite interpretar selection-only como selecao implicita.

## Provider integration boundary

Provider integration permanece `blocked`. F4.0 nao cria provider, nao integra provider real, nao cria webhook, nao provisiona secret, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes e nao executa acao critica.

## No-Go continuity

F3.5 No-Go Decision Record permanece ativo. Qualquer tentativa de selecao final, implementacao, execucao, producao, provider real, secret produtivo, webhook produtivo, mutacao, acao critica ou side effect deve permanecer bloqueada ate fase posterior formal e decisao explicita.

## Nao-autorizacao de selecao final de provider

F4.0 nao autoriza selecao final de provider. A abertura formal e o selection-only charter apenas autorizam documentar criterios e governanca de avaliacao.

## Nao-autorizacao de implementacao

F4.0 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine, launcher, workflow, app, package ou script.

## Nao-autorizacao de execucao

F4.0 nao autoriza execucao, configuracao, teste com provider real, provider external call, mutation external side effect, uso de secret produtivo, webhook produtivo, mutacao, lead action, acao critica ou `sideEffects != 0`.

## Nao-autorizacao produtiva

F4.0 nao e autorizacao de producao. Formal phase opening, selection-only charter, evidence index, F3.6 pre-selection boundary ou F3.5 No-Go Decision Record nao podem ser tratados como permissao para operar WhatsApp, selecionar provider final, integrar provider, provisionar secret produtivo, habilitar webhook produtivo ou executar mutacoes.

## Status final

Status: proposta/parcial evidenciada documentalmente.
