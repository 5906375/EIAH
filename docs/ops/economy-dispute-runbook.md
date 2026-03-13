# Runbook — Economy and Disputes (F5.6)

## Objective

Operate the economic flow with PoU-gated charging, auditable dispute lifecycle, and reputation delta computation.

Operational scope:
- `POST /api/billing/charge`
- `POST /api/billing/disputes`
- `POST /api/billing/disputes/:id/review`
- `POST /api/billing/disputes/:id/resolve`
- `GET /api/billing/disputes`
- `POST /api/governance/reputation/recompute`

Contract artifacts:
- `ops/contracts/pou-payment-receipt.v1.json`
- `ops/contracts/dispute-state-machine.v1.json`
- `ops/contracts/reputation-delta-receipt.v1.json`

## Preconditions

- Token with tenant/workspace context.
- Required permissions:
  - `runs.execute` for opening disputes.
  - `approvals.manage` for review/resolve transitions.
  - `reports.view` for dispute listing.
  - `governance.trust.manage` for reputation recompute.
- Guardrail audit ledger enabled in target environment.

## Canonical flow

1. Charge attempt with PoU gate
- Call `POST /api/billing/charge`.
- Expected:
  - Success path: charge recorded and `billing.charge.succeeded`.
  - Blocked path: `409 POU_REQUIRED_FOR_PAYMENT` with reason code `pou_required_for_payment` and event `billing.charge.blocked_pou`.

2. Dispute lifecycle
- Open: `POST /api/billing/disputes` => status `open`.
- Review: `POST /api/billing/disputes/:id/review` => status `in_review`.
- Resolve terminal state:
  - accepted => status `resolved`, event `billing.dispute.resolved`.
  - rejected => status `denied`, event `billing.dispute.denied`.
- Invalid transition must return `409 DISPUTE_INVALID_TRANSITION` with reason code `status_conflict`.

3. Reputation delta
- Trigger recompute via governance endpoint.
- Validate method version `reputation.v1`.
- Validate evidence fingerprint and score delta in output.

## Incident playbook

- Symptom: repeated charge blocks on PoU gate.
  - Action:
    1. Verify PoU status for the run (`FINALIZED` required).
    2. Confirm run scope matches tenant/workspace.
    3. Confirm event trail in guardrail ledger.

- Symptom: dispute stuck (non-terminal).
  - Action:
    1. Query timeline from dispute events.
    2. Verify latest state and allowed next action from `dispute-state-machine.v1`.
    3. Re-run only valid transition (review then resolve/deny).

- Symptom: reputation delta unexpected.
  - Action:
    1. Check supporting evidence buckets: PoU, tx-linked runs, settlement events, dispute events.
    2. Recompute and compare `fingerprint`.
    3. Confirm same `windowDays` and `writeLabel` scope.

## Minimum DoD for this phase

- Versioned contracts published:
  - `pou-payment-receipt.v1.json`
  - `dispute-state-machine.v1.json`
  - `reputation-delta-receipt.v1.json`
- This runbook is published and references the canonical flow and incident actions.
- Economy invariants gate passing (`pnpm check:economy-invariants`) with:
  - conservation (`requested = captured + adjustment`),
  - monotonic dispute state machine (`open -> in_review -> resolved|denied`),
  - deterministic reconciliation (`ledger + provider + dispute trail -> unique settlement result`).
