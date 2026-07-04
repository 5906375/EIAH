import "./support/testInfraEnv";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import supertest from "supertest";
import { closePrismaResources } from "@repo/db";
import {
  buildWebhookSignatureBase,
  computeWebhookSignature,
} from "../services/paymentIntents";
import {
  billingRouter,
  normalizeWebhookSignatureHeader,
  verifyWebhookSignatureHeader,
} from "../routes/billing";

let request: ReturnType<typeof supertest>;

const webhookSecret = "whsec-eiah-local";
const timestamp = "1751450400";
const provider = "stripe";
const paymentIntentId = "pi_billing_signature_test";
const status = "succeeded";
const amountCents = 9900;

before(() => {
  process.env.NODE_ENV = "test";
  process.env.BILLING_WEBHOOK_SECRET = webhookSecret;
  process.env.BILLING_WEBHOOK_REPLAY_WINDOW_SECONDS = "600";
  process.env.BILLING_WEBHOOK_CLOCK_SKEW_SECONDS = "30";

  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use("/api", billingRouter);
  request = supertest(app);
});

after(async () => {
  await closePrismaResources();
});

function buildExpectedSignature(eventId: string) {
  return buildExpectedSignatureAtTimestamp(eventId, timestamp);
}

function buildExpectedSignatureAtTimestamp(eventId: string, signatureTimestamp: string) {
  const base = buildWebhookSignatureBase({
    provider,
    timestamp: signatureTimestamp,
    eventId,
    paymentIntentId,
    status,
    amountCents,
  });

  return computeWebhookSignature(webhookSecret, base);
}

function buildWebhookPayload(eventId: string) {
  return {
    eventId,
    tenantId: "tenant-billing-signature-test",
    paymentIntentId,
    status,
    amountCents,
  };
}

test("Webhook billing signature: valor cru valido continua aceito", () => {
  const expected = buildExpectedSignature("evt-raw-valid");
  const result = verifyWebhookSignatureHeader(expected, expected);

  assert.equal(result.matches, true);
  assert.equal(result.normalized, expected);
});

test("Webhook billing signature: header no formato algo=assinatura continua aceito", () => {
  const expected = buildExpectedSignature("evt-prefixed-valid");
  const result = verifyWebhookSignatureHeader(`sha256=${expected}`, expected);

  assert.equal(result.matches, true);
  assert.equal(result.normalized, expected);
});

test("Webhook billing signature: assinatura invalida com mesmo tamanho falha", () => {
  const expected = buildExpectedSignature("evt-invalid");
  const invalid = `${expected.slice(0, -1)}${expected.endsWith("0") ? "1" : "0"}`;
  const result = verifyWebhookSignatureHeader(invalid, expected);

  assert.equal(result.matches, false);
  assert.equal(result.normalized, invalid);
});

test("Webhook billing signature: tamanho divergente falha sem throw", () => {
  const expected = buildExpectedSignature("evt-short");
  assert.doesNotThrow(() => verifyWebhookSignatureHeader(expected.slice(0, -2), expected));

  const result = verifyWebhookSignatureHeader(expected.slice(0, -2), expected);
  assert.equal(result.matches, false);
});

test("Webhook billing signature: valor malformado nao-hex falha sem throw", () => {
  const expected = buildExpectedSignature("evt-malformed");
  assert.doesNotThrow(() => verifyWebhookSignatureHeader("zz-not-hex", expected));

  const result = verifyWebhookSignatureHeader("zz-not-hex", expected);
  assert.equal(result.matches, false);
});

test("Webhook billing signature: normalizacao preserva o token apos o prefixo", () => {
  const expected = buildExpectedSignature("evt-normalize");
  assert.equal(normalizeWebhookSignatureHeader(`sha256=${expected}`), expected);
  assert.equal(normalizeWebhookSignatureHeader(` ${expected} `), expected);
});

test("Webhook billing HTTP: assinatura valida crua passa pelo gate e alcanca o handler", async () => {
  const eventId = "evt-http-raw-valid";
  const liveTimestamp = Math.floor(Date.now() / 1000).toString();
  const signature = buildExpectedSignatureAtTimestamp(eventId, liveTimestamp);

  const response = await request
    .post("/api/webhooks/billing/stripe")
    .set("x-billing-signature", signature)
    .set("x-billing-timestamp", liveTimestamp)
    .send(buildWebhookPayload(eventId));

  assert.equal(response.status, 404);
  assert.equal(response.body?.error?.code, "PAYMENT_INTENT_NOT_FOUND");
});

test("Webhook billing HTTP: assinatura valida com prefixo sha256 passa pelo gate e alcanca o handler", async () => {
  const eventId = "evt-http-prefixed-valid";
  const liveTimestamp = Math.floor(Date.now() / 1000).toString();
  const signature = buildExpectedSignatureAtTimestamp(eventId, liveTimestamp);

  const response = await request
    .post("/api/webhooks/billing/stripe")
    .set("x-billing-signature", `sha256=${signature}`)
    .set("x-billing-timestamp", liveTimestamp)
    .send(buildWebhookPayload(eventId));

  assert.equal(response.status, 404);
  assert.equal(response.body?.error?.code, "PAYMENT_INTENT_NOT_FOUND");
});

test("Webhook billing HTTP: assinatura invalida com mesmo tamanho falha no gate", async () => {
  const eventId = "evt-http-invalid";
  const liveTimestamp = Math.floor(Date.now() / 1000).toString();
  const expected = buildExpectedSignatureAtTimestamp(eventId, liveTimestamp);
  const invalid = `${expected.slice(0, -1)}${expected.endsWith("0") ? "1" : "0"}`;

  const response = await request
    .post("/api/webhooks/billing/stripe")
    .set("x-billing-signature", invalid)
    .set("x-billing-timestamp", liveTimestamp)
    .send(buildWebhookPayload(eventId));

  assert.equal(response.status, 401);
  assert.equal(response.body?.error?.code, "BILLING_WEBHOOK_INVALID_SIGNATURE");
});

test("Webhook billing HTTP: assinatura malformada nao-hex falha no gate sem throw", async () => {
  const eventId = "evt-http-malformed";
  const liveTimestamp = Math.floor(Date.now() / 1000).toString();

  const response = await request
    .post("/api/webhooks/billing/stripe")
    .set("x-billing-signature", "zz-not-hex")
    .set("x-billing-timestamp", liveTimestamp)
    .send(buildWebhookPayload(eventId));

  assert.equal(response.status, 401);
  assert.equal(response.body?.error?.code, "BILLING_WEBHOOK_INVALID_SIGNATURE");
});

test("Webhook billing HTTP: assinatura com tamanho divergente falha no gate", async () => {
  const eventId = "evt-http-short";
  const liveTimestamp = Math.floor(Date.now() / 1000).toString();
  const expected = buildExpectedSignatureAtTimestamp(eventId, liveTimestamp);

  const response = await request
    .post("/api/webhooks/billing/stripe")
    .set("x-billing-signature", expected.slice(0, -2))
    .set("x-billing-timestamp", liveTimestamp)
    .send(buildWebhookPayload(eventId));

  assert.equal(response.status, 401);
  assert.equal(response.body?.error?.code, "BILLING_WEBHOOK_INVALID_SIGNATURE");
});
