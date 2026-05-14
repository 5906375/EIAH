# Runbook — Billing Webhook Hardening (Track P)

## Objective

Operate provider webhook ingestion with:
- signature verification,
- replay/idempotency protection,
- auditable decision trail.

## Scope

- `POST /api/webhooks/billing`
- `POST /api/webhooks/billing/:provider`
- Contract: `ops/contracts/billing-webhook-provider-contract.md`

## Preconditions

- `BILLING_WEBHOOK_SECRET` configured in runtime.
- `BILLING_WEBHOOK_PUBLIC_ENABLED=true` (default).
- Optional provider gate: `BILLING_WEBHOOK_ALLOWED_PROVIDERS=stripe,asaas,...`
- Replay controls:
  - `BILLING_WEBHOOK_REPLAY_WINDOW_SECONDS` (default `600`)
  - `BILLING_WEBHOOK_CLOCK_SKEW_SECONDS` (default `30`)
- Rollback controls:
  - `BILLING_WEBHOOK_OBSERVE_ONLY=true|false`
- Workspace referenced by `projectId` exists.
- Guardrail audit ledger enabled.

## Operational checks

1. Signature validation
- Send webhook with valid signature header:
  - canonical `sha256=<hex>`; or
  - stripe-like `t=<ts>,v1=<hex>,...`.
- Expected: `200`, `ok=true`.

2. Replay/idempotency
- Resend same provider event (`provider + projectId + externalId` unchanged).
- Expected:
  - response `200` with `idempotent=true`,
  - no new `paymentTx`,
  - `billing.webhook.duplicate` audit with reason `replay_detected`.

3. Invalid signature path
- Send malformed/invalid signature.
- Expected: `401 BILLING_WEBHOOK_INVALID_SIGNATURE`.

4. Replay window
- Send valid signature with timestamp outside replay window.
- Expected: `401 BILLING_WEBHOOK_REPLAY_WINDOW_FAILED`.

5. Observe-only rollback mode
- Set `BILLING_WEBHOOK_OBSERVE_ONLY=true`.
- Expected:
  - `202` with `observed=true`,
  - audit event `billing.webhook.observed`,
  - no settlement side-effects.

## Provider header canonicalization

- Common headers:
  - signature: `x-billing-signature` or `x-signature`
  - timestamp: `x-billing-timestamp`, `x-webhook-timestamp`, `x-signature-timestamp`
  - event id: `x-billing-event-id`, `x-webhook-event-id`, `x-event-id`
- Stripe-style signatures are accepted by extracting `v1=<hex>`.
- Keep provider fixtures versioned in tests for canonicalization changes.

## Incident handling

- Symptom: sudden signature failures
  - Verify provider signing secret rotation.
  - Confirm `BILLING_WEBHOOK_SECRET` deployed in active environment.
  - Compare request canonical body vs signed body.

- Symptom: duplicate spikes
  - Confirm `billing.webhook.duplicate` growth in audit events.
  - Confirm no growth in distinct `paymentTx` for same idempotency tuple.
  - Engage provider retries/backoff alignment.

- Symptom: replay-window rejects after provider incident
  - Check drift between provider timestamp and API host clock.
  - Temporarily increase window/skew via env and record break-glass evidence.

## Evidence artifacts

- Valid flow evidence:
  - `ops/evidence/billing-webhook-valid-YYYY-MM-DD.json`
- Replay evidence:
  - `ops/evidence/billing-webhook-replay-attack-YYYY-MM-DD.json`
  - evidencia operacional recorrente do fluxo economico: `ops/evidence/latest/billing-webhook-replay-YYYY-MM-DD.json`

## Minimum DoD

- Valid and replay evidence files published.
- Core webhook tests green (`billing.webhook.unit.test.ts`).
- Replay-window and canonicalization tests green.
