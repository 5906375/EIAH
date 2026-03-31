import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import supertest from "supertest";
import { closePrismaResources, prismaGlobal } from "@repo/db";
import { closeRunEventsTransport } from "../services/runEvents";
import { closeRunEventStream } from "../services/runEventStream";
import { billingRouter } from "../routes/billing";

let request: ReturnType<typeof supertest>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-reconcile-${suffix}`;
const workspaceId = `workspace-reconcile-${suffix}`;
const workspaceOtherId = `workspace-reconcile-other-${suffix}`;
const userId = `user-reconcile-${suffix}`;
const apiToken = `tok-reconcile-${suffix}`;
const runOkId = `run-ok-${suffix}`;
const runMissingLedgerId = `run-missing-ledger-${suffix}`;
const runMismatchId = `run-mismatch-${suffix}`;
const runDuplicateId = `run-duplicate-${suffix}`;
const runOtherWorkspaceId = `run-other-workspace-${suffix}`;

before(async () => {
  process.env.NODE_ENV = "test";
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use("/api", billingRouter);
  request = supertest(app);

  await prismaGlobal.tenant.create({
    data: { id: tenantId, name: tenantId },
  });
  await prismaGlobal.workspace.create({
    data: { id: workspaceId, tenantId, name: workspaceId },
  });
  await prismaGlobal.workspace.create({
    data: { id: workspaceOtherId, tenantId, name: workspaceOtherId },
  });
  await prismaGlobal.user.create({
    data: {
      id: userId,
      tenantId,
      email: `${userId}@example.com`,
      displayName: "Reconciliation Tester",
    },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: apiToken,
      tenantId,
      workspaceId,
      userId,
      description: "billing-reconciliation-test",
      revoked: false,
    },
  });
  await prismaGlobal.workspaceAgentAssignment.create({
    data: {
      tenantId,
      workspaceId,
      agentKey: "fin-nexus",
      agentVersion: "1.0.0",
      enabled: true,
      signedByUserId: userId,
      signedAt: new Date(),
      signatureRef: "sig-reconcile-assignment",
    },
  });

  await prismaGlobal.run.createMany({
    data: [
      {
        id: runOkId,
        tenantId,
        workspaceId,
        userId,
        agent: "fin-nexus",
        status: "success",
        request: { action: "ok" },
        response: { ok: true },
        costCents: 123,
      },
      {
        id: runMissingLedgerId,
        tenantId,
        workspaceId,
        userId,
        agent: "fin-nexus",
        status: "success",
        request: { action: "missing-ledger" },
        response: { ok: true },
        costCents: 50,
      },
      {
        id: runMismatchId,
        tenantId,
        workspaceId,
        userId,
        agent: "fin-nexus",
        status: "success",
        request: { action: "mismatch" },
        response: { ok: true },
        costCents: 999,
      },
      {
        id: runDuplicateId,
        tenantId,
        workspaceId,
        userId,
        agent: "fin-nexus",
        status: "success",
        request: { action: "duplicate" },
        response: { ok: true },
        costCents: 40,
      },
      {
        id: runOtherWorkspaceId,
        tenantId,
        workspaceId: workspaceOtherId,
        userId,
        agent: "fin-nexus",
        status: "success",
        request: { action: "other-workspace" },
        response: { ok: true },
        costCents: 70,
      },
    ],
  });

  await prismaGlobal.runUsageBreakdown.createMany({
    data: [
      {
        runId: runOkId,
        tenantId,
        workspaceId,
        agent: "fin-nexus",
        agentVersion: "1.0.0",
        provider: "openai",
        model: "gpt-4o-mini",
        pricingVersion: "provider-usage.v1",
        requestId: `req-ok-${suffix}`,
        traceId: `trace-ok-${suffix}`,
        meterType: "llm_completion",
        requestClass: "chat_response",
        totalTokens: 210,
        amountCents: 123,
      },
      {
        runId: runMissingLedgerId,
        tenantId,
        workspaceId,
        agent: "fin-nexus",
        agentVersion: "1.0.0",
        provider: "openai",
        model: "gpt-4o-mini",
        pricingVersion: "provider-usage.v1",
        requestId: `req-missing-ledger-${suffix}`,
        traceId: `trace-missing-ledger-${suffix}`,
        meterType: "llm_completion",
        requestClass: "chat_response",
        totalTokens: 55,
        amountCents: 50,
      },
      {
        runId: runMismatchId,
        tenantId,
        workspaceId,
        agent: "fin-nexus",
        agentVersion: "1.0.0",
        provider: "openai",
        model: "gpt-4o-mini",
        pricingVersion: "provider-usage.v1",
        requestId: `req-mismatch-${suffix}`,
        traceId: `trace-mismatch-${suffix}`,
        meterType: "llm_completion",
        requestClass: "chat_response",
        totalTokens: 80,
        amountCents: 200,
      },
      {
        runId: runDuplicateId,
        tenantId,
        workspaceId,
        agent: "fin-nexus",
        agentVersion: "1.0.0",
        provider: "openai",
        model: "gpt-4o-mini",
        pricingVersion: "provider-usage.v1",
        requestId: `req-duplicate-${suffix}`,
        traceId: `trace-duplicate-${suffix}`,
        meterType: "llm_completion",
        requestClass: "chat_response",
        totalTokens: 40,
        amountCents: 40,
      },
      {
        runId: runOtherWorkspaceId,
        tenantId,
        workspaceId: workspaceOtherId,
        agent: "fin-nexus",
        agentVersion: "1.0.0",
        provider: "openai",
        model: "gpt-4o-mini",
        pricingVersion: "provider-usage.v1",
        requestId: `req-other-workspace-${suffix}`,
        traceId: `trace-other-workspace-${suffix}`,
        meterType: "llm_completion",
        requestClass: "chat_response",
        totalTokens: 70,
        amountCents: 70,
      },
    ],
  });

  await prismaGlobal.billingLedger.createMany({
    data: [
      {
        tenantId,
        workspaceId,
        runId: runOkId,
        entryType: "debit",
        amountCents: 123,
        currency: "BRL",
        description: "reconciliation-ok",
        requestId: `req-ok-${suffix}`,
        provider: "openai",
        model: "gpt-4o-mini",
      },
      {
        tenantId,
        workspaceId,
        runId: runMismatchId,
        entryType: "debit",
        amountCents: 200,
        currency: "BRL",
        description: "reconciliation-mismatch",
        requestId: `req-mismatch-${suffix}`,
        provider: "openai",
        model: "gpt-4o-mini",
      },
      {
        tenantId,
        workspaceId,
        runId: runDuplicateId,
        entryType: "debit",
        amountCents: 20,
        currency: "BRL",
        description: "reconciliation-duplicate-a",
        requestId: `req-duplicate-${suffix}`,
        provider: "openai",
        model: "gpt-4o-mini",
      },
      {
        tenantId,
        workspaceId,
        runId: runDuplicateId,
        entryType: "debit",
        amountCents: 20,
        currency: "BRL",
        description: "reconciliation-duplicate-b",
        requestId: `req-duplicate-${suffix}`,
        provider: "openai",
        model: "gpt-4o-mini",
      },
      {
        tenantId,
        workspaceId: null,
        runId: null,
        entryType: "debit",
        amountCents: 77,
        currency: "BRL",
        description: "reconciliation-ledger-gap",
        requestId: `req-ledger-gap-${suffix}`,
        provider: "openai",
        model: "gpt-4o-mini",
      },
      {
        tenantId,
        workspaceId: workspaceOtherId,
        runId: runOtherWorkspaceId,
        entryType: "debit",
        amountCents: 70,
        currency: "BRL",
        description: "reconciliation-other-workspace",
        requestId: `req-other-workspace-${suffix}`,
        provider: "openai",
        model: "gpt-4o-mini",
      },
    ],
  });
});

after(async () => {
  await closeRunEventsTransport();
  await closeRunEventStream();
  await closePrismaResources();
});

test("Billing reconciliation summary exposes P2 baseline without importing the full app", async () => {
  const response = await request
    .get("/api/billing/reconciliation/summary")
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.equal(response.body?.data?.filters?.tenantId, tenantId);
  assert.equal(response.body?.data?.filters?.workspaceId, null);
  assert.equal(response.body?.data?.totals?.runsChecked, 5);
  assert.equal(response.body?.data?.totals?.missingLedgerCount, 1);
  assert.equal(response.body?.data?.totals?.costMismatchCount, 1);
  assert.equal(response.body?.data?.totals?.orphanUsageCount, 0);
  assert.equal(response.body?.data?.totals?.duplicateChargesCount, 1);
  assert.ok(response.body?.data?.totals?.ledgerGapCount >= 1);

  const auditIssues = response.body?.data?.items?.auditGaps?.map((item: any) => item.issue) ?? [];
  assert.ok(auditIssues.includes("missing_ledger"));
  assert.ok(auditIssues.includes("run_vs_breakdown_mismatch"));

  const duplicate = response.body?.data?.items?.duplicateCharges?.[0];
  assert.equal(duplicate?.runId, runDuplicateId);
  assert.equal(duplicate?.count, 2);

  const ledgerIssues = response.body?.data?.items?.ledgerGaps?.map((item: any) => item.issue) ?? [];
  assert.ok(ledgerIssues.includes("missing_workspace"));
  assert.ok(ledgerIssues.includes("ledger_without_run"));
});

test("Billing reconciliation summary respects workspace and run filters", async () => {
  const response = await request
    .get(`/api/billing/reconciliation/summary?workspaceId=${workspaceId}&runId=${runMismatchId}`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.equal(response.body?.data?.filters?.workspaceId, workspaceId);
  assert.equal(response.body?.data?.filters?.runId, runMismatchId);
  assert.equal(response.body?.data?.totals?.runsChecked, 1);
  assert.equal(response.body?.data?.items?.auditGaps?.[0]?.runId, runMismatchId);
  assert.equal(response.body?.data?.items?.auditGaps?.[0]?.issue, "run_vs_breakdown_mismatch");
});

test("Billing reconciliation summary can read a workspace different from the authenticated workspace", async () => {
  const response = await request
    .get(`/api/billing/reconciliation/summary?workspaceId=${workspaceOtherId}`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.equal(response.body?.data?.filters?.workspaceId, workspaceOtherId);
  assert.equal(response.body?.data?.totals?.runsChecked, 1);
  assert.equal(response.body?.data?.totals?.auditGapCount, 0);
  assert.equal(response.body?.data?.items?.auditGaps?.length, 0);
});
