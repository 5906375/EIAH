import assert from "node:assert/strict";
import { env as processEnv } from "node:process";
import { afterEach, test } from "node:test";
import express from "express";
import request from "supertest";
import { authRouter } from "../routes/auth";

const FLAG = "EIAH_ALLOW_UNVERIFIED_WALLET";
const previousFlag = processEnv[FLAG];

afterEach(() => {
  if (previousFlag === undefined) {
    delete processEnv[FLAG];
  } else {
    processEnv[FLAG] = previousFlag;
  }
});

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(authRouter);
  return app;
}

async function createWalletChallenge(app: ReturnType<typeof createApp>) {
  const response = await request(app)
    .post("/auth/wallet/challenge")
    .send({ address: "0xabc" });
  assert.equal(response.status, 200);
  return String(response.body?.data?.challengeId ?? "");
}

async function attemptWalletLogin(
  app: ReturnType<typeof createApp>,
  challengeId: string,
) {
  return request(app)
    .post("/auth/wallet/login")
    .send({ address: "0xabc", challengeId, signature: " " });
}

test("wallet login is strict when the relaxation flag is absent", async () => {
  delete processEnv[FLAG];
  const app = createApp();
  const response = await attemptWalletLogin(app, await createWalletChallenge(app));
  assert.equal(response.status, 501);
  assert.equal(response.body?.error?.code, "WALLET_VERIFY_NOT_CONFIGURED");
});

test("wallet login reaches the permissive path only for exact true", async () => {
  processEnv[FLAG] = "true";
  const app = createApp();
  const response = await attemptWalletLogin(app, await createWalletChallenge(app));
  assert.equal(response.status, 401);
  assert.equal(response.body?.error?.code, "INVALID_SIGNATURE");
});

test("wallet login remains strict for non-exact flag variants", async () => {
  for (const value of ["TRUE", "1", "yes", ""]) {
    processEnv[FLAG] = value;
    const app = createApp();
    const response = await attemptWalletLogin(app, await createWalletChallenge(app));
    assert.equal(response.status, 501, value);
    assert.equal(response.body?.error?.code, "WALLET_VERIFY_NOT_CONFIGURED", value);
  }
});

test("explicit wallet relaxation prevails in NODE_ENV=production", async () => {
  processEnv[FLAG] = "true";
  const previousNodeEnv = processEnv.NODE_ENV;
  processEnv.NODE_ENV = "production";
  try {
    const app = createApp();
    const response = await attemptWalletLogin(app, await createWalletChallenge(app));
    assert.equal(response.status, 401);
    assert.equal(response.body?.error?.code, "INVALID_SIGNATURE");
  } finally {
    if (previousNodeEnv === undefined) delete processEnv.NODE_ENV;
    else processEnv.NODE_ENV = previousNodeEnv;
  }
});
