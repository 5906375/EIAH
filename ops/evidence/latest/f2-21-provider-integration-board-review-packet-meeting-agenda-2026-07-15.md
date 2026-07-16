# F2.21 — Provider Integration Board Review Packet / Meeting Agenda — 2026-07-15

## Resumo executivo

Foi criado o Board Review Packet / Meeting Agenda para uma eventual revisao de board da integracao hipotetica de provider WhatsApp.

F2.21 nao autoriza execucao, nao autoriza producao e mantem provider integration em `blocked`.

## Pré-condição F2.20

Pre-condicao comprovada antes das alteracoes:

- F2.20 mergeada em `main` no commit `1cc128e38ef2baf1665b5650fa9fae640e098ad8`.
- `CI Monorepo`: `completed success`, run `29502215149`.
- `IMOB Worker Mutation E2E`: `completed success`, run `29502215074`.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/ops/whatsapp-provider-integration-evidence-pack-executive-review-dossier.md`
- `docs/ops/whatsapp-provider-integration-security-review-checklist-approval-gate.md`
- `docs/ops/whatsapp-provider-integration-threat-model-abuse-case-register.md`
- `docs/ops/whatsapp-provider-integration-design-brief-non-execution-plan.md`
- `docs/ops/whatsapp-read-only-adapter-pre-provider-gap-register.md`
- `ops/evidence/latest/f2-20-provider-integration-evidence-pack-executive-review-dossier-2026-07-15.md`

## Problema resolvido

F2.20 consolidou o evidence pack executivo, mas ainda faltava um packet especifico para reuniao de board, com attendees, decision scope, pre-read, evidence checklist, agenda, decision options e non-decision items.

F2.21 resolve essa lacuna documental sem cruzar a fronteira pre-provider.

## Board review packet

O packet foi criado em `docs/ops/whatsapp-provider-integration-board-review-packet-meeting-agenda.md`.

Ele organiza os materiais e criterios para que o board avalie apenas uma proxima revisao governada, preservando:

- provider integration `blocked`;
- board review sem autorizacao produtiva;
- F2.21 sem autorizacao de execucao;
- provider real, secret produtivo, webhook produtivo, mutacoes e side effects bloqueados.

## Meeting agenda

A agenda cobre:

- context;
- evidence review;
- open gaps;
- risk posture;
- security posture;
- privacy posture;
- operational posture;
- provider boundary;
- decision framing;
- next actions.

Cada topico tem owner sugerido e saida esperada para evitar decisao ambigua ou promocao indevida.

## Required attendees

- Executive sponsor.
- Security.
- Backend/API.
- Platform governance.
- Product/Platform.
- DocOps.
- Privacy/Compliance, se aplicavel.

Ausencia de attendee obrigatorio bloqueia `approve-for-next-review-only` e deve gerar `BOARD_REQUIRED_ATTENDEE_MISSING`, `BOARD_SECURITY_REVIEW_MISSING` ou `BOARD_PRIVACY_REVIEW_MISSING`, conforme aplicavel.

## Decision scope

O board pode decidir apenas:

- `no-go`;
- `defer`;
- `approve-for-next-review-only`.

O board nao pode autorizar execucao, producao, provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacoes, `lead.create`, `lead.discard`, acao critica ou side effects.

## Pre-read materials

- `docs/ops/whatsapp-provider-integration-evidence-pack-executive-review-dossier.md`
- `docs/ops/whatsapp-provider-integration-security-review-checklist-approval-gate.md`
- `docs/ops/whatsapp-provider-integration-threat-model-abuse-case-register.md`
- `docs/ops/whatsapp-provider-integration-design-brief-non-execution-plan.md`
- `docs/ops/whatsapp-read-only-adapter-pre-provider-gap-register.md`
- `ops/evidence/latest/f2-20-provider-integration-evidence-pack-executive-review-dossier-2026-07-15.md`

## Evidence checklist

O checklist exige confirmar:

- pre-read materials fisicos;
- Evidence Index atualizado;
- F2.8-F2.20 referenciadas sem drift;
- gaps F2.16 explicitamente abertos ou fechados com evidencia;
- F2.19 security review nao produtivo;
- F2.20 executive review nao produtivo;
- provider integration `blocked`;
- ausencia de PII/sensiveis e secrets;
- `sideEffects=0`, `providerExternalCall=0`, `mutationExternalSideEffect=0` e `criticalActionExecution=0`.

## Open gaps

- Provider real nao selecionado nem autorizado.
- Secret boundary produtivo nao aprovado/provisionado.
- Webhook produtivo nao aprovado/habilitado.
- Rollback/disable real de provider nao provado.
- Observability/SLO produtiva de provider nao ativa.
- Privacy/PII review de provider real nao concluido.
- Security review nao produtivo.
- Promotion Decision Record produtivo ausente.
- Gaps F2.16 `blocking` ainda aplicaveis.

## Decision options

| Opcao | Efeito |
| --- | --- |
| `no-go` | Nenhum efeito de execucao; mantem provider integration `blocked`. |
| `defer` | Nenhum efeito de execucao; registra pendencias, owners e nova revisao. |
| `approve-for-next-review-only` | Permite apenas preparar proxima revisao governada em escopo separado. |

## Non-decision items

F2.21 nao decide:

- producao;
- provider WhatsApp real;
- provider selection;
- secret produtivo;
- webhook produtivo;
- endpoint publico novo;
- dashboard/storage/ledger produtivo obrigatorio;
- mutacoes, `lead.create` ou `lead.discard`;
- acao critica;
- alteracao em `ChatAgentLauncher`, runtime, engine, workflows, `release.yml`, apps, packages ou scripts.

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

Provider integration permanece `blocked`. F2.21 nao cria provider real, nao usa secret produtivo, nao habilita webhook produtivo, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes, nao cria `lead.create`, nao cria `lead.discard` e nao executa acao critica.

## Não-autorização de execução

F2.21 nao autoriza execucao, integracao, configuracao, teste com provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, lead action, acao critica ou side effect.

## Não-autorização produtiva

Board review nao e autorizacao de producao. Mesmo uma decisao `approve-for-next-review-only` permite apenas uma proxima revisao documental, em etapa separada, com novo escopo e nova evidencia.

## Checks executados

- `pnpm check:evidence-index`: passou.
  - `ok: true`
  - `refsChecked: 555`
- `pnpm check:docs-link-integrity`: passou.
  - `ok: true`
  - `filesChecked: 15`
- `git diff --check`: passou sem saida.
- `git diff -- .github/workflows release.yml apps packages scripts`: passou sem saida.

## Prova de isolamento

Escopo documental restrito aos arquivos esperados:

- `docs/ops/whatsapp-provider-integration-board-review-packet-meeting-agenda.md`
- `ops/evidence/latest/f2-21-provider-integration-board-review-packet-meeting-agenda-2026-07-15.md`
- `docs/EVIDENCE_INDEX.md`

Nao foram planejadas alteracoes em `.github/workflows`, `release.yml`, `apps`, `packages` ou `scripts`.

O diff de isolamento confirmou ausencia de alteracoes nessas superficies.

## Riscos residuais

- O packet nao prova operacao de provider real.
- Board review nao substitui decision record futuro.
- Gaps F2.16 permanecem bloqueadores ate evidencia futura.
- Security review F2.19 e executive review F2.20 nao autorizam producao.

## Próximos passos

- Executar checks obrigatorios.
- Manter provider integration em `blocked`.
- Usar F2.21 apenas como board review packet / meeting agenda para revisoes futuras.

## Status final

Status: proposta/parcial evidenciada documentalmente.
