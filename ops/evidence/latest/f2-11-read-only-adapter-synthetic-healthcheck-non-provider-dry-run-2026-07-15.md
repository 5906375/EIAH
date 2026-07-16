# F2.11 — Read-Only Adapter Synthetic Healthcheck / Non-Provider Dry Run — 2026-07-15

## Resumo executivo

F2.11 define o healthcheck sintetico do WhatsApp Adapter read-only sem provider real, usando a suite canonica existente `apps/api/src/tests/whatsapp.webhook-read-only.test.ts` como dry run deterministico. A etapa e documental/operacional: cria `docs/ops/whatsapp-read-only-adapter-synthetic-healthcheck.md`, conecta o resultado ao baseline F2.10, preserva fixtures sanitizadas, valida paths `accepted_read_only` e `fail-closed`, reasonCodes/status, `sideEffects=0`, ausencia de PII/sensiveis, `providerExternalCall=0` e `mutationExternalSideEffect=0`, sem criar endpoint publico novo, provider real, secret produtivo, webhook produtivo, dashboard, storage, ledger, mutacao, `lead.create`, `lead.discard` ou acao critica.

## Pré-condição F2.10

Pre-condicao comprovada antes de qualquer alteracao:

- `CODEX.md` lido antes de qualquer acao.
- Branch local: `main`.
- F2.10 mergeada em `main`: `4a2428d Merge pull request #286 from 5906375/docs/f2-10-whatsapp-read-only-observability-slo`.
- `origin/main` confirmado em `4a2428d7652bafc19d100ce28e3a4299aec2bca6` via `git ls-remote origin main`.
- Workflows pos-merge consultados via GitHub Actions API para `head_sha=4a2428d7652bafc19d100ce28e3a4299aec2bca6`:
  - `CI Monorepo`: run `29491939647`, `status=completed`, `conclusion=success`, URL `https://github.com/5906375/EIAH/actions/runs/29491939647`.
  - `IMOB Worker Mutation E2E`: run `29491939599`, `status=completed`, `conclusion=success`, URL `https://github.com/5906375/EIAH/actions/runs/29491939599`.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/ops/whatsapp-read-only-adapter-operational-runbook.md`
- `docs/ops/whatsapp-read-only-adapter-observability.md`
- `apps/api/src/routes/whatsapp.ts`
- `apps/api/src/services/channelBinding.ts`
- `apps/api/src/services/replayGuard.ts`
- `apps/api/src/services/whatsappEvidenceBundle.ts`
- `apps/api/src/services/whatsappBundleExport.ts`
- `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`
- `ops/evidence/latest/f2-10-read-only-adapter-observability-metrics-slo-baseline-2026-07-15.md`

## Problema resolvido

F2.10 definiu metricas e SLO baseline, mas ainda faltava uma politica operacional clara para executar um healthcheck sintetico sem provider, sem webhook produtivo e sem efeitos externos. F2.11 resolve isso documentando o dry run canonico ja exercitado pela suite existente, evitando teste novo desnecessario, evitando orphan test novo e preservando o menor diff.

## Healthcheck sintético

O healthcheck sintetico usa chamada direta ao `handleWhatsappInboundWebhook` por fixture local, sem socket, sem provider externo e sem endpoint publico novo.

Validacoes obrigatorias:

- accepted read-only retorna `202 ACCEPTED_READ_ONLY`;
- fail-closed retorna status e `reasonCode` esperados;
- `evidenceBundle` e `bundleExport` sao emitidos;
- `sideEffects=0` em ambos;
- `piiMasked=true` no `bundleExport`;
- resultado serializado nao vaza PII/sensiveis;
- provider externo nao e chamado;
- mutacao externa nao e executada.

## Fixtures

Fixtures canonicas reaproveitadas do teste existente:

- `stubSecret=whatsapp-read-only-stub-secret-test`;
- `phoneHash` deterministico apenas para binding local;
- `baseTimestamp=2026-07-15T12:00:00.000Z`;
- `readOnlyScope=whatsapp:inbound:read_only`;
- `readOnlyEntitlement=channel.whatsapp.inbound.read_only`;
- `buildBindings()` com tenant/workspace/scope/entitlement/sessao;
- `buildBody()` com envelope `whatsapp.adapter.event.v1`;
- `buildHeaders()` com HMAC stub local;
- `invokeHandler()` com chamada direta ao handler.

## Accepted read-only path

Path aceito coberto:

- HTTP `202`;
- `reasonCode=ACCEPTED_READ_ONLY`;
- `evidenceBundle.decisionClass=accepted_read_only`;
- `bundleExport.decision=accepted_read_only`;
- `bundleExport.version=whatsapp.read_only.bundle_export.v1`;
- `bundleExport.piiMasked=true`;
- `evidenceBundle.sideEffects=0`;
- `bundleExport.sideEffects=0`;
- `data.readOnly=true`;
- `data.fallbackUsed=false`;
- telefone retornado mascarado.

## Fail-closed path

Paths fail-closed cobertos pela suite existente:

- `401 WHATSAPP_SIGNATURE_MISSING`;
- `401 WHATSAPP_SIGNATURE_INVALID`;
- `401 WHATSAPP_SIGNATURE_VERSION_UNSUPPORTED`;
- `401 WHATSAPP_TIMESTAMP_MISSING`;
- `401 WHATSAPP_TIMESTAMP_OUT_OF_WINDOW`;
- `400 WHATSAPP_EVENT_ID_MISSING`;
- `400 WHATSAPP_PROVIDER_UNSUPPORTED`;
- `400 WHATSAPP_MESSAGE_TYPE_UNSUPPORTED`;
- `400 WHATSAPP_PAYLOAD_INVALID`;
- `403 WHATSAPP_PHONE_NOT_BOUND`;
- `403 TENANT_NOT_RESOLVED`;
- `403 WORKSPACE_NOT_RESOLVED`;
- `403 ENTITLEMENT_REQUIRED`;
- `403 SESSION_EXPIRED`;
- `403 CRITICAL_ACTION_BLOCKED`;
- `403 READ_ONLY_MODE`;
- `409 WHATSAPP_REPLAY_DETECTED`;
- `409 WHATSAPP_EVENT_DUPLICATE`;
- `413 WHATSAPP_PAYLOAD_TOO_LARGE`.

## ReasonCodes/status

F2.11 nao renomeia reasonCodes. O healthcheck sintetico preserva a matriz existente de status/reasonCode e a protecao de reasonCodes criticos no `bundleExport`.

## Side-effect zero

Side-effect zero esperado:

- `evidenceBundle.sideEffects=0`;
- `bundleExport.sideEffects=0`;
- `providerExternalCall=0`;
- `mutationExternalSideEffect=0`;
- `criticalActionExecution=0`;
- `lead.create` bloqueado;
- `lead.discard` bloqueado.

## Provider/mutation boundary

F2.11 nao integra provider WhatsApp real, nao usa secret produtivo, nao habilita webhook produtivo, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes, nao executa acao critica e nao altera runtime/engine/launcher.

## PII/sensitive data policy

O dry run deve manter fora do resultado serializado:

- telefone bruto;
- `fromPhoneHash`;
- texto bruto da mensagem;
- `rawPayloadRef`;
- header de assinatura;
- segredo stub;
- secret produtivo;
- token, cookie ou Authorization;
- payload bruto de provider.

## Observability/SLO linkage

F2.11 conecta o healthcheck ao baseline F2.10:

- `accepted read-only` valida `whatsapp_read_only_accepted_total`;
- bloqueios por reasonCode validam `whatsapp_read_only_blocked_total`;
- replay/duplicidade validam metricas de replay e duplicate;
- binding/entitlement validam metricas de binding e entitlement;
- masking preserva `whatsapp_read_only_pii_masking_violation_total=0`;
- `sideEffects=0` preserva `whatsapp_read_only_side_effects_violation_total=0`;
- keyset/version do export preserva `bundle_export_compat_failure_total=0`;
- eventos invalidos bloqueados preservam `fail_closed_coverage_rate=100%`.

## Testes/documentação adicionados

Documentacao adicionada:

- `docs/ops/whatsapp-read-only-adapter-synthetic-healthcheck.md`

Teste novo:

- Nenhum. A cobertura foi mantida pela suite canonica existente `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`, evitando novo orphan test e evitando alteracao em `scripts/checkOrphanTests.ts` ou allowlist.

## Checks executados

Saidas reais desta etapa:

```text
$ pnpm check:orphan-tests
{
  "ok": true,
  "check": "check:orphan-tests",
  "totalTestFiles": 292,
  "orphanCount": 50,
  "allowlistedOrphanCount": 50,
  "blockingOrphanCount": 0,
  "staleAllowlistEntries": []
}
```

```text
$ node --import tsx --test apps/api/src/tests/whatsapp.webhook-read-only.test.ts
# tests 1
# pass 1
# fail 0
```

```text
$ node --import tsx --test apps/api/src/tests/channel-binding.test.ts
# tests 1
# pass 1
# fail 0
```

```text
$ node --import tsx --test apps/api/src/tests/replay-guard.test.ts
# tests 1
# pass 1
# fail 0
```

```text
$ pnpm check:evidence-index
{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 208360,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 537
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

F2.11 nao altera:

- `.github/workflows/**`;
- `release.yml`;
- `apps/**`;
- `packages/**`;
- `scripts/**`;
- runtime;
- engine;
- `ChatAgentLauncher`;
- provider real;
- secret produtivo;
- webhook produtivo;
- endpoint publico novo;
- dashboard obrigatorio;
- storage externo;
- ledger produtivo obrigatorio;
- mutacoes;
- `lead.create`;
- `lead.discard`;
- acoes criticas.

## Riscos residuais

- O healthcheck e sintetico/local; nao comprova disponibilidade de provider real nem webhook produtivo.
- Nao ha dashboard ou serie temporal obrigatoria nesta etapa.
- Qualquer healthcheck externo futuro precisa de etapa separada para boundary de rede, storage, credenciais e evidencia.

## Próximos passos

- Manter o dry run sintetico como validacao local/controlada do adapter read-only.
- Se houver promocao futura, criar etapa separada para healthcheck informativo em CI sem provider real.
- Reavaliar metricas somente apos decisao explicita de provider real ou dashboard informativo.

## Status final

Status: proposta/parcial evidenciada documentalmente
