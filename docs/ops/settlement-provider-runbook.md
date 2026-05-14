# Runbook — Settlement Provider (Sprint 2)

## Objetivo

Operar `PaymentIntent` com liberação PoU-gated, settlement por provider e webhook verificável (assinatura + anti-replay + idempotência).

## Endpoints

- `POST /api/billing/payment-intents`
- `GET /api/billing/payment-intents/:id`
- `POST /api/billing/payment-intents/:id/release`
- `GET /api/payments/providers`
- `POST /api/payments/providers/:provider/settle`
- `POST /api/webhooks/billing/:provider?`

## Fluxo operacional

1. Criar `PaymentIntent` (`status=pending`).
2. Rodar release gate:
  - sem PoU/SCL consistente -> `status=blocked` e `409 POU_REQUIRED_FOR_PAYMENT`;
  - com PoU/SCL -> `status=released`.
3. Liquidar via provider (modo suportado por ambiente: `stripe=full`; `crypto/bank=simulated` por padrão):
  - sucesso -> `status=settled` + `BillingLedger.credit`.
4. Confirmar via webhook assinado:
  - evento novo -> processa settlement;
  - evento repetido -> `idempotent=true`, `replayRejected=true`, `duplicateSideEffects=0`.

## Segurança webhook

- Segredo: `BILLING_WEBHOOK_SECRET`.
- Headers:
  - `x-billing-signature`
  - `x-billing-timestamp`
- Janela anti-replay:
  - `BILLING_WEBHOOK_REPLAY_WINDOW_SECONDS` (default `600`)
  - `BILLING_WEBHOOK_CLOCK_SKEW_SECONDS` (default `30`)
- Chave idempotente: `provider + eventId`.

## Evidências esperadas

- `ops/evidence/latest/payment-intent-schema-YYYY-MM-DD.json`
- `ops/evidence/latest/pou-gated-payment-e2e-YYYY-MM-DD.json`
- `ops/evidence/latest/settlement-provider-e2e-YYYY-MM-DD.json`
- `ops/evidence/latest/billing-webhook-replay-YYYY-MM-DD.json`
- `ops/evidence/latest/settlement-contract-check-YYYY-MM-DD.md`

## Check de drift

- `pnpm check:settlement-contract-drift`
- `pnpm check:p3-settlement-support-by-env`
- Contrato fonte: `ops/contracts/settlement-provider-contract.v1.json`
- Matriz de suporte por ambiente: `ops/contracts/settlement-provider-support-matrix.v1.json`
