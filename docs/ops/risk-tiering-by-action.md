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
| `realestate.register_property` | `execute` | `high` | `true` |
| `realestate.create_contract` | `execute` | `high` | `true` |
| `realestate.apply_adjustment` | `execute` | `high` | `true` |
| `realestate.release_commission` | `execute` | `high` | `true` |

## CI Gate Policy Payload

<!-- HIGH_POLICY:START -->
```json
{
  "policyVersion": "v1",
  "maxEvidenceAgeDays": 30,
  "highActions": [
    {
      "action": "realestate.register_property",
      "evidencePattern": "realestate-high-actions-e2e-*.json"
    },
    {
      "action": "realestate.create_contract",
      "evidencePattern": "realestate-high-actions-e2e-*.json"
    },
    {
      "action": "realestate.apply_adjustment",
      "evidencePattern": "realestate-high-actions-e2e-*.json"
    },
    {
      "action": "realestate.release_commission",
      "evidencePattern": "realestate-high-actions-e2e-*.json"
    }
  ]
}
```
<!-- HIGH_POLICY:END -->

Observacao operacional:
- nesta fase, a evidencia `HIGH` do dominio imobiliario esta agregada no artefato `realestate-high-actions-e2e-YYYY-MM-DD.json`;
- o gate de CI precisa provar que cada acao `HIGH` declarada na policy continua presente dentro desse artefato agregado.

## Acceptance for F5.3

- Existe evidência recente por ação HIGH listada no payload acima.
- Cada evidência HIGH contém cadeia mínima:
  - `runId`, `txId`, `bundleHash`
  - invariantes `txId -> runId -> bundleHash -> bundle`
  - referência a `ops/contracts/ledger-txid-api-contract.md`
  - referência a `ops/contracts/run-bundle-api-contract.md`
