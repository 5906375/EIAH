# F2.13 — Read-Only Adapter Promotion Readiness Matrix — 2026-07-15

## Resumo executivo

F2.13 cria a Promotion Readiness Matrix documental do WhatsApp Adapter read-only em `docs/ops/whatsapp-read-only-adapter-promotion-readiness-matrix.md`. A matriz classifica estados `blocked`, `candidate` e `ready-for-review`, define gates obrigatorios, bloqueios absolutos, evidencias minimas, owners/escalation, rollback/disable, requisitos de observabilidade/SLO, synthetic healthcheck, contract compatibility, PII/sensitive safety e `sideEffects=0`.

Esta etapa nao declara WhatsApp operacional, nao declara provider integrado e nao trata readiness como autorizacao de producao.

## Pré-condição F2.12

Pre-condicao comprovada antes de qualquer alteracao:

- `CODEX.md` lido antes de qualquer acao.
- Branch local: `main`.
- F2.12 mergeada em `main`: `d65cf8c Merge pull request #288 from 5906375/test/f2-12-whatsapp-synthetic-healthcheck-contract-gate`.
- `origin/main` confirmado em `d65cf8c0c16d10cc9fc1dee14b829137f08366f0` via `git ls-remote origin main`.
- Workflows pos-merge consultados via GitHub Actions API para `head_sha=d65cf8c0c16d10cc9fc1dee14b829137f08366f0`:
  - `CI Monorepo`: run `29494798626`, `status=completed`, `conclusion=success`, URL `https://github.com/5906375/EIAH/actions/runs/29494798626`.
  - `IMOB Worker Mutation E2E`: run `29494798698`, `status=completed`, `conclusion=success`, URL `https://github.com/5906375/EIAH/actions/runs/29494798698`.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/ops/whatsapp-read-only-adapter-operational-runbook.md`
- `docs/ops/whatsapp-read-only-adapter-observability.md`
- `docs/ops/whatsapp-read-only-adapter-synthetic-healthcheck.md`
- `ops/evidence/latest/f2-08-read-only-adapter-contract-freeze-compatibility-gate-2026-07-15.md`
- `ops/evidence/latest/f2-09-read-only-adapter-operational-runbook-rollback-policy-2026-07-15.md`
- `ops/evidence/latest/f2-10-read-only-adapter-observability-metrics-slo-baseline-2026-07-15.md`
- `ops/evidence/latest/f2-11-read-only-adapter-synthetic-healthcheck-non-provider-dry-run-2026-07-15.md`
- `ops/evidence/latest/f2-12-read-only-adapter-synthetic-healthcheck-contract-gate-2026-07-15.md`

## Problema resolvido

F2.8-F2.12 provaram contrato, runbook, observabilidade, healthcheck e contract gate, mas ainda faltava uma matriz governada para classificar prontidao futura sem confundir proposta/readiness com autorizacao de producao. F2.13 resolve isso definindo estados e gates explicitos para qualquer avaliacao futura, mantendo provider real, secret produtivo, webhook produtivo e mutacoes como bloqueios absolutos.

## Estados de readiness

Estados definidos:

- `blocked`: qualquer gate ausente/falho/stale, drift de contrato, PII/sensivel, `sideEffects != 0`, provider real, secret produtivo, webhook produtivo ou mutacao coloca a matriz em bloqueio.
- `candidate`: estado documental/read-only para discussoes futuras quando F2.8-F2.12 existem, Evidence Index aponta para evidencias fisicas e checks documentais passam.
- `ready-for-review`: estado para revisao governada de owners, exigindo todos os gates de `candidate`, owners/escalation/rollback confirmados, SLO/healthcheck/contract gate verdes e ausencia de violacoes.

Estado atual declarado no documento: `candidate` documental/read-only, limitado a proposta/parcial evidenciada documentalmente.

## Gates obrigatórios

Gates definidos:

- Evidence Index aponta para evidencias fisicas F2.8-F2.12.
- Runbook F2.9 existe, tem owners/escalation e rollback/disable.
- Observability/SLO F2.10 existe, usa apenas campos sanitizados e preserva SLOs zero.
- Synthetic healthcheck F2.11 existe e permanece sem provider.
- Contract gate F2.12 passa localmente e preserva reasonCodes/status.
- Contrato `whatsapp.read_only.bundle_export.v1` preserva keyset, version, `piiMasked=true` e `sideEffects=0`.
- `pnpm check:evidence-index` passa.
- `pnpm check:docs-link-integrity` passa.
- `git diff --check` nao aponta drift.
- `git diff -- .github/workflows release.yml apps packages scripts` nao mostra alteracao fora de escopo.

## Bloqueios absolutos

Bloqueios absolutos definidos:

- provider WhatsApp real integrado sem etapa separada;
- secret produtivo usado ou referenciado;
- webhook produtivo habilitado;
- endpoint publico novo sem decisao explicita;
- dashboard obrigatorio, storage externo ou ledger produtivo obrigatorio como dependencia;
- mutacao executada;
- `lead.create` ou `lead.discard` executado;
- acao critica executada;
- `providerExternalCall > 0`;
- `mutationExternalSideEffect > 0`;
- `criticalActionExecution > 0`;
- `sideEffects != 0`;
- PII/sensivel em export, log, metrica, evidencia ou resultado serializado;
- `piiMasked != true`;
- drift do contrato `whatsapp.read_only.bundle_export.v1`;
- fail-open em assinatura, replay, duplicidade, binding, tenant, workspace, entitlement, sessao ou read-only mode;
- owner/escalation/rollback ausente.

## Evidências mínimas

Pacote minimo para `candidate`:

- F2.8 contract freeze/compatibility gate;
- F2.9 runbook/rollback policy;
- F2.10 observability/SLO baseline;
- F2.11 synthetic healthcheck/non-provider dry run;
- F2.12 synthetic healthcheck contract gate;
- Evidence Index atualizado com caminhos fisicos;
- checks documentais verdes.

Pacote minimo para `ready-for-review`:

- todos os itens de `candidate`;
- confirmacao atual de owners/escalation/rollback;
- resultado recente do synthetic healthcheck/contract gate;
- confirmacao recente de `sideEffects=0`, `providerExternalCall=0`, `mutationExternalSideEffect=0`, `criticalActionExecution=0`;
- confirmacao recente de ausencia de PII/sensiveis;
- registro explicito de que provider real, secret produtivo, webhook produtivo e mutacoes continuam ausentes.

## Owners/escalation

Owners/escalation herdados do runbook F2.9:

- Adapter/API: Backend/API owner -> Tech lead.
- Channel binding e replay guard: Platform governance owner -> Tech lead.
- Evidencia e runbook: DocOps owner -> Platform governance owner.
- Incidente de seguranca/PII: Security owner -> Founder/Executive owner.
- Decisao de ativacao produtiva futura: Product/Platform owner -> Founder/Executive owner.

Sem owner designado para a janela de avaliacao, o estado deve ser `blocked`.

## Rollback/disable requirements

Requisitos definidos:

- WA-RO-P0 e WA-RO-P1 exigem disable imediato.
- WA-RO-P2 exige rollback documental/contratual e reexecucao dos gates.
- WA-RO-P3 exige correcao DocOps antes de nova avaliacao.
- Incidentes devem registrar ambiente, owner, identificador sanitizado, `reasonCode`, `decisionClass`, status, `sideEffects`, PII masking, provider/mutacao boundary, decisao e checks pos-mitigacao.

## Observability/SLO requirements

Requisitos conectados a F2.10:

- `sideEffects violation = 0`;
- `PII leakage = 0`;
- `critical action execution = 0`;
- `provider external call = 0`;
- `mutation external side effect = 0`;
- `bundle export compatibility failures = 0`;
- `fail-closed coverage for invalid events = 100%`;
- `replay accepted after detection = 0`;
- `duplicate event accepted after detection = 0`;
- `binding bypass = 0`;
- `entitlement bypass = 0`.

Metricas, logs e evidencias devem usar apenas campos sanitizados de `evidenceBundle` e `bundleExport`.

## Synthetic healthcheck requirements

Requisitos conectados a F2.11/F2.12:

- sem provider real;
- sem secret produtivo;
- sem webhook produtivo;
- sem endpoint publico novo;
- fixtures deterministicas e sanitizadas;
- path `accepted_read_only`;
- paths fail-closed;
- reasonCodes/status;
- ausencia de PII/sensiveis;
- `sideEffects=0`;
- `providerExternalCall=0`;
- `mutationExternalSideEffect=0`;
- `criticalActionExecution=0`.

## Contract compatibility requirements

Requisitos conectados a F2.8/F2.12:

- keyset exato congelado em F2.8;
- `version=whatsapp.read_only.bundle_export.v1`;
- `decision`, `reasonCode`, `status`, `eventId`, `provider`, `messageType`, `tenantId`, `workspaceId`, `scope`;
- `sideEffects=0`;
- `piiMasked=true`;
- timestamps seguros;
- reasonCodes criticos exportaveis sem renomeacao;
- qualquer campo novo, remocao, renomeacao ou alteracao sem politica versionada bloqueia readiness.

## PII/sensitive data requirements

Campos proibidos:

- telefone bruto;
- `fromPhoneHash`;
- texto bruto da mensagem;
- `rawPayloadRef`;
- header de assinatura;
- segredo de assinatura ou secret produtivo;
- token, cookie ou Authorization;
- payload bruto de provider;
- qualquer campo fora do keyset congelado.

Qualquer violacao retorna o estado para `blocked`.

## Side-effect zero requirements

Requisitos:

- `sideEffects=0`;
- `providerExternalCall=0`;
- `mutationExternalSideEffect=0`;
- `criticalActionExecution=0`;
- `lead.create` e `lead.discard` bloqueados;
- qualquer tentativa de acao critica retorna fail-closed auditavel.

## Provider/mutation boundary

F2.13 nao integra provider WhatsApp real, nao usa secret produtivo, nao habilita webhook produtivo, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo, nao cria ledger produtivo obrigatorio, nao cria mutacoes, nao executa `lead.create`, nao executa `lead.discard` e nao executa acao critica.

## Checks executados

Saidas reais desta etapa:

```text
$ pnpm check:evidence-index
{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 210088,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 540
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

F2.13 nao altera:

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
- dashboard;
- storage externo;
- ledger produtivo obrigatorio;
- mutacoes;
- `lead.create`;
- `lead.discard`;
- acoes criticas.

## Riscos residuais

- A matriz e documental; nao substitui avaliacao tecnica futura nem validacao produtiva.
- `candidate` e `ready-for-review` nao autorizam producao.
- Qualquer futura integracao real exigira etapa separada, contrato versionado, evidencia real e decisao explicita de owners.

## Próximos passos

- Usar a matriz como checklist antes de qualquer proposta futura fora de read-only controlado.
- Manter F2.8-F2.12 como evidencias base.
- Em etapa futura separada, se houver proposta de provider real, criar nova matriz de risco, contrato e pacote de evidencia.

## Status final

Status: proposta/parcial evidenciada documentalmente.
