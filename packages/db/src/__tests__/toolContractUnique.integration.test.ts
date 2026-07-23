import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

const databaseUrl = process.env.MCP_1N_DATABASE_URL?.trim();

if (!databaseUrl) {
  test(
    "ToolContract rejects a duplicate tenantId/name/version triple in PostgreSQL",
    { skip: "MCP_1N_DATABASE_URL is required for the real DB test" },
    () => {},
  );
} else {
  test("ToolContract rejects a duplicate tenantId/name/version triple in PostgreSQL", async () => {
    process.env.DATABASE_URL = databaseUrl;
    const { prismaGlobal, closePrismaResources } = await import("../index.ts");
    const suffix = `${Date.now()}-${process.pid}`;
    const tenantId = `mcp-1n-tenant-${suffix}`;
    const name = `mcp-1n.tool.${suffix}`;
    const version = "1.0.0";
    const contract = {
      name,
      version,
      tenantId,
      inputSchema: {},
      executor: "http",
      trustLevel: 0,
    };

    try {
      await prismaGlobal.tenant.create({
        data: { id: tenantId, name: `MCP-1N tenant ${suffix}` },
      });
      await prismaGlobal.toolContract.create({ data: contract });

      await assert.rejects(
        prismaGlobal.toolContract.create({
          data: { ...contract, status: "deprecated" },
        }),
        (error: unknown) =>
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2002",
      );
    } finally {
      await prismaGlobal.toolContract.deleteMany({ where: { tenantId } });
      await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
      await closePrismaResources();
    }
  });
}
