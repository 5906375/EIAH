import { Router } from "express";
import { z } from "zod";
import { enforceTenant, TenantAwareRequest } from "../middlewares/enforceTenant";
import { getMemoryService } from "../services/memory";
import type { MemoryRecord, MemoryScope } from "@eiah/core";

const memoryRouter = Router();
memoryRouter.use(enforceTenant);

const MemoryIngestSchema = z.object({
  agentId: z.string().min(1),
  records: z
    .array(
      z.object({
        key: z.string().min(1),
        content: z.string().min(1),
        metadata: z.record(z.any()).optional(),
        embedding: z.array(z.number()).min(4).optional(),
      })
    )
    .min(1),
});

const MemorySearchSchema = z.object({
  agentId: z.string().min(1),
  topK: z.number().int().min(1).max(200).optional(),
  queryEmbedding: z.array(z.number()).min(4).optional(),
});

memoryRouter.post("/memory", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: "AUTH_CONTEXT_MISSING" });
  }

  const parsed = MemoryIngestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const { agentId, records } = parsed.data;
  const memory = getMemoryService(authContext.tenantId, authContext.workspaceId, prisma);
  const scope: MemoryScope = {
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    agentId,
  };

  const now = new Date();
  const shortTerm: MemoryRecord[] = records.map((item) => ({
    key: item.key,
    content: item.content,
    metadata: item.metadata ?? {},
    createdAt: now,
  }));

  await memory.ingestShortTerm(scope, shortTerm);

  const vectors = records
    .filter((item) => Array.isArray(item.embedding))
    .map((item) => ({ key: item.key, values: item.embedding as number[], metadata: item.metadata ?? {} }));

  if (vectors.length > 0) {
    await memory.upsertVectors(scope, vectors);
  }

  return res.json({ ok: true, ingested: records.length, vectors: vectors.length });
});

memoryRouter.post("/memory/search", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: "AUTH_CONTEXT_MISSING" });
  }

  const parsed = MemorySearchSchema.safeParse(req.body ?? req.query);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const { agentId, topK, queryEmbedding } = parsed.data;
  const memory = getMemoryService(authContext.tenantId, authContext.workspaceId, prisma);
  const scope: MemoryScope = {
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    agentId,
  };

  const snapshot = await memory.snapshot(scope, {
    topK: topK ?? 20,
    vectorQuery: queryEmbedding,
  });

  return res.json({
    ok: true,
    data: {
      shortTerm: snapshot.shortTerm,
      longTerm: snapshot.longTerm,
      vectorMatches: snapshot.vectorMatches,
    },
  });
});

export { memoryRouter };
