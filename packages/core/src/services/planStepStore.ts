import { Prisma } from "@repo/db";
import type { PrismaClient } from "@repo/db";

export type PlanStepPayload = {
  runId: string;
  tenantId: string;
  workspaceId: string;
  stepIndex: number;
  stepType: string;
  input?: Prisma.JsonValue | null;
  output?: Prisma.JsonValue | null;
};

export class PlanStepStore {
  constructor(private readonly prisma: PrismaClient) {}

  async saveStep(payload: PlanStepPayload) {
    return this.prisma.planStepRecord.create({
      data: {
        runId: payload.runId,
        tenantId: payload.tenantId,
        workspaceId: payload.workspaceId,
        stepIndex: payload.stepIndex,
        stepType: payload.stepType,
        input: payload.input ?? Prisma.JsonNull,
        output: payload.output ?? Prisma.JsonNull,
      },
    });
  }
}
