# F2.10 — Read-Only Adapter Observability Metrics / SLO Baseline — 2026-07-15

## Resumo executivo

F2.10 cria a baseline documental de observabilidade e SLOs iniciais do WhatsApp Adapter read-only. A etapa define metricas sanitizadas, SLO baseline, thresholds de alerta/degradacao, mapeamento para incident classes F2.9, politica de PII/sensitives, politica `sideEffects=0` e boundary de provider/mutacao. Nao houve integracao com provider real, uso de secret produtivo, webhook produtivo, dashboard obrigatorio, storage externo, ledger produtivo, mutacao, `lead.create`, `lead.discard`, acao critica, runtime, engine, `ChatAgentLauncher`, workflows, `release.yml`, packages ou scripts.

## Pré-condição F2.9

Pre-condicao comprovada antes de qualquer alteracao:

- `CODEX.md` lido antes de qualquer acao.
- Branch local: `main`.
- F2.9 mergeada em `main`: `6da137a Merge pull request #285 from 5906375/docs/f2-9-whatsapp-read-only-runbook-rollback-policy`.
- `origin/main` confirmado em `6da137a190b0abc53789480be77ed9b9dcddc008` via `git ls-remote origin main`.
- Workflows pos-merge consultados via GitHub Actions API para `head_sha=6da137a190b0abc53789480be77ed9b9dcddc008`:
  - `CI Monorepo`: run `29488956135`, `status=completed`, `conclusion=success`, URL `https://github.com/5906375/EIAH/actions/runs/29488956135`.
  - `IMOB Worker Mutation E2E`: run `29488956029`, `status=completed`, `conclusion=success`, URL `https://github.com/5906375/EIAH/actions/runs/29488956029`.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/ops/whatsapp-read-only-adapter-operational-runbook.md`
- `apps/api/src/routes/whatsapp.ts`
- `apps/api/src/services/channelBinding.ts`
- `apps/api/src/services/replayGuard.ts`
- `apps/api/src/services/whatsappEvidenceBundle.ts`
- `apps/api/src/services/whatsappBundleExport.ts`
- `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`
- `ops/evidence/latest/f2-09-read-only-adapter-operational-runbook-rollback-policy-2026-07-15.md`

## Problema resolvido

F2.9 definiu runbook operacional, rollback/disable policy e incident classes, mas ainda faltava uma baseline explicita de observabilidade para acompanhar o adapter read-only sem introduzir provider real, secret produtivo, webhook produtivo, dashboard obrigatorio, storage externo, ledger produtivo ou mutacoes.

F2.10 resolve essa lacuna criando `docs/ops/whatsapp-read-only-adapter-observability.md`, com metricas derivadas apenas de `evidenceBundle` e `bundleExport`, ambos sanitizados e ja protegidos por F2.6-F2.8.

## Métricas read-only

Metricas definidas:

- `whatsapp_read_only_inbound_events_total`
- `whatsapp_read_only_accepted_total`
- `whatsapp_read_only_accepted_rate`
- `whatsapp_read_only_blocked_total`
- `whatsapp_read_only_blocked_rate`
- `whatsapp_read_only_signature_missing_total`
- `whatsapp_read_only_signature_invalid_total`
- `whatsapp_read_only_timestamp_out_of_window_total`
- `whatsapp_read_only_replay_detected_total`
- `whatsapp_read_only_duplicate_event_total`
- `whatsapp_read_only_phone_not_bound_total`
- `whatsapp_read_only_tenant_unresolved_total`
- `whatsapp_read_only_workspace_unresolved_total`
- `whatsapp_read_only_entitlement_required_total`
- `whatsapp_read_only_critical_action_blocked_total`
- `whatsapp_read_only_mode_violation_total`
- `whatsapp_read_only_payload_invalid_total`
- `whatsapp_read_only_payload_too_large_total`
- `whatsapp_read_only_pii_masking_violation_total`
- `whatsapp_read_only_side_effects_violation_total`
- `whatsapp_read_only_bundle_export_compat_failure_total`
- `whatsapp_read_only_provider_external_call_total`
- `whatsapp_read_only_mutation_external_side_effect_total`
- `whatsapp_read_only_fail_closed_coverage_rate`

Dimensoes permitidas foram limitadas a campos sanitizados: `reasonCode`, `status`, `provider`, `messageType`, `tenantId`, `workspaceId` e `scope`, quando ja presentes no export seguro.

## SLO baseline

Baseline inicial definida:

- `sideEffects violation = 0`
- `PII leakage = 0`
- `critical action execution = 0`
- `provider external call = 0`
- `mutation external side effect = 0`
- `bundle export compatibility failures = 0`
- `fail-closed coverage for invalid events = 100%`
- `replay accepted after detection = 0`
- `duplicate event accepted after detection = 0`
- `binding bypass = 0`
- `entitlement bypass = 0`

## Thresholds

Thresholds definidos:

- qualquer `sideEffects != 0`: WA-RO-P0;
- qualquer PII/sensivel em export, log ou metrica: WA-RO-P0;
- qualquer acao critica executada: WA-RO-P0;
- qualquer chamada externa a provider real antes de autorizacao futura: WA-RO-P0;
- qualquer mutacao externa: WA-RO-P0;
- qualquer evento invalido aceito: WA-RO-P1;
- qualquer replay aceito depois de detectado: WA-RO-P1;
- qualquer evento duplicado aceito depois de detectado: WA-RO-P1;
- qualquer binding ausente aceito: WA-RO-P1;
- qualquer entitlement ausente aceito: WA-RO-P1;
- qualquer drift do keyset do `bundleExport`: WA-RO-P2;
- qualquer `piiMasked != true`: WA-RO-P2;
- runbook/evidencia sem owner ou sem status: WA-RO-P3.

## Incident mapping

Mapeamento criado:

- WA-RO-P0: side effects, PII, provider externo, mutacao externa, acao critica executada.
- WA-RO-P1: fail-closed quebrado em assinatura, timestamp, replay, duplicidade, binding, tenant/workspace, entitlement ou acao critica.
- WA-RO-P2: drift do contrato `whatsapp.read_only.bundle_export.v1`, `piiMasked != true`, keyset extra ou version divergente.
- WA-RO-P3: degradacao DocOps, evidencia ausente, runbook sem owner ou thresholds desconectados.

## Runbook linkage

F2.10 conecta os thresholds ao runbook F2.9:

- WA-RO-P0 e WA-RO-P1 seguem disable imediato.
- WA-RO-P2 segue rollback documental/contratual e reexecucao dos gates de compatibilidade.
- WA-RO-P3 exige correcao DocOps antes de qualquer promocao.
- Toda investigacao preserva somente logs sanitizados, `eventId`, `reasonCode`, `decisionClass`, `status`, `sideEffects` e timestamps.

Arquivo conectado:

- `docs/ops/whatsapp-read-only-adapter-operational-runbook.md`

## PII/sensitive data policy

F2.10 define que metricas, logs, evidencias e dashboards futuros nao podem conter:

- telefone bruto;
- `fromPhoneHash`;
- texto bruto da mensagem;
- `rawPayloadRef`;
- header de assinatura;
- segredo de assinatura;
- payload bruto do provider;
- token, cookie ou Authorization;
- campo fora do keyset congelado de `whatsapp.read_only.bundle_export.v1`.

O `bundleExport` deve manter `piiMasked=true`.

## Side-effect zero policy

F2.10 preserva:

- `sideEffects=0`;
- `provider_external_call_total=0`;
- `mutation_external_side_effect_total=0`;
- `critical_action_execution=0`;
- `lead.create` bloqueado;
- `lead.discard` bloqueado;
- fail-closed para qualquer tentativa de mutacao ou acao critica.

## Provider/mutation boundary

Esta etapa nao instala provider real, nao usa secret produtivo, nao habilita webhook produtivo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio e nao executa mutacoes.

Qualquer futura mudanca dessa fronteira exige etapa separada, decisao explicita, contrato versionado, evidencia real e revisao dos SLOs.

## Checks executados

Saidas reais desta etapa:

```text
$ pnpm check:evidence-index
{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 207467,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 535
}
```

```text
$ pnpm check:docs-link-integrity
{
  "ok": true,
  "check": "check:docs-link-integrity",
  "filesChecked": 15
}
```

```text
$ git diff --check
sem saida
```

```text
$ git diff -- .github/workflows release.yml apps packages scripts
sem saida
```

## Prova de isolamento

F2.10 nao altera:

- `.github/workflows/**`
- `release.yml`
- `apps/**`
- `packages/**`
- `scripts/**`
- runtime
- engine
- `ChatAgentLauncher`
- provider real
- secret produtivo
- webhook produtivo
- dashboard obrigatorio
- storage externo
- ledger produtivo obrigatorio
- mutacoes
- `lead.create`
- `lead.discard`
- acoes criticas

## Riscos residuais

- A baseline e documental/operacional; nao cria endpoint Prometheus, dashboard ou storage de metricas.
- `fail_closed_coverage_rate` depende de execucoes futuras da matriz negativa para serie temporal.
- Thresholds podem precisar de refinamento quando houver provider real autorizado em etapa separada.

## Próximos passos

- Em etapa futura separada, se autorizado, criar export recorrente das metricas sanitizadas sem incluir PII/sensitives.
- Avaliar dashboard informativo somente depois de manter provider real e mutacoes fora de escopo ou de obter autorizacao explicita.
- Manter os SLOs de zero violacao como bloqueantes para qualquer promocao futura.

## Status final

Status: proposta/parcial evidenciada documentalmente.
