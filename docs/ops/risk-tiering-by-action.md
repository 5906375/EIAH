# Risk Tiering by Action (F5.3)

Documentação derivada da política versionada para `acao -> tier -> exige txId?`
usada no gate de evidência HIGH em staging.

Fonte canônica única:
- `contracts/risk-tier-policy.v1.json`

Loader tipado e fail-closed:
- `packages/core/src/policy/riskTierPolicy.ts`

A matriz e o payload abaixo preservam a representação documental da policy v1.
Não devem ser editados para alterar classificação; toda mudança normativa nasce
no JSON canônico e precisa manter estes derivados sincronizados.

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
| `realestate.review_deal` | `execute` | `high` | `true` |

## CI Gate Policy Payload (derivado para compatibilidade P2)

O gate P1 lê diretamente a fonte canônica. Este snapshot permanece nesta fase
para os leitores P2 legados que ainda parseiam os marcadores `HIGH_POLICY`.

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
    },
    {
      "action": "realestate.review_deal",
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
