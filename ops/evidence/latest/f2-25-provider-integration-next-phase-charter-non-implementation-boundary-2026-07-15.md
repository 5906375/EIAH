# F2.25 — Provider Integration Next-Phase Charter / Explicit Non-Implementation Boundary — 2026-07-15

## Resumo executivo

Foi criado o Next-Phase Charter / Explicit Non-Implementation Boundary para uma eventual proxima fase formal da integracao hipotetica de provider WhatsApp.

F2.25 nao autoriza implementacao, nao autoriza execucao, nao autoriza producao, mantem provider integration em `blocked` e preserva o freeze F2.23 ativo ate nova fase formal.

## Pré-condição F2.24

Pre-condicao comprovada antes das alteracoes:

- F2.24 mergeada em `main` no commit `efd75b498a9029400bdfd6cbc138585c56ee66b8`.
- `origin/main` aponta para `efd75b498a9029400bdfd6cbc138585c56ee66b8`.
- `CI Monorepo`: `completed success`, run `29505715850`.
- `IMOB Worker Mutation E2E`: `completed success`, run `29505715596`.

## Arquivos lidos

- `CODEX.md`
- `/home/jusall/.codex/attachments/f579d6a7-dea9-42ef-a79b-7adb1acccd45/pasted-text.txt`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/ops/whatsapp-provider-integration-phase-transition-proposal-board-decision-stub.md`
- `docs/ops/whatsapp-provider-integration-stop-line-final-readiness-freeze.md`
- `docs/ops/whatsapp-provider-integration-final-pre-execution-hold-no-go-ledger.md`
- `docs/ops/whatsapp-provider-integration-board-review-packet-meeting-agenda.md`
- `docs/ops/whatsapp-provider-integration-evidence-pack-executive-review-dossier.md`
- `ops/evidence/latest/f2-24-provider-integration-phase-transition-proposal-board-decision-stub-2026-07-15.md`

## Problema resolvido

F2.24 criou uma Phase Transition Proposal / Board Decision Stub para eventual abertura de proxima fase, mas ainda faltava um charter explicito para delimitar a proxima fase como nao-implementacao.

F2.25 resolve essa lacuna com um boundary documental que impede interpretar charter, proposta ou decision stub como autorizacao de implementacao, execucao ou producao.

## Next-Phase Charter

O charter foi criado em `docs/ops/whatsapp-provider-integration-next-phase-charter-non-implementation-boundary.md`.

Ele define objetivo, escopo permitido, out-of-scope, entry criteria, exit criteria, approvals, evidencias, governance gates, blocked implementation actions e reasonCodes para uma eventual proxima fase formal.

## Explicit Non-Implementation Boundary

O boundary declara que F2.25 e apenas documental. Enquanto ativo:

- nenhuma implementacao de provider pode iniciar;
- nenhuma chamada externa de provider pode ocorrer;
- nenhum secret produtivo pode ser usado ou provisionado;
- nenhum webhook produtivo pode ser habilitado;
- nenhuma mutacao, lead action ou acao critica pode ser criada;
- nenhuma mudanca de runtime, engine, launcher, workflows, apps, packages ou scripts pode cruzar a fronteira de provider.

## Next-phase scope

- Refinamento documental do escopo da fase.
- Definicao de owners e approvals.
- Matriz de riscos e evidencias faltantes.
- Desenho de criterios de aceite.
- Proposta de plano de testes futuro sem provider real.
- Revisao de gaps F2.16.
- Revisao de freeze continuity F2.23.
- Preparacao de decision record futuro.
- Definicao de checks documentais e prova de isolamento.

## Out-of-scope

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
- Mudancas em `ChatAgentLauncher`, runtime, engine, workflows, `release.yml`, apps, packages ou scripts para implementar provider.
- Declarar WhatsApp operacional, provider integrado ou F2.25 como autorizacao de implementacao.

## Entry criteria

- F2.24 mergeada em `main` com CI pos-merge verde.
- F2.8-F2.24 indexadas em `docs/EVIDENCE_INDEX.md`.
- F2.23 Final Readiness Freeze ativo.
- F2.22 No-Go Ledger ativo.
- Provider integration `blocked`.
- Escopo da proxima fase separado de implementacao, execucao e producao.
- Approvals requeridos identificados.
- Evidence plan definido sem dados sensiveis.
- Governance gates definidos antes de qualquer alteracao tecnica.
- Blocked implementation actions preservadas.

## Exit criteria

- Objetivo e escopo revisados por owners.
- Approvals ou decisao `no-go`/`defer` registrados.
- Evidencias fisicas e indexaveis criadas.
- Checks obrigatorios verdes.
- Prova de isolamento das superficies proibidas.
- Ausencia de provider real, secret produtivo, webhook produtivo, mutacoes e side effects.
- Freeze F2.23 preservado ou alterado apenas por autorizacao formal futura.
- Provider integration ainda `blocked`, salvo fase futura explicitamente autorizada para mudar esse estado.
- Status final conservador sem declarar WhatsApp operacional.

## Required approvals

- Board/executive sponsor.
- Security.
- Privacy/Compliance, se aplicavel.
- Platform governance.
- Backend/API.
- Product/Platform.
- DocOps.

Sem approvals requeridos, a proxima fase deve ficar em `no-go` ou `defer`.

## Required evidence

- Referencia F2.8-F2.24 no Evidence Index.
- Evidencia F2.24 da Phase Transition Proposal / Board Decision Stub.
- Prova de F2.23 freeze ativo.
- Prova de F2.22 No-Go Ledger ativo.
- Lista de owners e approvals.
- ReasonCodes aplicaveis.
- Evidence plan sanitizado.
- Prova de ausencia de PII/sensiveis.
- Prova de ausencia de provider real, secret produtivo e webhook produtivo.
- Prova de ausencia de mutacoes e side effects.
- Checks obrigatorios verdes.
- Diff de isolamento das superficies proibidas.

## Blocked implementation actions

- Integrar provider WhatsApp real.
- Selecionar ou configurar provider real para execucao.
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
- Alterar `ChatAgentLauncher`, runtime, engine, workflows, `release.yml`, apps, packages ou scripts para provider.
- Registrar PII/sensiveis, telefone bruto, texto bruto, payload bruto, assinatura, token, cookie, Authorization ou secret em logs, metricas, bundles ou evidencias.

## Governance gates

- Precondition gate da fase anterior.
- Evidence Index gate.
- Docs link integrity gate.
- Isolation diff gate para `.github/workflows`, `release.yml`, apps, packages e scripts.
- Approval gate.
- Security/privacy review gate, quando aplicavel.
- Freeze continuity gate.
- No-Go Ledger continuity gate.
- Non-implementation boundary gate.
- SideEffects zero gate.

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

Provider integration permanece `blocked`. F2.25 nao cria provider real, nao usa secret produtivo, nao habilita webhook produtivo, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes, nao cria `lead.create`, nao cria `lead.discard` e nao executa acao critica.

## Freeze continuity

F2.23 Final Readiness Freeze permanece ativo. F2.25 nao levanta freeze, nao levanta execution hold e nao altera o No-Go Ledger.

## Não-autorização de implementação

F2.25 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine ou workflow.

## Não-autorização de execução

F2.25 nao autoriza execucao, integracao, configuracao, teste com provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, lead action, acao critica ou side effect.

## Não-autorização produtiva

F2.25 nao e autorizacao de producao. O charter permite apenas enquadrar uma eventual proxima fase formal e documental, preservando provider integration `blocked`.

## Checks executados

- `pnpm check:evidence-index`: passou.
  - `ok: true`
  - `refsChecked: 563`
- `pnpm check:docs-link-integrity`: passou.
  - `ok: true`
  - `filesChecked: 15`
- `git diff --check`: passou sem saida.
- `git diff -- .github/workflows release.yml apps packages scripts`: passou sem saida.

## Prova de isolamento

Escopo documental restrito aos arquivos esperados:

- `docs/ops/whatsapp-provider-integration-next-phase-charter-non-implementation-boundary.md`
- `ops/evidence/latest/f2-25-provider-integration-next-phase-charter-non-implementation-boundary-2026-07-15.md`
- `docs/EVIDENCE_INDEX.md`

O diff de isolamento confirmou ausencia de alteracoes em `.github/workflows`, `release.yml`, `apps`, `packages` ou `scripts`.

## Riscos residuais

- O charter nao prova operacao de provider real.
- O boundary nao substitui autorizacao futura especifica.
- F2.23 freeze permanece ativo.
- Gaps F2.16 permanecem bloqueadores ate evidencia futura.

## Próximos passos

- Manter provider integration em `blocked`.
- Usar F2.25 apenas como charter documental de proxima fase sem implementacao.

## Status final

Status: proposta/parcial evidenciada documentalmente.
