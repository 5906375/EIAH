# F4.0 — Provider Selection Formal Phase Opening / Selection-Only Charter — 2026-07-15

## Resumo executivo

Foi criada a Formal Phase Opening / Selection-Only Charter da F4.0 para abrir uma fase documental de avaliacao futura hipotetica de selecao de provider WhatsApp.

F4.0 nao autoriza selecao final de provider, implementacao, execucao, producao, provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacoes ou side effects. Provider integration permanece `blocked`, provider final selection permanece `not authorized`, F3.6 pre-selection boundary permanece baseline, F3.5 No-Go Decision Record permanece ativo e F2.26 governance closure permanece baseline.

## Pré-condição F3.6

Pre-condicao comprovada antes das alteracoes:

- F3.6 mergeada em `main` no commit `c6abfc85fd24793276a08d21d5889609af5682c0`.
- `origin/main` aponta para `c6abfc85fd24793276a08d21d5889609af5682c0`.
- `CI Monorepo`: `completed success`, run `29525858341`.
- `IMOB Worker Mutation E2E`: `completed success`, run `29525858251`.

## Arquivos lidos

- `CODEX.md`
- `/home/jusall/.codex/attachments/f7abf628-8292-4dd4-a8fb-bf5f40302386/pasted-text.txt`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/ops/whatsapp-provider-integration-design-only-closure-pre-selection-boundary.md`
- `docs/ops/whatsapp-provider-integration-review-outcome-template-no-go-decision-record.md`
- `docs/ops/whatsapp-provider-integration-formal-phase-opening-design-only-charter.md`
- `docs/ops/whatsapp-provider-integration-governance-closure-end-of-track-summary.md`
- `ops/evidence/latest/f3-06-provider-integration-design-only-closure-pre-selection-boundary-2026-07-15.md`

## Problema resolvido

F3.6 consolidou a cadeia design-only e declarou o pre-selection boundary, mas ainda faltava uma abertura formal para uma fase selection-only que preservasse explicitamente a ausencia de selecao final, implementacao, execucao e producao.

F4.0 resolve essa lacuna de forma documental, sem selecionar provider e sem relaxar os bloqueios de provider integration.

## Formal Phase Opening

A abertura formal foi criada em `docs/ops/whatsapp-provider-selection-formal-phase-opening-selection-only-charter.md`.

Ela separa F3.6 pre-selection boundary de uma fase selection-only futura, mantendo provider integration `blocked` e provider final selection `not authorized`.

## Selection-Only Charter

O charter permite somente organizar criterios, evidencias, approvals, gates e governanca de avaliacao selection-only.

Nenhum item do charter autoriza selecao final, implementacao, execucao, producao, provider real, secret produtivo, webhook produtivo, mutacoes ou side effects.

## Baseline F2/F3

- F2.26 Governance Closure / End-of-Track Summary permanece baseline de governanca.
- F2.22 No-Go Ledger permanece controle ativo.
- F2.23 Final Readiness Freeze permanece controle ativo.
- F2.25 Non-Implementation Boundary permanece controle ativo.
- F3.0 Design-Only Charter permanece baseline de design.
- F3.5 No-Go Decision Record permanece ativo.
- F3.6 Design-Only Closure / Pre-Selection Boundary permanece baseline imediata.

## Selection-only scope

- Definir criterios de avaliacao selection-only.
- Listar candidatos hipoteticos sem selecao final.
- Mapear evidencias necessarias por candidato.
- Comparar riscos documentais.
- Mapear requisitos de security, privacy, contract, observability, rollback, tenant/scope, PII e cost/commercial.
- Definir owners e reviewers minimos.
- Preparar decision record futuro sem decisao final.
- Confirmar provider integration `blocked`.
- Confirmar provider final selection `not authorized`.
- Preservar ausencia de provider real, secret produtivo, webhook produtivo, mutacoes e side effects.

## Out-of-scope

- Selecionar provider real ou final.
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
- Alterar `ChatAgentLauncher`, runtime, engine, workflows, `release.yml`, apps, packages ou scripts.
- Declarar WhatsApp operacional, provider selecionado ou provider integrado.

## Entry criteria

1. F3.6 mergeada em `main` com CI pos-merge verde.
2. F3.6 indexada em `docs/EVIDENCE_INDEX.md`.
3. F3.6 tratada como baseline pre-selection.
4. F3.5 No-Go Decision Record ativo.
5. F2.26 governance closure como baseline.
6. Provider integration `blocked`.
7. Provider final selection `not authorized`.
8. Escopo F4.0 exclui selecao final, implementacao, execucao e producao.
9. Blocked implementation actions preservados.
10. Checks documentais obrigatorios verdes.

## Exit criteria

1. Selection-only charter fisicamente documentado.
2. Evidencia F4.0 fisica e indexada.
3. F3.6 permanece baseline pre-selection.
4. F3.5 No-Go Decision Record permanece ativo.
5. F2.26 permanece baseline de governanca.
6. Provider integration permanece `blocked`.
7. Provider final selection permanece `not authorized`.
8. Ausencia de provider real, secret produtivo, webhook produtivo, mutacoes e side effects documentada.
9. Checks obrigatorios passam.
10. Diff de isolamento confirma ausencia de alteracoes em workflows, `release.yml`, apps, packages e scripts.
11. Status final permanece `proposta/parcial evidenciada documentalmente`.

## Required approvals

- Security.
- Privacy/Compliance, se aplicavel.
- Backend/API.
- Platform governance.
- Product/Platform.
- DocOps.
- Executive sponsor, se aplicavel.

F4.0 nao concede approvals; apenas registra que eles serao obrigatorios para avaliacao ou decisao posterior.

## Required evidence

- `docs/EVIDENCE_INDEX.md`.
- F2.26 governance closure e evidencia indexavel.
- F3.0 design-only charter e evidencia indexavel.
- F3.5 No-Go Decision Record e evidencia indexavel.
- F3.6 design-only closure / pre-selection boundary e evidencia indexavel.
- Documento F4.0 selection-only charter.
- Evidencia F4.0 fisica e indexavel.
- Checks obrigatorios verdes.
- Prova de isolamento das superficies proibidas.
- Confirmacao de ausencia de provider real, secret produtivo, webhook produtivo, mutacoes e side effects.

## Selection governance gates

- Precondition gate F3.6.
- Evidence Index gate.
- Docs link integrity gate.
- Isolation diff gate.
- F2.26 governance baseline gate.
- F3.6 pre-selection boundary baseline gate.
- F3.5 No-Go Decision Record continuity gate.
- Provider integration blocked gate.
- Provider final selection not authorized gate.
- SideEffects zero gate.
- No implementation authorization gate.
- No execution authorization gate.
- No production authorization gate.

## Blocked implementation actions

- Provider final selection.
- Provider WhatsApp real.
- Secret produtivo.
- Webhook produtivo.
- Endpoint publico novo.
- Dashboard obrigatorio.
- Storage externo obrigatorio.
- Ledger produtivo obrigatorio.
- Mutacoes.
- `lead.create`.
- `lead.discard`.
- Acao critica.
- Provider external call.
- Mutation external side effect.
- `sideEffects != 0`.
- PII/sensiveis em logs, metricas, bundles ou evidencias.
- Alteracoes em `ChatAgentLauncher`, runtime, engine, workflows, `release.yml`, apps, packages ou scripts para provider.

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

## Não-autorização de seleção final de provider

F4.0 nao autoriza selecao final de provider. A abertura formal e o selection-only charter apenas autorizam documentar criterios e governanca de avaliacao.

## Não-autorização de implementação

F4.0 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine, launcher, workflow, app, package ou script.

## Não-autorização de execução

F4.0 nao autoriza execucao, configuracao, teste com provider real, provider external call, mutation external side effect, uso de secret produtivo, webhook produtivo, mutacao, lead action, acao critica ou `sideEffects != 0`.

## Não-autorização produtiva

F4.0 nao e autorizacao de producao. Formal phase opening, selection-only charter, evidence index, F3.6 pre-selection boundary ou F3.5 No-Go Decision Record nao podem ser tratados como permissao para operar WhatsApp, selecionar provider final, integrar provider, provisionar secret produtivo, habilitar webhook produtivo ou executar mutacoes.

## Checks executados

- `pnpm check:evidence-index`: passou (`ok: true`, `refsChecked: 581`).
- `pnpm check:docs-link-integrity`: passou (`ok: true`, `filesChecked: 15`).
- `git diff --check`: passou sem saida.
- `git diff -- .github/workflows release.yml apps packages scripts`: passou sem saida.

## Prova de isolamento

Alteracoes planejadas apenas em documentacao operacional e evidencia:

- `docs/ops/whatsapp-provider-selection-formal-phase-opening-selection-only-charter.md`
- `ops/evidence/latest/f4-00-provider-selection-formal-phase-opening-selection-only-charter-2026-07-15.md`
- `docs/EVIDENCE_INDEX.md`

`git diff -- .github/workflows release.yml apps packages scripts` nao retornou saida. Nenhuma alteracao foi feita em workflows, `release.yml`, apps, packages, scripts, runtime, engine ou `ChatAgentLauncher`.

## Riscos residuais

- F4.0 nao seleciona provider e nao resolve security, privacy, operational readiness ou commercial posture de um provider real.
- Uma futura decisao de selecao final ainda exigira approvals e evidencias proprias.
- Provider integration permanece bloqueada e a cadeia permanece documental.

## Próximos passos

- Manter provider integration `blocked`.
- Manter provider final selection `not authorized`.
- Usar F4.0 somente para avaliacao selection-only documental.
- Exigir decision record futuro antes de qualquer selecao final.
- Bloquear provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacoes, acao critica e side effects.

## Status final

Status: proposta/parcial evidenciada documentalmente.
