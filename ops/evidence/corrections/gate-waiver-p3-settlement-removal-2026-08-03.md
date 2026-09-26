# Remoção do waiver do gate P3 settlement

- **Data:** 2026-08-03
- **Status:** `Proposta`
- **Contrato alterado no commit anterior:** [`ops/contracts/gate-waivers.v1.json`](../../contracts/gate-waivers.v1.json)
- **Commit da remoção:** `a696362d4d3a3ca8f96eeb537f180750105bcf10`

## Conteúdo integral do waiver removido

Os oito campos abaixo foram transcritos literalmente do diff do commit `a696362d4d3a3ca8f96eeb537f180750105bcf10`:

```json
{
  "gateId": "P3SettlementSupportByEnv",
  "workflow": ".github/workflows/ci.yml",
  "jobId": "p3_settlement_support_by_env",
  "reason": "scripts/generateP3EconomyEvidence.ts hardcodes stripe=full, so the gate cannot yet compare the honest support matrix with grounded evidence.",
  "grantedAt": "2026-08-01",
  "expiresAt": "2026-10-30",
  "restoreFront": "REPLACE-P3-EVIDENCE-HARDCODED",
  "approvedBy": "Carlos Alberto Merlo"
}
```

## Motivo da remoção

O motivo declarado no waiver foi satisfeito pelo commit `c4d5db55e117e01986dcd1378f6eb8ded14f40c3`, que alinhou a declaração `stripe=simulated` ao contrato versionado. O `continue-on-error` correspondente foi removido em `729c791d64f04420407f988b58bc09a8cc67cd8f`.

Depois dessa remoção, [`check:gate-waiver-expiry`](../../../scripts/checkGateWaiverExpiry.ts) reprovou com `GATE_WAIVER_STALE` e a instrução `remove the waiver`. O commit `a696362d4d3a3ca8f96eeb537f180750105bcf10` atendeu à instrução e preservou `schemaVersion: gate-waivers.v1` com `waivers: []`.

`GATE_WAIVER_STALE` descreveu o sintoma — waiver declarado sem `continue-on-error` no job. A causa da remoção foi o motivo do waiver ter sido satisfeito, não o simples decurso do prazo.

## Ordem invertida e funcionamento do controle

O [`ADR-004`](../../../docs/adr/ADR-004-required-check-blocking-semantics.md) foi decidido e executado sem conhecimento do contrato de waivers. Por isso, a supressão foi removida antes do waiver, e não o contrário. O checker detectou a inconsistência e a run `30840321426` reprovou.

Esse resultado registra o funcionamento correto do controle: um waiver sem a supressão correspondente não permaneceu silenciosamente aceito. A ordem invertida não é ocultada nem reescrita neste registro.

## Qualificação do princípio P1 do ADR-004

A supressão de um required check é admissível quando declarada em `gate-waivers.v1.json` com motivo, prazo, frente de restauração e aprovação nominal. É inadmissível a supressão sem waiver, diagnosticada como `GATE_WAIVER_UNDECLARED`, ou o waiver sem supressão, diagnosticado como `GATE_WAIVER_STALE`.

O ADR-004 não é emendado: ele permanece como decisão datada com o conhecimento disponível naquele momento. Esta qualificação registra o contrato de waivers posteriormente considerado.

## Estado de `REPLACE-P3-EVIDENCE-HARDCODED`

Após `a696362`, `git grep` encontra oito ocorrências rastreadas do identificador em seis arquivos:

- [`.github/workflows/ci.yml:1011`](../../../.github/workflows/ci.yml): comentário que nomeia a frente de restauração;
- [`docs/ops/plano-prs-environment-settlement-pou-2026-07-31.md:106,557,560`](../../../docs/ops/plano-prs-environment-settlement-pou-2026-07-31.md): três ocorrências associadas ao PR-05;
- [`ops/evidence/ci/pr-01/ci-orphan-tests-job.30710850816.log:405`](../ci/pr-01/ci-orphan-tests-job.30710850816.log): conteúdo do waiver observado em CI;
- [`ops/evidence/local/pr-01/gate-waiver-check.sandbox.log:17`](../local/pr-01/gate-waiver-check.sandbox.log): conteúdo do waiver observado localmente;
- [`ops/evidence/local/pr-01/orphan-tests-unit.sandbox.log:45`](../local/pr-01/orphan-tests-unit.sandbox.log): conteúdo do waiver observado na suíte local;
- [`scripts/tests/checkGateWaiverExpiry.test.ts:29`](../../../scripts/tests/checkGateWaiverExpiry.test.ts): fixture do teste do checker.

O identificador não consta em [`docs/ops/open-fronts.md`](../../../docs/ops/open-fronts.md), registro primário de trabalho estabelecido pelo ADR-003. Há sobreposição de escopo não declarada com `DISCRIMINATE-P3-EVIDENCE-MODE`: ou são designações do mesmo trabalho, com identificador duplicado entre o registro primário e o plano subordinado, ou são frentes distintas com escopo sobreposto.

A referência em `.github/workflows/ci.yml:1011` é resíduo: nomeia uma frente de restauração para uma supressão removida em `729c791`. Este ciclo não remove a referência, não reconcilia os identificadores e não resolve a sobreposição.

## Leitura da run `30840321426`

A [run `30840321426`](https://github.com/5906375/EIAH/actions/runs/30840321426), de evento `pull_request` e head SHA `729c791d64f04420407f988b58bc09a8cc67cd8f`, concluiu `failure`. O job `P3SettlementSupportByEnv` concluiu `success`; o vermelho geral decorreu de outros três jobs:

| Job | Natureza da falha |
| --- | --- |
| `P1ReconciliationRecurring` | Vencimento de recência: `ape-weekly-cycle-run46-2026-07-20.md`, `ageDays=14.76`, limite `14`. |
| `P2HighGlobalCoverage` | Vencimento de recência: evidência gerada em `2026-07-04`, `ageDays=30.11`, limite `30`. |
| `OrphanTestsRegression` | `GATE_WAIVER_STALE`, corrigido em `a696362` e ainda não pushado. |

Required checks de recência vencem por decurso de prazo. Assim, uma linha de base de conclusões pode envelhecer e passar a reprovar independentemente de qualquer alteração de código.

Em `OrphanTestsRegression`, o step nº 7, `Run orphan tests gate unit test`, concluiu `failure`. Dentro do step, os 13 testes declarados pelo TAP passaram (`tests=13`, `pass=13`, `fail=0`), e `check:gate-waiver-expiry`, encadeado por `&&` depois deles, executou e reprovou com `GATE_WAIVER_STALE`.

Há três camadas de rótulo entre o observador e a causa: o job diz “regressão de testes órfãos”, o step diz “teste unitário do gate de órfãos”, e nenhum teste falhou. O controle funcionou; a legibilidade do resultado falhou.

Esse caso complementar reforça a frente `DECOUPLE-WAIVER-CHECK-FROM-TEST-CHAIN`: além do risco já registrado de o checker não executar quando um teste anterior falha, a run mostra que o checker pode executar e reprovar corretamente sob um rótulo que não descreve a causa.

## Limites da remoção

- Não resolve `DISCRIMINATE-P3-EVIDENCE-MODE`; a geração continua declarativa.
- Não prova efeito sobre merge, pois nenhuma tentativa de merge foi executada.
- Não afeta waiver de outro gate, pois não havia outro waiver no contrato.
- Não trata as falhas de recência de P1 ou P2.
- Não promove, rebaixa ou resolve frente, PR, fase ou status.

Este registro documenta a remoção aplicada no commit anterior. Ele não altera novamente o contrato e não constitui evidência nova de execução para o Evidence Index.
