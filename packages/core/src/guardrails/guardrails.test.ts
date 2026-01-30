import test from "node:test";
import assert from "node:assert/strict";
import { defaultRunGuardrails, runGuardrails } from "./index";

test("guardrails: placeholderTemplate blocks", async () => {
  const report = await runGuardrails(
    {
      runId: "r1",
      tenantId: "t1",
      workspaceId: "w1",
      agent: "a1",
      prompt: "hello",
      outputText: "As an AI language model, I cannot...",
    },
    defaultRunGuardrails()
  );

  assert.equal(report.action, "block");
  assert.ok(report.findings.some((f) => f.code === "output.placeholder_template"));
});

test("guardrails: evidenceRequired blocks on high-risk without evidence", async () => {
  const report = await runGuardrails(
    {
      runId: "r2",
      tenantId: "t1",
      workspaceId: "w1",
      agent: "a1",
      prompt: "transfer",
      outputText: "Você deve fazer um payment transfer agora.",
    },
    defaultRunGuardrails()
  );

  assert.equal(report.action, "block");
  assert.ok(report.findings.some((f) => f.code === "output.evidence_missing"));
});

test("guardrails: evidenceRequired allows when evidence present in JSON", async () => {
  const report = await runGuardrails(
    {
      runId: "r3",
      tenantId: "t1",
      workspaceId: "w1",
      agent: "a1",
      prompt: "cpf",
      outputText: JSON.stringify({ summary: "ok", evidence: ["doc:123"] }),
    },
    defaultRunGuardrails()
  );

  assert.notEqual(report.action, "block");
});

test("guardrails: toolUseRequired blocks when implies tool usage but plan has no actions", async () => {
  const report = await runGuardrails(
    {
      runId: "r4",
      tenantId: "t1",
      workspaceId: "w1",
      agent: "a1",
      prompt: "api",
      outputText: "Consultei a API e obtive a resposta.",
      plan: [],
    },
    defaultRunGuardrails()
  );

  assert.equal(report.action, "block");
  assert.ok(report.findings.some((f) => f.code === "output.tool_use_required"));
});

test("guardrails: toolUseRequired allows when plan has an action", async () => {
  const report = await runGuardrails(
    {
      runId: "r5",
      tenantId: "t1",
      workspaceId: "w1",
      agent: "a1",
      prompt: "api",
      outputText: "Consultei a API e obtive a resposta.",
      plan: [{ action: "some.tool" }],
    },
    defaultRunGuardrails()
  );

  assert.notEqual(report.action, "block");
});
