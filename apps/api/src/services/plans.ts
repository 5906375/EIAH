import { createHash } from "node:crypto";
import {
  PlanSpec,
  PlanSpecSchema,
  evaluatePlanSpecAdditionalInfo,
  publishAction,
  type NeedMoreInfoPayload,
} from "@eiah/core";

export function safeParsePlanSpec(candidate: unknown) {
  return PlanSpecSchema.safeParse(candidate);
}

export function evaluatePlanSpecNeeds(spec: PlanSpec): NeedMoreInfoPayload | null {
  return evaluatePlanSpecAdditionalInfo(spec);
}

function deriveIdempotencyKey(
  spec: PlanSpec,
  workspaceId: string,
  override?: string | null
) {
  if (override && override.trim().length > 0) {
    return override.trim();
  }

  const hash = createHash("sha256");
  hash.update(workspaceId);
  hash.update(spec.plan_id);
  hash.update(JSON.stringify(spec));

  return hash.digest("hex");
}

export async function enqueuePlanCreationJob(params: {
  spec: PlanSpec;
  tenantId: string;
  workspaceId: string;
  userId?: string;
  idempotencyKey?: string | null;
}) {
  const idempotencyKey = deriveIdempotencyKey(
    params.spec,
    params.workspaceId,
    params.idempotencyKey
  );

  const job = await publishAction(
    {
      action: "billing.create_white_label_plan",
      input: {
        spec: params.spec,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        idempotencyKey,
      },
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      metadata: {
        planId: params.spec.plan_id,
      },
    },
    {
      jobId: idempotencyKey,
      removeOnComplete: true,
    }
  );

  return {
    jobId: job.id,
    idempotencyKey,
  };
}
