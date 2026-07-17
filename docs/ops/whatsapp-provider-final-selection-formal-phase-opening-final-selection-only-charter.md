# WhatsApp Provider Final Selection — Formal Phase Opening / Final-Selection-Only Charter

## Objetivo

Este documento cria a Formal Phase Opening e o Final-Selection-Only Charter da F5.0 para uma avaliacao futura hipotetica de selecao final de provider WhatsApp.

F5.0 e um artefato documental. Ele abre somente uma fase de governanca final-selection-only. F5.0 nao autoriza selecao final de provider, implementacao, execucao, producao, provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacoes ou side effects.

Provider integration permanece `blocked`, provider final selection permanece `not authorized`, a F4.5 Candidate Review Boundary permanece baseline, a F4.4 Selection No-Go Record permanece ativa, a F3.6 Pre-Selection Boundary permanece baseline e a F2.26 Governance Closure permanece baseline.

## Formal Phase Opening

A abertura formal da F5.0 existe para separar a closure F4.5 de qualquer decisao futura de selecao final. A fase F5.0 permite organizar criterios, evidencias, approvals e gates para avaliacao final-selection-only, sem converter essa avaliacao em selecao final, implementacao, execucao ou producao.

Esta abertura declara:

- F4.5 Candidate Review Boundary e a baseline imediata;
- F4.4 Selection No-Go Record permanece ativo;
- F3.6 Pre-Selection Boundary permanece baseline;
- F2.26 Governance Closure permanece baseline de governanca;
- provider integration permanece `blocked`;
- provider final selection permanece `not authorized`;
- qualquer selecao final exige decisao futura separada, evidencias completas e approvals explicitos;
- qualquer implementacao futura exige fase posterior separada, pre-condicao propria, approvals, evidencia, decision record e autorizacao explicita.

## Final-Selection-Only Charter

O charter F5.0 define que a fase pode produzir somente artefatos de avaliacao final-selection-only, comparacao final, revisao governada e preparacao de decisao futura.

Nenhum item F5.0 pode ser usado como autorizacao para selecionar definitivamente, contratar, configurar, implementar, executar, testar com provider real ou operar provider.

O charter pode organizar:

- criterios finais de avaliacao;
- evidencias finais requeridas por candidato;
- matriz de decisao final-selection-only;
- owners e approvals necessarios;
- riscos de security, privacy, operational, compliance e commercial;
- plano de decision record futuro;
- governance gates de selecao final;
- blocked implementation actions;
- proposta de fase posterior, se houver.

## Baselines obrigatorios

F5.0 herda e preserva:

- F2.26 Governance Closure / End-of-Track Summary como baseline de governanca pre-provider.
- F3.6 Design-Only Closure / Pre-Selection Boundary como baseline de pre-selection.
- F4.0 Selection-Only Charter como baseline de selection-only.
- F4.4 Selection No-Go Record como bloqueio ativo contra promocao prematura.
- F4.5 Candidate Review Boundary como baseline imediata de candidate review.

## Final-selection-only scope

F5.0 permite somente:

- abrir formalmente uma fase final-selection-only;
- definir criterios de avaliacao para uma futura decisao final;
- revisar evidencias ja indexadas F2/F3/F4 como baseline;
- listar evidencias finais ainda requeridas por candidato;
- mapear approvals obrigatorios para decisao futura;
- definir final selection governance gates;
- registrar blocked implementation actions;
- preparar decision record futuro sem decisao final;
- confirmar que provider integration permanece `blocked`;
- confirmar que provider final selection permanece `not authorized`;
- preservar ausencia de provider real, secret produtivo, webhook produtivo, mutacoes e side effects.

## Out-of-scope

Estao fora de escopo:

- selecionar provider real ou final;
- declarar provider selecionado;
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
- declarar F5.0 como autorizacao de implementacao, execucao ou producao.

## Entry criteria

F5.0 so pode existir como final-selection-only quando:

1. F4.5 estiver mergeada em `main` com CI pos-merge verde.
2. F4.5 estiver indexada em `docs/EVIDENCE_INDEX.md`.
3. F4.5 Candidate Review Boundary for tratada como baseline imediata.
4. F4.4 Selection No-Go Record permanecer ativo.
5. F3.6 Pre-Selection Boundary permanecer baseline.
6. F2.26 Governance Closure permanecer baseline.
7. Provider integration permanecer `blocked`.
8. Provider final selection permanecer `not authorized`.
9. O escopo F5.0 excluir selecao final efetiva, implementacao, execucao e producao.
10. Os blocked implementation actions permanecerem preservados.
11. Os checks documentais obrigatorios estiverem verdes.

## Exit criteria

F5.0 so pode ser encerrada quando:

1. o final-selection-only charter estiver fisicamente documentado;
2. a evidencia F5.0 estiver fisica e indexada;
3. F4.5 permanecer baseline de candidate review;
4. F4.4 Selection No-Go Record permanecer ativo;
5. F3.6 permanecer baseline pre-selection;
6. F2.26 permanecer baseline de governanca;
7. provider integration permanecer `blocked`;
8. provider final selection permanecer `not authorized`;
9. ausencia de provider real, secret produtivo, webhook produtivo, mutacoes e side effects estiver documentada;
10. checks obrigatorios passarem;
11. diff de isolamento confirmar ausencia de alteracoes em workflows, `release.yml`, apps, packages e scripts;
12. o status final permanecer `proposta/parcial evidenciada documentalmente`.

## Required approvals

Qualquer decisao futura de selecao final exigira, no minimo:

- Security;
- Privacy/Compliance, se aplicavel;
- Backend/API;
- Platform governance;
- Product/Platform;
- DocOps;
- Executive sponsor, se aplicavel.

F5.0 nao concede esses approvals. Ele apenas registra que approvals futuros sao obrigatorios para qualquer decisao posterior.

## Required evidence

F5.0 requer:

- `docs/EVIDENCE_INDEX.md`;
- F2.26 Governance Closure e evidencia indexavel;
- F3.6 Pre-Selection Boundary e evidencia indexavel;
- F4.0 Selection-Only Charter e evidencia indexavel;
- F4.4 Selection No-Go Record e evidencia indexavel;
- F4.5 Candidate Review Boundary e evidencia indexavel;
- documento F5.0 final-selection-only charter;
- evidencia F5.0 fisica e indexavel;
- checks obrigatorios verdes;
- prova de isolamento das superficies proibidas;
- confirmacao de ausencia de provider real, secret produtivo, webhook produtivo, mutacoes e side effects.

Uma futura decisao de selecao final, fora de F5.0, tambem devera exigir evidencias finais por candidato, sign-offs humanos completos, risk posture, security posture, privacy posture, operational posture, commercial posture e decision record proprio.

## Final selection governance gates

F5.0 preserva os seguintes gates:

- precondition gate F4.5;
- Evidence Index gate;
- docs link integrity gate;
- isolation diff gate;
- F2.26 governance baseline gate;
- F3.6 pre-selection boundary baseline gate;
- F4.5 candidate review boundary baseline gate;
- F4.4 Selection No-Go Record continuity gate;
- required approvals gate;
- required evidence gate;
- provider integration blocked gate;
- provider final selection not authorized gate;
- productive secret blocked gate;
- production webhook blocked gate;
- mutation blocked gate;
- sideEffects zero gate;
- no implementation authorization gate;
- no execution authorization gate;
- no production authorization gate.

## Blocked implementation actions

Permanecem bloqueados:

- provider final selection;
- provider WhatsApp real;
- provider integration;
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

- `F5_FORMAL_PHASE_OPENING_ONLY`
- `F5_FINAL_SELECTION_ONLY_CHARTER_ACTIVE`
- `FINAL_SELECTION_PHASE_NOT_SELECTION_AUTHORIZATION`
- `FINAL_SELECTION_ONLY_NOT_IMPLEMENTATION_AUTHORIZATION`
- `PROVIDER_FINAL_SELECTION_STILL_BLOCKED`
- `PROVIDER_INTEGRATION_STILL_BLOCKED`
- `PRODUCTIVE_SECRET_STILL_BLOCKED`
- `PRODUCTION_WEBHOOK_STILL_BLOCKED`
- `MUTATION_STILL_BLOCKED`
- `F4_CANDIDATE_REVIEW_BOUNDARY_BASELINE`

## Provider final selection boundary

Provider final selection permanece `not authorized`. F5.0 nao seleciona provider, nao recomenda provider como final, nao aprova procurement, nao cria contrato, nao cria configuracao e nao permite interpretar final-selection-only como selecao implicita.

## Provider integration boundary

Provider integration permanece `blocked`. F5.0 nao cria provider, nao integra provider real, nao cria webhook, nao provisiona secret, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes e nao executa acao critica.

## Boundary continuity

F4.5 Candidate Review Boundary permanece baseline imediata. F4.4 Selection No-Go Record permanece ativo. F3.6 Pre-Selection Boundary permanece baseline. F2.26 Governance Closure permanece baseline. Qualquer tentativa de selecao final efetiva, implementacao, execucao, producao, provider real, secret produtivo, webhook produtivo, mutacao, acao critica ou side effect deve permanecer bloqueada ate decisao futura explicita e fase posterior apropriada.

## Nao-autorizacao de selecao final de provider

F5.0 nao autoriza selecao final de provider. A abertura formal e o final-selection-only charter apenas autorizam documentar criterios e governanca para uma possivel decisao futura.

## Nao-autorizacao de implementacao

F5.0 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine, launcher, workflow, app, package ou script.

## Nao-autorizacao de execucao

F5.0 nao autoriza execucao, configuracao, teste com provider real, provider external call, mutation external side effect, uso de secret produtivo, webhook produtivo, mutacao, lead action, acao critica ou `sideEffects != 0`.

## Nao-autorizacao produtiva

F5.0 nao e autorizacao de producao. Formal phase opening, final-selection-only charter, evidence index, F4.5 Candidate Review Boundary, F4.4 Selection No-Go Record, F3.6 Pre-Selection Boundary ou F2.26 Governance Closure nao podem ser tratados como permissao para operar WhatsApp, selecionar provider final, integrar provider, provisionar secret produtivo, habilitar webhook produtivo ou executar mutacoes.

## Status final

Status: proposta/parcial evidenciada documentalmente.
