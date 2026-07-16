# F2.24 — Provider Integration Phase Transition Proposal / Board Decision Stub — 2026-07-15

## Resumo executivo

Foi criada a Phase Transition Proposal / Board Decision Stub para uma eventual avaliacao futura de abertura de proxima fase da integracao hipotetica de provider WhatsApp.

F2.24 nao autoriza execucao, nao autoriza producao, mantem provider integration em `blocked` e preserva o freeze F2.23 ativo.

## Pré-condição F2.23

Pre-condicao comprovada antes das alteracoes:

- F2.23 mergeada em `main` no commit `de8a04610bd137698318feb3088b9f88463057fa`.
- `CI Monorepo`: `completed success`, run `29504797731`.
- `IMOB Worker Mutation E2E`: `completed success`, run `29504797540`.

## Arquivos lidos

- `CODEX.md`
- `/home/jusall/.codex/attachments/7aaa4732-c84c-472f-a673-9dfbd014ffb4/pasted-text.txt`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/ops/whatsapp-provider-integration-stop-line-final-readiness-freeze.md`
- `docs/ops/whatsapp-provider-integration-final-pre-execution-hold-no-go-ledger.md`
- `docs/ops/whatsapp-provider-integration-board-review-packet-meeting-agenda.md`
- `docs/ops/whatsapp-provider-integration-evidence-pack-executive-review-dossier.md`
- `ops/evidence/latest/f2-23-provider-integration-stop-line-final-readiness-freeze-2026-07-15.md`

## Problema resolvido

F2.23 congelou a baseline F2.8-F2.22 e declarou a stop-line/final readiness freeze. Ainda faltava um artefato documental para propor, sem executar, uma eventual transicao futura de fase e um stub padronizado para decisao de board.

F2.24 resolve essa lacuna sem levantar o freeze F2.23 e sem cruzar a fronteira pre-provider.

## Phase Transition Proposal

A proposta de transicao de fase foi criada em `docs/ops/whatsapp-provider-integration-phase-transition-proposal-board-decision-stub.md`.

Ela serve apenas para preparar uma eventual decisao futura sobre abrir nova fase formal. Nao autoriza execucao, nao altera o No-Go Ledger e nao levanta o freeze F2.23.

## Board Decision Stub

O Board Decision Stub padroniza campos minimos para uma decisao futura do board:

- `decisionId`;
- `date`;
- `requestedNextPhase`;
- `requester`;
- `approvers`;
- `decisionState`;
- `evidenceRefs`;
- `freezeStatus`;
- `providerBoundaryStatus`;
- `executionAuthorization`;
- `productionAuthorization`;
- `reasonCodes`;
- `nextActions`.

O stub nao e decisao real e nao autoriza producao.

## Decision states

- `no-go`
- `defer`
- `approve-to-open-next-phase-only`

Mesmo `approve-to-open-next-phase-only` permite apenas abrir uma proxima fase formal, sem execucao, sem producao, sem provider real, sem secret produtivo, sem webhook produtivo, sem mutacoes e sem side effects.

## Required approvals

- Board/executive sponsor.
- Security.
- Privacy/Compliance, se aplicavel.
- Platform governance.
- Backend/API.
- Product/Platform.
- DocOps.

## Required evidence

- F2.8-F2.23 indexadas.
- CI pos-merge verde.
- No-Go Ledger ativo.
- Final Readiness Freeze ativo.
- Security Review Gate.
- Executive Dossier.
- Board Packet.
- Evidencia futura especifica da fase proposta, quando existir.
- Prova de ausencia de provider real, secret produtivo, webhook produtivo, mutacoes e side effects nesta etapa.

## Conditions to open next phase

- F2.8-F2.23 indexadas e sem drift documental conhecido.
- F2.23 freeze ativo durante a avaliacao.
- F2.22 No-Go Ledger ativo durante a avaliacao.
- Required approvals presentes ou decisao `defer`/`no-go`.
- Required evidence completa.
- Escopo da proxima fase separado de execucao produtiva.
- Blocked execution actions preservadas.
- Board decision stub declarando nao-autorizacao de execucao e producao.
- Checks documentais obrigatorios verdes.
- Prova de isolamento das superficies proibidas.

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

Provider integration permanece `blocked`. F2.24 nao cria provider real, nao usa secret produtivo, nao habilita webhook produtivo, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes, nao cria `lead.create`, nao cria `lead.discard` e nao executa acao critica.

## Freeze continuity

F2.23 Final Readiness Freeze permanece ativo. F2.24 nao levanta freeze, nao levanta execution hold e nao altera o No-Go Ledger.

## Não-autorização de execução

F2.24 nao autoriza execucao, integracao, configuracao, teste com provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, lead action, acao critica ou side effect.

## Não-autorização produtiva

O Board Decision Stub nao e autorizacao de producao. Mesmo `approve-to-open-next-phase-only` permite apenas abrir uma proxima fase formal, sem execucao e sem producao.

## Checks executados

- `pnpm check:evidence-index`: passou.
  - `ok: true`
  - `refsChecked: 561`
- `pnpm check:docs-link-integrity`: passou.
  - `ok: true`
  - `filesChecked: 15`
- `git diff --check`: passou sem saida.
- `git diff -- .github/workflows release.yml apps packages scripts`: passou sem saida.

## Prova de isolamento

Escopo documental restrito aos arquivos esperados:

- `docs/ops/whatsapp-provider-integration-phase-transition-proposal-board-decision-stub.md`
- `ops/evidence/latest/f2-24-provider-integration-phase-transition-proposal-board-decision-stub-2026-07-15.md`
- `docs/EVIDENCE_INDEX.md`

O diff de isolamento confirmou ausencia de alteracoes em `.github/workflows`, `release.yml`, `apps`, `packages` ou `scripts`.

## Riscos residuais

- A proposta nao prova operacao de provider real.
- O Board Decision Stub nao substitui decisao futura real.
- F2.23 freeze permanece ativo.
- Gaps F2.16 permanecem bloqueadores ate evidencia futura.

## Próximos passos

- Manter provider integration em `blocked`.
- Usar F2.24 apenas como proposta/stub documental para eventual fase futura.

## Status final

Status: proposta/parcial evidenciada documentalmente.
