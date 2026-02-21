import { z } from "zod";

export const RunJobPayloadSchema = z.object({
  runId: z.string().uuid().optional(),
  tenantId: z.string().optional(),
  workspaceId: z.string().optional(),
  userId: z.string().optional(),
  runMode: z.enum(["LIVE", "DRY_RUN"]).optional(),
  agent: z.string(),
  prompt: z.string(),
  metadata: z.record(z.any()).optional()
});

export type RunJobPayload = z.infer<typeof RunJobPayloadSchema>;

export const ActionJobPayloadSchema = z.object({
  actionId: z.string().uuid().optional(),
  runId: z.string().optional(),
  stepId: z.string().optional(),
  action: z.string(),
  input: z.record(z.any()).optional(),
  tenantId: z.string().optional(),
  workspaceId: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

export type ActionJobPayload = z.infer<typeof ActionJobPayloadSchema>;

export const MaintenanceJobPayloadSchema = z.object({
  kind: z.enum(["memory-sync", "knowledge-backfill", "ledger-reconcile"]),
  params: z.record(z.any())
});

export type MaintenanceJobPayload = z.infer<typeof MaintenanceJobPayloadSchema>;
