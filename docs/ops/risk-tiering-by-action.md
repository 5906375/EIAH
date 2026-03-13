# Risk Tiering by Action (F5.3)

Fonte canônica para `acao -> tier -> exige txId?` usada no gate de evidência HIGH em staging.

Origem de policy em runtime:
- `apps/api/src/policies/risk-tier-policy.v1.json`
- `apps/api/src/services/riskTierPolicy.ts`

## Matrix (v1)

| Action | Scope | Tier | txId required |
| --- | --- | --- | --- |
| `runs.execute` | `execute` | `medium` | `false` |
| `runs.approve` | `admin` | `medium` | `false` |
| `realestate.generate_monthly` | `execute` | `medium` | `false` |
| `realestate.apply_adjustment` | `execute` | `high` | `true` |
| `action.realestate.apply_adjustment` | `execute` | `high` | `true` |

## CI Gate Policy Payload

<!-- HIGH_POLICY:START -->
```json
{
  "policyVersion": "v1",
  "maxEvidenceAgeDays": 30,
  "highActions": [
    {
      "action": "realestate.apply_adjustment",
      "evidencePattern": "s1-01-high-e2e-realestate.apply_adjustment-*.json"
    },
    {
      "action": "action.realestate.apply_adjustment",
      "evidencePattern": "s1-01-high-e2e-action.realestate.apply_adjustment-*.json"
    }
  ]
}
```
<!-- HIGH_POLICY:END -->

## Acceptance for F5.3

- Existe evidência recente por ação HIGH listada no payload acima.
- Cada evidência HIGH contém cadeia mínima:
  - `runId`, `txId`, `bundleHash`
  - invariantes `txId -> runId -> bundleHash -> bundle`
  - referência a `ops/contracts/ledger-txid-api-contract.md`
  - referência a `ops/contracts/run-bundle-api-contract.md`
