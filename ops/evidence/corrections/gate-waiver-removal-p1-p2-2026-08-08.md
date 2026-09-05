# Remoção das supressões P1/P2 após a realocação do ruleset

- **Data efetiva:** `2026-08-08T18:25:20Z`
- **Prazo original do estado intermediário:** `2026-08-15T18:14:53Z`
- **Estado encerrado:** `temporarily_non_required_with_degraded_visibility`
- **Decisão:** ADR-007, §§10 e 11
- **Registro administrativo anterior:**
  `ops/evidence/latest/gate-relocation-p1-p2-applied-2026-08-08.md`

## Motivo

R3-bis retirou `P1ReconciliationRecurring` e `P2HighGlobalCoverage` dos required contexts do
ruleset `13498700`. Com os dois contexts fora do ruleset, as declarações de
`continue-on-error: true` e os waivers correspondentes perderam seu objeto: já não eram necessárias
para impedir que essas duas falhas bloqueassem merge como required checks.

R4 remove, atomicamente no mesmo commit:

- `continue-on-error: true` dos jobs `p1_reconciliation_recurring` e
  `p2_high_global_coverage` em `.github/workflows/ci.yml`;
- os waivers `P1ReconciliationRecurring` e `P2HighGlobalCoverage` de
  `ops/contracts/gate-waivers.v1.json`.

O job informativo `imob_frontdoor_mobile_smoke_informative` permanece com
`continue-on-error: true`. Nenhum threshold, métrica, checker, producer, reason code, ruleset ou
workflow APE foi alterado.

## Confirmação read-only do ruleset

Antes de tocar nos arquivos, as consultas ao GitHub retornaram:

```text
required contexts: 18
P1/P2 presentes: []
```

Portanto, F-1 permanecia ativa: o ruleset seguia com 18 contexts e sem
`P1ReconciliationRecurring` ou `P2HighGlobalCoverage`.

## Checker antes

`pnpm check:gate-waiver-expiry` retornou `ok:true`, sem violações, e duas advertências de waiver
ativo:

```json
{
  "ok": true,
  "check": "check:gate-waiver-expiry",
  "clockDate": "2026-08-08",
  "warnings": [
    {
      "code": "GATE_WAIVER_ACTIVE",
      "gateId": "P1ReconciliationRecurring",
      "jobId": "p1_reconciliation_recurring",
      "expiresAt": "2026-09-18",
      "daysRemaining": 41
    },
    {
      "code": "GATE_WAIVER_ACTIVE",
      "gateId": "P2HighGlobalCoverage",
      "jobId": "p2_high_global_coverage",
      "expiresAt": "2026-09-18",
      "daysRemaining": 41
    }
  ],
  "violations": []
}
```

## Estado após a remoção

O workflow passou a conter uma única ocorrência de `continue-on-error`, pertencente ao smoke IMOB
informativo. O contrato final preserva o schema e não contém waiver:

```json
{
  "schemaVersion": "gate-waivers.v1",
  "waivers": []
}
```

`pnpm check:gate-waiver-expiry` após a alteração retornou:

```json
{
  "ok": true,
  "check": "check:gate-waiver-expiry",
  "clockDate": "2026-08-08",
  "contract": "ops/contracts/gate-waivers.v1.json",
  "warnings": [],
  "violations": []
}
```

## Segurança e visibilidade

Sem os dois contexts na lista required do ruleset, a falha de qualquer desses jobs não bloqueia
merge por essa regra de required status check. Os dois jobs continuam presentes em `ci.yml` e,
sem `continue-on-error`, passam a reprovar visivelmente quando seus comandos falham, até a
relocação governada prevista para R7.

R4 encerra o estado intermediário antes do prazo original, mas não declara P1/P2 saudáveis nem
antecipa a relocação para `ape-weekly.yml`.

## O que prova

- o ruleset continuava com 18 required contexts e sem P1/P2 antes da edição;
- as duas supressões e os dois waivers foram removidos atomicamente;
- restou somente o `continue-on-error` legítimo do smoke IMOB informativo;
- o contrato final contém `waivers: []`;
- o checker de waivers terminou com `ok:true`, `warnings:[]` e `violations:[]`;
- o estado `temporarily_non_required_with_degraded_visibility` foi encerrado em
  `2026-08-08T18:25:20Z`, antes do prazo de `2026-08-15T18:14:53Z`.

## O que NÃO prova

- que P1 ou P2 estejam saudáveis, frescos ou restaurados;
- que os jobs estejam verdes;
- que os contexts tenham sido restaurados ao ruleset;
- que a relocação para `ape-weekly.yml` prevista em R7 tenha ocorrido;
- que #423 ou #424 satisfaçam todos os demais critérios de merge.
