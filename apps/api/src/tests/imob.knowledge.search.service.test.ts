import test from "node:test";
import assert from "node:assert/strict";

import { searchImobKnowledge } from "../services/imob/imobKnowledgeSearch";

test("IMOB knowledge search service returns metadata-scoped results", async () => {
  const result = await searchImobKnowledge({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    query: "contratos de locação em São Paulo",
    filters: {
      region: "São Paulo",
      segment: "locacao",
    },
  });

  assert.equal(result.query, "contratos de locação em São Paulo");
  assert.ok(result.total >= 1);
  assert.ok(result.items.every((item) => item.region === "São Paulo" || item.region === "Brasil"));
  assert.ok(result.items.every((item) => item.segment === "locacao" || item.segment === "ambos"));
});

test("IMOB knowledge search service filters by document type and operation", async () => {
  const result = await searchImobKnowledge({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    query: "captação venda",
    filters: {
      documentType: "playbook",
      operationType: "captacao",
    },
  });

  assert.ok(result.total >= 1);
  assert.ok(result.items.every((item) => item.documentType === "playbook"));
  assert.ok(result.items.every((item) => item.operationType === "captacao"));
  assert.equal(result.items[0]?.sourceType, "internal_doc");
});
