# Settlement Contract Check — 2026-03-09

Command:

```bash
pnpm check:settlement-contract-drift
```

Result:

- `ok: true`
- providers: `stripe`, `crypto`, `bank`
- endpoints:
  - `/payments/providers`
  - `/payments/providers/:provider/settle`
  - `/webhooks/billing/:provider?`

Contract:

- `ops/contracts/settlement-provider-contract.v1.json`
