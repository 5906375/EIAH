# F2.14 — Read-Only Adapter Promotion Decision Record Template — 2026-07-15

## Resumo executivo

F2.14 cria o template documental de Promotion Decision Record do WhatsApp Adapter read-only em `docs/ops/whatsapp-read-only-adapter-promotion-decision-record-template.md`. O template define campos obrigatorios, estados de decisao, reasonCodes, referencias obrigatorias F2.8-F2.13, owners/human approval, rollback/disable, observability/SLO, synthetic healthcheck, contract gate, PII/sensitive safety, `sideEffects=0` e provider/mutation boundary.

O template nao autoriza producao, nao autoriza provider real e nao transforma readiness em aprovacao produtiva. O unico estado positivo permitido e `approved-for-next-review-only`, limitado a uma proxima revisao governada em etapa separada.

## Pré-condição F2.13

Pre-condicao comprovada antes de qualquer alteracao:

- `CODEX.md` lido antes de qualquer acao.
- Branch local: `main`.
- F2.13 mergeada em `main`: `7323aa9 Merge pull request #289 from 5906375/docs/f2-13-whatsapp-readiness-matrix`.
- `origin/main` confirmado em `7323aa9b7438441f108ecb476e18602c243554ac` via `git ls-remote origin main`.
- Workflows pos-merge consultados via GitHub Actions API para `head_sha=7323aa9b7438441f108ecb476e18602c243554ac`:
  - `CI Monorepo`: run `29495314996`, `status=completed`, `conclusion=success`, URL `https://github.com/5906375/EIAH/actions/runs/29495314996`.
  - `IMOB Worker Mutation E2E`: run `29495315007`, `status=completed`, `conclusion=success`, URL `https://github.com/5906375/EIAH/actions/runs/29495315007`.

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
- `docs/ops/whatsapp-read-only-adapter-promotion-readiness-matrix.md`
- `ops/evidence/latest/f2-13-read-only-adapter-promotion-readiness-matrix-2026-07-15.md`

## Problema resolvido

F2.13 criou a matriz de readiness, mas ainda faltava um formato governado para registrar decisoes futuras sem permitir ambiguidade entre readiness, revisao e autorizacao produtiva. F2.14 resolve isso com um template que exige todos os campos criticos, referencias F2.8-F2.13, aprovacao humana e provas de rollback, observability, healthcheck, contract gate, PII safety, side-effect zero e provider boundary.

## Template criado

Arquivo criado:

- `docs/ops/whatsapp-read-only-adapter-promotion-decision-record-template.md`

O template inclui uma estrutura canonica em YAML e regras de validacao minima. O campo `nonProductionAuthorization` fixa todos os indicadores produtivos como `false`:

- `productionAuthorized=false`;
- `providerRealAuthorized=false`;
- `productiveSecretAuthorized=false`;
- `productiveWebhookAuthorized=false`;
- `mutationAuthorized=false`.

## Campos obrigatórios

Campos obrigatorios definidos:

- `decisionId`
- `date`
- `requester`
- `owners`
- `tenantId`
- `workspaceId`
- `scope`
- `readinessState`
- `evidenceRefs`
- `riskAssessment`
- `rollbackReference`
- `disablePlan`
- `observabilityReference`
- `sloStatus`
- `syntheticHealthcheckStatus`
- `contractGateStatus`
- `piiSensitiveSafetyStatus`
- `sideEffectsStatus`
- `providerBoundaryStatus`
- `humanApproval`
- `finalDecision`

Campo ausente torna a decisao `invalid` com `reasonCode=PROMOTION_DECISION_INCOMPLETE`.

## Estados de decisão

Estados definidos:

- `invalid`: registro incompleto, malformado ou inconsistente.
- `rejected`: avaliacao concluida com bloqueio.
- `deferred`: avaliacao adiada por evidencia incompleta, aprovacao pendente ou risco nao mitigado.
- `approved-for-next-review-only`: permite somente uma proxima revisao governada em etapa separada, sem producao.

## ReasonCodes

ReasonCodes definidos:

- `PROMOTION_DECISION_INCOMPLETE`
- `READINESS_NOT_READY`
- `EVIDENCE_MISSING`
- `OWNER_APPROVAL_MISSING`
- `ROLLBACK_REFERENCE_MISSING`
- `OBSERVABILITY_BASELINE_MISSING`
- `CONTRACT_GATE_MISSING`
- `SYNTHETIC_HEALTHCHECK_MISSING`
- `PII_SAFETY_NOT_PROVEN`
- `SIDE_EFFECT_ZERO_NOT_PROVEN`
- `PROVIDER_BOUNDARY_NOT_PROVEN`

## Evidências F2.8–F2.13 requeridas

O template exige referencias:

- F2.8: `ops/evidence/latest/f2-08-read-only-adapter-contract-freeze-compatibility-gate-2026-07-15.md`
- F2.9: `ops/evidence/latest/f2-09-read-only-adapter-operational-runbook-rollback-policy-2026-07-15.md`
- F2.10: `ops/evidence/latest/f2-10-read-only-adapter-observability-metrics-slo-baseline-2026-07-15.md`
- F2.11: `ops/evidence/latest/f2-11-read-only-adapter-synthetic-healthcheck-non-provider-dry-run-2026-07-15.md`
- F2.12: `ops/evidence/latest/f2-12-read-only-adapter-synthetic-healthcheck-contract-gate-2026-07-15.md`
- F2.13: `ops/evidence/latest/f2-13-read-only-adapter-promotion-readiness-matrix-2026-07-15.md`

## Owners/human approval

Owners herdados de F2.9/F2.13:

- Adapter/API: Backend/API owner -> Tech lead.
- Channel binding e replay guard: Platform governance owner -> Tech lead.
- Evidencia e runbook: DocOps owner -> Platform governance owner.
- Incidente de seguranca/PII: Security owner -> Founder/Executive owner.
- Decisao de ativacao produtiva futura: Product/Platform owner -> Founder/Executive owner.

`humanApproval` deve registrar owner, papel, decisao, data UTC, escopo aprovado, restricoes e confirmacao de que a decisao nao autoriza producao.

## Rollback/disable requirements

O template exige:

- referencia ao runbook `docs/ops/whatsapp-read-only-adapter-operational-runbook.md`;
- plano de disable imediato para WA-RO-P0/WA-RO-P1;
- rollback documental/contratual para WA-RO-P2;
- correcao DocOps para WA-RO-P3;
- evidencia minima por incidente;
- confirmacao de que nenhum provider real, secret produtivo, mutacao ou side effect foi ativado.

## Observability/SLO requirements

`sloStatus` deve cobrir:

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

## Synthetic healthcheck requirements

`syntheticHealthcheckStatus` deve confirmar:

- execucao ou referencia recente do dry run F2.11/F2.12;
- fixtures deterministicas e sanitizadas;
- path `accepted_read_only`;
- paths fail-closed;
- reasonCodes/status;
- ausencia de PII/sensiveis;
- `sideEffects=0`;
- `providerExternalCall=0`;
- `mutationExternalSideEffect=0`;
- `criticalActionExecution=0`.

## Contract gate requirements

`contractGateStatus` deve confirmar:

- contrato `whatsapp.read_only.bundle_export.v1`;
- keyset congelado;
- `version` fixa;
- `sideEffects=0`;
- `piiMasked=true`;
- timestamps seguros;
- reasonCodes criticos preservados;
- ausencia de campos proibidos.

## PII/sensitive data requirements

`piiSensitiveSafetyStatus` deve provar ausencia de:

- telefone bruto;
- `fromPhoneHash`;
- texto bruto da mensagem;
- `rawPayloadRef`;
- header de assinatura;
- segredo de assinatura;
- secret produtivo;
- token, cookie ou Authorization;
- payload bruto de provider;
- campos fora do keyset congelado.

## Side-effect zero requirements

`sideEffectsStatus` deve provar:

- `sideEffects=0`;
- `providerExternalCall=0`;
- `mutationExternalSideEffect=0`;
- `criticalActionExecution=0`;
- `lead.create` bloqueado;
- `lead.discard` bloqueado;
- qualquer acao critica bloqueada.

## Provider/mutation boundary

`providerBoundaryStatus` deve declarar:

- provider WhatsApp real ausente;
- secret produtivo ausente;
- webhook produtivo ausente;
- endpoint publico novo ausente;
- dashboard obrigatorio ausente;
- storage externo obrigatorio ausente;
- ledger produtivo obrigatorio ausente;
- mutacoes ausentes;
- `lead.create` nao executado;
- `lead.discard` nao executado;
- acao critica nao executada.

## Não-autorização produtiva

F2.14 declara explicitamente:

- template nao autoriza producao;
- readiness nao autoriza provider real;
- `approved-for-next-review-only` nao autoriza producao;
- provider real, secret produtivo, webhook produtivo e mutacoes exigem etapa separada;
- qualquer futura mudanca da fronteira exige contrato versionado, evidencia real e decisao explicita de owners.

## Checks executados

Saidas reais desta etapa:

```text
$ pnpm check:evidence-index
{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 211053,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 542
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

F2.14 nao altera:

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

- O template e documental; nao executa uma decisao real.
- Um registro futuro preenchido incorretamente ainda deve ser rejeitado por revisao humana.
- Qualquer futura integracao real exige etapa separada, contrato versionado, evidencia real e decisao explicita de owners.

## Próximos passos

- Usar o template somente quando houver uma solicitacao formal de revisao futura.
- Manter F2.8-F2.13 como referencias obrigatorias.
- Se houver proposta de provider real, criar nova etapa com contrato, risco, evidencia e aprovacao especifica.

## Status final

Status: proposta/parcial evidenciada documentalmente.
