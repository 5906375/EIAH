# Waiver declarado para os checks de recência P1 e P2

- **Data:** 2026-08-04
- **Status:** `Proposta`
- **Decisão:** declarar waiver nominal para `P1ReconciliationRecurring` e `P2HighGlobalCoverage`, com o `continue-on-error` correspondente
- **Aprovado por:** Carlos Alberto Merlo
- **Prazo:** 2026-09-18 (45 dias)

## Contexto

Ambos os checks reprovam por vencimento de evidência, não por regressão de código:

- `check:p1-reconciliation-recurring`: `ageDays: 15.77`, `maxAgeDays: 14`, arquivo `ops/evidence/latest/ape-weekly-cycle-run46-2026-07-20.md`.
- `check:p2-evidence-recency`: `ageDays: 31.12`, `maxAgeDays: 30`, arquivo `ops/evidence/latest/p2-high-global-coverage.json`.

## As três saídas possíveis, e por que as duas primeiras foram descartadas

### Regenerar — descartada

Regenerar produziria uma evidência com data nova, mas continuaria a não representar execução real, pelo mesmo padrão que este PR corrigiu em P3 economy e vem corrigindo em P2 interop:

- `scripts/generateP2HighGlobalCoverage.ts:38-49` (`extractHighActions`) e `:55-62` (`extractCoveredActionsFromE2E`) inspecionam `packages/core/src/actions/{billing,finance,notifications}.ts` e o arquivo de teste E2E `packages/core/src/actions/__tests__/highGlobalCoverage.e2e.test.ts` como texto — via regex sobre o código-fonte, não execução. Em `scripts/generateP2HighGlobalCoverage.ts:107`, cada item do inventário recebe `e2eCovered: true` incondicionalmente, sem que o cenário E2E seja executado.
- `scripts/ci/ape_cycle_weekly.cjs:12-27` (array `checks`) executa de fato 15 checks via `spawnSync` (`runOne`, linha 30). Mas o markdown de evidência (`buildEvidenceMarkdown`, linha 79) e o payload JSON (`decisionJson`, linhas 128-130) fixam `auditGap: 0`, `duplicateSideEffects: 0` e `breakGlass: 0` como literais, independentemente do que os 15 checks executados de fato reportaram.

Regenerar hoje produziria exatamente a classe de evidência declarativa-com-data-nova que este PR tem corrigido — e que o comentário publicado no PR #423 declara não ter sido usado.

### Corrigir os geradores — descartada neste ciclo

Corrigir `generateP2HighGlobalCoverage.ts` para capturar execução real do E2E, e `ape_cycle_weekly.cjs` para capturar `auditGap`/`duplicateSideEffects`/`breakGlass` de execução real em vez de fixá-los, é trabalho de infraestrutura da ordem de semanas. Não desbloqueia o PR agora.

### Waiver declarado — adotada

A supressão passa a ser nominal, datada, com motivo, prazo, frente de restauração e aprovação — visível no contrato — em vez de invisível (sem `continue-on-error` e sem waiver, o job simplesmente reprovaria required checks já sabidamente vencidos por decurso de prazo, não por regressão).

## Coerência com o ADR-004

O [`ADR-004`](../../../docs/adr/ADR-004-required-check-blocking-semantics.md) estabelece P1 ("required check não é suprimível" sem decisão registrada) e P2 ("gate que reprova é presumido correto"). A qualificação registrada em [`ops/evidence/corrections/gate-waiver-p3-settlement-removal-2026-08-03.md`](./gate-waiver-p3-settlement-removal-2026-08-03.md) — "a supressão de um required check é admissível quando declarada em `gate-waivers.v1.json` com motivo, prazo, frente de restauração e aprovação nominal" — é o mecanismo usado aqui, sem qualificação adicional. Este ciclo não emenda o ADR-004 nem a qualificação já registrada; usa o contrato de waivers exatamente como projetado e já qualificado.

## Os dois waivers, campo a campo

```json
{
  "gateId": "P2HighGlobalCoverage",
  "workflow": ".github/workflows/ci.yml",
  "jobId": "p2_high_global_coverage",
  "reason": "Remove when generateP2HighGlobalCoverage.ts stops inspecting the action files and the E2E test as text and setting e2eCovered=true for every item without executing the E2E scenario.",
  "grantedAt": "2026-08-04",
  "expiresAt": "2026-09-18",
  "restoreFront": "RESOLVE-RECENCY-GATE-DECAY",
  "approvedBy": "Carlos Alberto Merlo"
}
```

```json
{
  "gateId": "P1ReconciliationRecurring",
  "workflow": ".github/workflows/ci.yml",
  "jobId": "p1_reconciliation_recurring",
  "reason": "Remove when scripts/ci/ape_cycle_weekly.cjs stops hardcoding auditGap=0, duplicateSideEffects=0 and breakGlass=0 in the weekly cycle evidence regardless of what the 15 executed checks actually found.",
  "grantedAt": "2026-08-04",
  "expiresAt": "2026-09-18",
  "restoreFront": "RESOLVE-RECENCY-GATE-DECAY",
  "approvedBy": "Carlos Alberto Merlo"
}
```

`jobId` e `gateId` (derivado do campo `name:` de cada job) foram confirmados por leitura de `.github/workflows/ci.yml:863-864` (`p2_high_global_coverage` / `P2HighGlobalCoverage`) e `:922-923` (`p1_reconciliation_recurring` / `P1ReconciliationRecurring`), e por leitura de `scripts/checkGateWaiverExpiry.ts:154-159`, onde `gateId: job.name || job.jobId`. `continue-on-error: true` foi acrescentado no nível de job em ambos (`ci.yml:866`, `:925`), o único nível que `parseWorkflowJobs` reconhece (`checkGateWaiverExpiry.ts:144-151`: só campos no indent `jobsIndent + 4`, o mesmo nível de `name:` e `runs-on:`, são atribuídos ao job corrente).

## O que este waiver não faz

- Não corrige `generateP2HighGlobalCoverage.ts` nem `scripts/ci/ape_cycle_weekly.cjs`.
- Não torna a evidência capturada de execução real; `e2eCovered=true` e `auditGap/duplicateSideEffects/breakGlass=0` continuam sendo fixados, não medidos.
- Não resolve a frente `RESOLVE-RECENCY-GATE-DECAY` (`docs/ops/open-fronts.md`), que trata da deterioração estrutural dos dois gates de recência.
- Não afirma nada sobre a qualidade da cobertura que os artefatos declaram — apenas suprime a reprovação por vencimento de prazo, nominalmente e por tempo limitado.
- Não regenera nenhuma evidência; nenhum `generate:*`, `baseline:*`, `sync:*`, `ape:cycle:*` foi executado neste ciclo.

## O que acontece em 2026-09-18 se nada mudar

Os dois waivers vencem. `check:gate-waiver-expiry` passa a reportar `GATE_WAIVER_EXPIRED` para ambos (`daysRemaining < 0`), e a reprovação retorna: `continue-on-error` continuaria presente, mas o waiver que o justifica estaria expirado, produzindo violação bloqueante do próprio checker de governança de waivers — não mais um `PASS` silencioso. A decisão volta à mesa: renovar com justificativa nova, corrigir os geradores, ou remover `continue-on-error` e aceitar que os dois required checks reprovem por vencimento até a evidência ser regenerada com captura real.

## Referência ao PR #423

O comentário publicado no PR #423 declara que a evidência de P1/P2 não foi regenerada. Este ciclo mantém essa afirmação verdadeira: nenhuma evidência foi tocada, apenas a supressão de required check foi tornada nominal e visível.

## Limites deste registro

- Não altera `generateP2HighGlobalCoverage.ts`, `scripts/ci/ape_cycle_weekly.cjs`, `checkP1ReconciliationRecurring.ts` ou `checkP2EvidenceRecency.ts`.
- Não altera limites de recência (`maxAgeDays`).
- Não acrescenta `continue-on-error` a nenhum outro job.
- Não altera as seis exceções de circularidade estrutural em `ops/contracts/circularity-exceptions.v1.json`.
- Não registra frente nova nem emenda ADR algum.
- Não promove, rebaixa ou reclassifica status. As dezessete frentes permanecem `pendente`; PR-01 permanece `Parcial`.
- Este registro é decisão e não evidência de execução real; `docs/EVIDENCE_INDEX.md` permanece inalterado.
