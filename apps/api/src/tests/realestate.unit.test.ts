import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import { executeRegisteredAction } from "@eiah/core/actions/actionRegistry";
import {
  createFixedWindowRateLimiter,
  createInMemoryIdempotencyStore,
} from "@eiah/core/actions/guardrails";
import { registerRealEstateActions } from "packages/core/src/actions/realEstate/index";

async function readSchema(name: string) {
  const schemaPath = path.resolve(__dirname, `../../../../contracts/real-estate/${name}`);
  const raw = await fs.readFile(schemaPath, "utf-8");
  return JSON.parse(raw);
}

function assertSchemaHasRequiredFields(schema: any, requiredFields: string[]) {
  expect(schema).toBeTypeOf("object");
  expect(Array.isArray(schema.required)).toBe(true);
  requiredFields.forEach((field) => {
    expect(schema.required).toContain(field);
    expect(schema.properties?.[field]).toBeTruthy();
  });
}

describe("real-estate contracts and calendar action", () => {
  beforeAll(() => {
    registerRealEstateActions({
      idempotencyStore: createInMemoryIdempotencyStore(),
      rateLimiter: createFixedWindowRateLimiter({ limit: 60, windowMs: 60_000 }),
    });
  });

  it("validates requested real-estate schemas with canonical samples", async () => {
    const portfolioSchema = await readSchema("portfolio.schema.json");
    const unitSchema = await readSchema("unit.schema.json");
    const leaseSchema = await readSchema("lease.schema.json");
    const chargeSchema = await readSchema("chargeItem.schema.json");
    const evidenceSchema = await readSchema("allocationEvidence.schema.json");

    assertSchemaHasRequiredFields(portfolioSchema, ["tenantId", "workspaceId"]);
    assertSchemaHasRequiredFields(unitSchema, ["tenantId", "workspaceId"]);
    assertSchemaHasRequiredFields(leaseSchema, [
      "tenantId",
      "workspaceId",
      "leaseId",
      "period",
      "dueRule",
      "reminderOffsetBusinessDays",
      "rentAmount",
      "condoBaseAmount",
    ]);
    assertSchemaHasRequiredFields(chargeSchema, [
      "tenantId",
      "workspaceId",
      "leaseId",
      "period",
      "dueRule",
      "reminderOffsetBusinessDays",
      "rentAmount",
      "condoBaseAmount",
    ]);
    assertSchemaHasRequiredFields(evidenceSchema, ["tenantId", "workspaceId", "leaseId", "period"]);
    expect(leaseSchema.properties?.dueRule?.const).toBe("BUSINESS_DAY_NTH=6");
    expect(chargeSchema.properties?.dueRule?.const).toBe("BUSINESS_DAY_NTH=6");
  });

  it("computes nth business day with reminder offset", async () => {
    const result = await executeRegisteredAction("calendar.compute_due_date", {
      action: "calendar.compute_due_date",
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      runId: "run-realestate-unit",
      input: {
        period: "2026-02",
        nth: 6,
        reminderOffset: 2,
      },
    });

    expect(result.status).toBe("success");
    expect((result.output as any)?.dueDate).toBe("2026-02-09");
    expect((result.output as any)?.reminderDate).toBe("2026-02-05");
  });
});
