# F2.12 — Read-Only Adapter Synthetic Healthcheck Contract Gate — 2026-07-15

## Resumo executivo

F2.12 cria um contract gate local para o synthetic healthcheck do WhatsApp Adapter read-only, ampliando a suite canonica existente `apps/api/src/tests/whatsapp.webhook-read-only.test.ts` sem criar arquivo novo de teste e sem ampliar allowlist de orphan tests. O gate valida fixture/baseline deterministica, path `accepted_read_only`, paths fail-closed, reasonCodes/status, `sideEffects=0`, `providerExternalCall=0`, `mutationExternalSideEffect=0`, `criticalActionExecution=0` e ausencia de PII/sensiveis no resultado serializado.

Esta etapa nao declara WhatsApp operacional.

## Pré-condição F2.11

Pre-condicao comprovada antes de qualquer alteracao:

- `CODEX.md` lido antes de qualquer acao.
- Branch local: `main`.
- F2.11 mergeada em `main`: `159ddbe Merge pull request #287 from 5906375/docs/f2-11-whatsapp-read-only-synthetic-healthcheck`.
- `origin/main` confirmado em `159ddbe56e5cc2f6f98187b207696f643d619508` via `git ls-remote origin main`.
- Workflows pos-merge consultados via GitHub Actions API para `head_sha=159ddbe56e5cc2f6f98187b207696f643d619508`:
  - `CI Monorepo`: run `29494087982`, `status=completed`, `conclusion=success`, URL `https://github.com/5906375/EIAH/actions/runs/29494087982`.
  - `IMOB Worker Mutation E2E`: run `29494088136`, `status=completed`, `conclusion=success`, URL `https://github.com/5906375/EIAH/actions/runs/29494088136`.

## Arquivos lidos

- `CODEX.md`
- `/home/jusall/.codex/attachments/ae0111d8-c12d-49ec-9d5a-94d7e8d15f77/pasted-text.txt`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/ops/whatsapp-read-only-adapter-operational-runbook.md`
- `docs/ops/whatsapp-read-only-adapter-observability.md`
- `docs/ops/whatsapp-read-only-adapter-synthetic-healthcheck.md`
- `apps/api/src/routes/whatsapp.ts`
- `apps/api/src/services/channelBinding.ts`
- `apps/api/src/services/replayGuard.ts`
- `apps/api/src/services/whatsappEvidenceBundle.ts`
- `apps/api/src/services/whatsappBundleExport.ts`
- `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`
- `apps/api/src/tests/channel-binding.test.ts`
- `apps/api/src/tests/replay-guard.test.ts`
- `scripts/unit-tests-manifest.txt`
- `package.json`
- `scripts/checkOrphanTests.ts`
- `ops/evidence/latest/f2-11-read-only-adapter-synthetic-healthcheck-non-provider-dry-run-2026-07-15.md`

## Problema resolvido

F2.11 definiu o dry run sintetico, mas ainda faltava um gate automatizado explicito que consolidasse o contrato minimo do healthcheck em uma verificacao local. F2.12 resolve isso com um subteste no arquivo canonico ja registrado, evitando novo orphan test e criando uma matriz objetiva de status, reasonCodes e contadores de fronteira.

## Contract gate

Gate adicionado:

- `WhatsApp webhook read-only: synthetic healthcheck contract gate`

Arquivo:

- `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`

O gate chama diretamente `handleWhatsappInboundWebhook` via helper local `invokeHandler()`, sem socket, sem endpoint publico novo, sem provider real, sem webhook produtivo e sem storage externo.

## Fixture/baseline

Baseline travada pelo gate:

- `fixtureVersion=whatsapp.synthetic_healthcheck.contract.v1`;
- `eventVersion=whatsapp.adapter.event.v1`;
- `bundleExportVersion=whatsapp.read_only.bundle_export.v1`;
- `provider=whatsapp`;
- `mode=read_only`;
- `scope=whatsapp:inbound:read_only`;
- `entitlement=channel.whatsapp.inbound.read_only`;
- `timestamp=2026-07-15T12:00:00.000Z`;
- `stubSecret` local de teste, sem secret produtivo;
- `phoneHash` usado somente para binding local e proibido no resultado serializado.

## Accepted path

Path aceito validado:

- status HTTP `202`;
- `reasonCode=ACCEPTED_READ_ONLY`;
- `decision=accepted_read_only`;
- `bundleExport.version=whatsapp.read_only.bundle_export.v1`;
- `bundleExport.sideEffects=0`;
- `bundleExport.piiMasked=true`;
- `data.fromPhoneMasked=+5***67`, sem telefone bruto.

## Fail-closed path

Paths fail-closed validados pelo contract gate:

- `401 WHATSAPP_SIGNATURE_INVALID`;
- `403 WHATSAPP_PHONE_NOT_BOUND`;
- `403 CRITICAL_ACTION_BLOCKED`;
- `403 READ_ONLY_MODE`;
- `409 WHATSAPP_REPLAY_DETECTED`;
- `409 WHATSAPP_EVENT_DUPLICATE`.

A suite canonica existente continua cobrindo tambem os demais paths documentados em F2.11, incluindo assinatura ausente, timestamp ausente/fora da janela, provider/messageType invalidos, payload invalido, tenant/workspace/entitlement ausentes, sessao expirada e payload acima do limite.

## ReasonCodes/status

O gate valida a matriz status/reasonCode do resumo sintetico:

- `202 ACCEPTED_READ_ONLY`;
- `401 WHATSAPP_SIGNATURE_INVALID`;
- `403 WHATSAPP_PHONE_NOT_BOUND`;
- `403 CRITICAL_ACTION_BLOCKED`;
- `403 READ_ONLY_MODE`;
- `409 WHATSAPP_REPLAY_DETECTED`;
- `409 WHATSAPP_EVENT_DUPLICATE`.

Todos os bloqueios exigem `decision=blocked`, `sideEffects=0` e `piiMasked=true`.

## Side-effect zero

Politica preservada:

- `accepted.bundleExport.sideEffects=0`;
- todo path fail-closed validado com `bundleExport.sideEffects=0`;
- `providerExternalCall=0`;
- `mutationExternalSideEffect=0`;
- `criticalActionExecution=0`.

## Provider/mutation boundary

F2.12 nao integra provider WhatsApp real, nao usa secret produtivo, nao habilita webhook produtivo, nao cria endpoint publico novo, nao cria dashboard, nao cria storage externo, nao cria ledger produtivo obrigatorio e nao executa mutacoes.

## Critical action boundary

O gate valida tentativa `action=lead.create` apenas como fixture local bloqueada:

- status HTTP `403`;
- `reasonCode=CRITICAL_ACTION_BLOCKED`;
- `decision=blocked`;
- `sideEffects=0`;
- `criticalActionExecution=0`.

Nenhuma acao critica e executada.

## PII/sensitive data policy

O gate adiciona `assertNoSyntheticHealthcheckSensitiveData()` e bloqueia vazamento serializado de:

- `fromPhoneHash`;
- `phoneHash` deterministico;
- segredo stub;
- header de assinatura;
- telefone bruto;
- texto bruto da mensagem;
- `rawPayloadRef`;
- `Authorization`;
- `Cookie`;
- `Bearer`.

O resultado permitido permanece limitado a campos sanitizados de `evidenceBundle`, `bundleExport` e `data.fromPhoneMasked` mascarado.

## Testes adicionados/ajustados

Teste ajustado:

- `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`

Subteste adicionado:

- `WhatsApp webhook read-only: synthetic healthcheck contract gate`

Teste novo:

- Nenhum.

## Orphan test compliance

F2.12 escolheu a Opcao A: ampliar teste existente ja registrado em `scripts/unit-tests-manifest.txt` e referenciado por `package.json`. Nao houve novo arquivo `.test.ts`, nao houve alteracao em `scripts/checkOrphanTests.ts` e nao houve ampliacao de allowlist.

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
  "sizeChars": 209180,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 538
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
diff somente em apps/api/src/tests/whatsapp.webhook-read-only.test.ts, arquivo esperado da Opcao A.
Sem diff em .github/workflows, release.yml, packages ou scripts.
```

## Prova de isolamento

F2.12 nao altera:

- `.github/workflows/**`;
- `release.yml`;
- `packages/**`;
- `scripts/**`;
- runtime;
- engine;
- `ChatAgentLauncher`;
- provider real;
- secret produtivo;
- webhook produtivo;
- endpoint publico novo;
- dashboard;
- storage externo;
- ledger produtivo obrigatorio;
- mutacoes;
- `lead.create`;
- `lead.discard`;
- acoes criticas.

## Riscos residuais

- O gate e local/sintetico; nao prova operacao com provider real.
- Os contadores `providerExternalCall`, `mutationExternalSideEffect` e `criticalActionExecution` sao invariantes do contract gate local, nao metricas produtivas coletadas de infraestrutura externa.
- Qualquer futura integracao real exigira nova etapa, novo contrato e nova evidencia.

## Próximos passos

- Manter o gate no arquivo canonico enquanto o adapter permanecer em read-only controlado.
- Se uma etapa futura criar teste dedicado, registrar canonicamente em manifest/package sem ampliar allowlist.
- Antes de qualquer ativacao real, exigir provider, secret, webhook, replay/idempotencia, HITL/ledger quando aplicavel e evidencia propria.

## Status final

Status: parcial/evidenciado localmente.
