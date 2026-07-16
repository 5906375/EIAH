# F2.18 — Provider Integration Threat Model / Abuse Case Register — 2026-07-15

## Resumo executivo

Foi criado o Provider Integration Threat Model / Abuse Case Register para uma integracao futura hipotetica de provider WhatsApp.

F2.18 e threat-model-only, nao autoriza execucao e mantem provider integration em `blocked`.

## Pré-condição F2.17

Pre-condicao comprovada antes das alteracoes:

- F2.17 mergeada em `main` no commit `3c2b71f0f07bca53c387309cbd9371deb953a74b`.
- `CI Monorepo`: `completed success`, run `29498835067`.
- `IMOB Worker Mutation E2E`: `completed success`, run `29498835058`.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/ops/whatsapp-provider-integration-design-brief-non-execution-plan.md`
- `docs/ops/whatsapp-read-only-adapter-pre-provider-gap-register.md`
- `docs/ops/whatsapp-read-only-adapter-evidence-closure-pre-provider-boundary.md`
- `docs/ops/whatsapp-read-only-adapter-observability.md`
- `docs/ops/whatsapp-read-only-adapter-operational-runbook.md`
- `ops/evidence/latest/f2-17-provider-integration-design-brief-non-execution-plan-2026-07-15.md`

## Problema resolvido

F2.17 descreveu uma arquitetura futura hipotetica e um non-execution plan, mas ainda faltava um threat model com assets, trust boundaries, threat actors, attack surfaces, abuse cases, controles, detections e respostas fail-closed.

F2.18 resolve essa lacuna documental, sem cruzar a fronteira pre-provider.

## Assets protegidos

- Tenant, workspace, scope e entitlement.
- Contrato `whatsapp.read_only.bundle_export.v1`.
- `eventId`, timestamps e trilha de replay/idempotencia.
- `evidenceBundle` e `bundleExport` sanitizados.
- Secret de assinatura futuro e seu ciclo de vida.
- Boundary de webhook produtivo futuro.
- Logs, metricas, evidencias e incident records.
- PII/sensiveis: telefone bruto, texto bruto, payload bruto, assinatura, token, cookie e Authorization.
- Garantias `sideEffects=0`, `providerExternalCall=0`, `mutationExternalSideEffect=0` e `criticalActionExecution=0`.

## Trust boundaries

- Provider externo -> webhook.
- Webhook -> verificacao de evento.
- Verificacao -> adapter read-only.
- Adapter -> tenant/workspace/entitlement.
- Adapter -> observability/evidence.
- Runtime -> mutacoes/acoes criticas.
- Secrets -> runtime.

Todos permanecem bloqueados ou conceituais para provider real em F2.18.

## Threat actors

- Atacante externo enviando eventos falsos.
- Cliente ou integracao tentando replay/duplicidade.
- Integracao mal configurada do provider.
- Operador interno com configuracao incorreta de secret/webhook.
- Tenant tentando acessar workspace ou scope de outro tenant.
- Usuario tentando executar acao critica via payload.
- Observability consumer expondo PII.
- Processo de deploy/promocao sem decision record.

## Attack surfaces

- Webhook produtivo futuro.
- Header de assinatura e timestamp.
- `eventId` e idempotencia.
- Payload provider bruto.
- Parsing e validacao de schema.
- Channel binding e resolucao tenant/workspace.
- Entitlement/scope checks.
- Evidence bundle, bundle export, logs e metricas.
- Secret management e variaveis de ambiente.
- Rollback/disable e roteamento externo.
- Promotion decision record e gates documentais.

## Abuse case register

O abuse case register cobre os casos minimos exigidos:

- spoofed provider event;
- invalid signature;
- replay attack;
- duplicate event;
- payload tampering;
- oversized payload;
- malformed payload;
- timestamp manipulation;
- eventId collision;
- secret exposure;
- PII leakage;
- tenant/workspace confusion;
- entitlement bypass attempt;
- critical action attempt;
- mutation attempt;
- observability blind spot;
- rollback unavailable;
- decision record missing.

Cada abuse case foi mapeado para boundary, controles requeridos, detection signals, fail-closed response e reasonCode.

## Controles requeridos

- Assinatura obrigatoria e verificacao antes de parse confiavel.
- Janela de timestamp, replay guard e idempotencia por `eventId`.
- Limite de payload antes de parsing.
- Schema validation estrita.
- Provider allowlist por ambiente autorizado.
- Binding tenant/workspace/scope em modo fail-closed.
- Entitlement obrigatorio.
- Masking e allowlist de campos em logs, metricas, bundles e evidencias.
- Secret management com segregacao por ambiente, rotacao, revogacao e redaction.
- Rollback/disable validado antes de qualquer execucao futura.
- Promotion Decision Record aprovado antes de qualquer tentativa de execucao.
- Mutacoes e acoes criticas bloqueadas por default.

## Detection signals

- Assinatura invalida/ausente.
- Replay/duplicidade.
- Payload tampered, malformed ou too large.
- Timestamp fora da janela.
- Colisao de `eventId`.
- Tenant/workspace/scope divergente.
- Entitlement bypass attempt.
- Critical action ou mutation attempt.
- Violacao de PII/masking.
- Secret em log/evidencia.
- Ausencia de metricas obrigatorias.
- Rollback/disable ausente.
- Decision record ausente.

## Fail-closed responses

- Rejeitar eventos sem assinatura valida.
- Bloquear replay, duplicidade e eventId collision.
- Bloquear payload invalido, adulterado ou oversized antes de side effects.
- Bloquear tenant/workspace/scope/entitlement ausentes ou divergentes.
- Bloquear qualquer mutacao, `lead.create`, `lead.discard` ou acao critica.
- Bloquear promocao com blind spot de observabilidade, rollback indisponivel ou decision record ausente.
- Acionar disable/rollback quando houver PII leakage, secret exposure, side effect ou fail-open.

## ReasonCodes

- `PROVIDER_THREAT_MODEL_ONLY`
- `PROVIDER_SECURITY_REVIEW_REQUIRED`
- `PROVIDER_SIGNATURE_INVALID`
- `PROVIDER_REPLAY_DETECTED`
- `PROVIDER_PAYLOAD_TAMPERED`
- `PROVIDER_PAYLOAD_TOO_LARGE`
- `PROVIDER_SECRET_EXPOSURE_RISK`
- `PROVIDER_PII_LEAKAGE_RISK`
- `PROVIDER_TENANT_SCOPE_CONFUSION`
- `PROVIDER_ENTITLEMENT_BYPASS_ATTEMPT`
- `PROVIDER_CRITICAL_ACTION_BLOCKED`
- `PROVIDER_MUTATION_BLOCKED`
- `PROVIDER_ROLLBACK_REQUIRED`

## Residual risks

- Este threat model nao prova seguranca operacional de provider real.
- Controles permanecem requisitos documentais ate existir implementacao futura separada.
- Gaps F2.16 permanecem bloqueadores.
- F2.17 permanece design-only e F2.18 permanece threat-model-only.
- Qualquer execucao futura sem security review e decision record deve permanecer bloqueada.

## Provider integration boundary

Provider integration permanece `blocked`. F2.18 nao cria provider real, nao usa secret produtivo, nao habilita webhook produtivo, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes, nao cria `lead.create`, nao cria `lead.discard` e nao executa acao critica.

## Não-autorização de execução

F2.18 nao autoriza execucao, integracao, configuracao, teste com provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, lead action, acao critica ou side effect.

## Checks executados

- `pnpm check:evidence-index`: passou.
  - `ok: true`
  - `refsChecked: 549`
- `pnpm check:docs-link-integrity`: passou.
  - `ok: true`
  - `filesChecked: 15`
- `git diff --check`: passou sem saida.
- `git diff -- .github/workflows release.yml apps packages scripts`: passou sem saida.

## Prova de isolamento

Escopo documental restrito aos arquivos esperados:

- `docs/ops/whatsapp-provider-integration-threat-model-abuse-case-register.md`
- `ops/evidence/latest/f2-18-provider-integration-threat-model-abuse-case-register-2026-07-15.md`
- `docs/EVIDENCE_INDEX.md`

Nao foram planejadas alteracoes em `.github/workflows`, `release.yml`, `apps`, `packages` ou `scripts`.

O diff de isolamento confirmou ausencia de alteracoes nessas superficies.

## Próximos passos

- Executar checks obrigatorios.
- Manter provider integration em `blocked`.
- Usar F2.18 apenas como threat model / abuse case register documental para revisoes futuras.

## Status final

Status: proposta/parcial evidenciada documentalmente.
