import { z } from "zod";
import { registerAction } from "./actionRegistry";
import { rateLimit, type RateLimiter } from "./guardrails";

export type RegisterRiskActionsOptions = {
  rateLimiter: RateLimiter;
};

const checklistInputSchema = z.object({
  checklistId: z.string().min(1),
  subjectId: z.string().min(1),
  attributes: z.record(z.any()).optional(),
  strict: z.boolean().default(false),
});

const checklistOutputSchema = z.object({
  status: z.enum(["compliant", "warning", "blocked"]),
  findings: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      severity: z.enum(["low", "medium", "high"]),
    })
  ),
  generatedAt: z.date(),
});

export function registerRiskActions(options: RegisterRiskActionsOptions) {
  registerAction({
    name: "risk.runChecklist",
    description: "Execute a risk & compliance checklist pipeline.",
    version: "1.0.0",
    contract: {
      input: checklistInputSchema,
      output: checklistOutputSchema,
    },
    guardrails: [
      rateLimit({
        limiter: options.rateLimiter,
        keyResolver: (context) =>
          ["risk", "checklist", context.workspaceId ?? context.tenantId ?? "global"].join(
            ":"
          ),
        onLimitExceededMessage: "Risk checklist rate exceeded.",
      }),
    ],
    handler: async ({ input, logger }) => {
      const payload = checklistInputSchema.parse(input);
      logger?.("risk.checklist.start", {
        checklistId: payload.checklistId,
        strict: payload.strict,
      });
      // TODO: integrate with risk engine or policy store
      return {
        status: "success",
        output: checklistOutputSchema.parse({
          status: "compliant",
          findings: [],
          generatedAt: new Date(),
        }),
      };
    },
  });
}
