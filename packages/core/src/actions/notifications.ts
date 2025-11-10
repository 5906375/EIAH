import { z } from "zod";
import { registerAction } from "./actionRegistry";
import {
  rateLimit,
  requireIdempotency,
  type IdempotencyStore,
  type RateLimiter,
} from "./guardrails";

export type RegisterNotificationActionsOptions = {
  idempotencyStore: IdempotencyStore;
  rateLimiter: RateLimiter;
};

const slackInputSchema = z.object({
  channel: z.string().min(1),
  message: z.string().min(1),
  mentions: z.array(z.string()).optional(),
  correlationId: z.string().optional(),
});

const slackOutputSchema = z.object({
  delivered: z.boolean(),
  ts: z.string(),
});

const pagerDutyInputSchema = z.object({
  routingKey: z.string().min(10),
  summary: z.string().min(1),
  source: z.string().min(1),
  severity: z.enum(["info", "warning", "error", "critical"]).default("info"),
  dedupKey: z.string().optional(),
});

const pagerDutyOutputSchema = z.object({
  incidentId: z.string(),
  status: z.enum(["triggered", "acknowledged"]),
});

const emailInputSchema = z.object({
  to: z.array(z.string().email()).min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  idempotencyKey: z.string().optional(),
});

const emailOutputSchema = z.object({
  delivered: z.boolean(),
  messageId: z.string(),
});

export function registerNotificationActions(options: RegisterNotificationActionsOptions) {
  registerAction({
    name: "notification.sendSlack",
    description: "Send a message to Slack channel or user.",
    version: "1.1.0",
    contract: {
      input: slackInputSchema,
      output: slackOutputSchema,
    },
    guardrails: [
      requireIdempotency({
        store: options.idempotencyStore,
        keyResolver: (context) => {
          const payload = context.input as z.infer<typeof slackInputSchema>;
          return ["notify", "slack", context.workspaceId, payload?.correlationId ?? ""]
            .filter(Boolean)
            .join(":");
        },
        ttlMs: 2 * 60 * 1000,
        onDuplicateMessage: "Slack notification already sent recently.",
      }),
      rateLimit({
        limiter: options.rateLimiter,
        keyResolver: (context) =>
          ["notify", "slack", context.workspaceId ?? context.tenantId ?? "global"].join(
            ":"
          ),
        onLimitExceededMessage: "Slack notification rate exceeded.",
      }),
    ],
    handler: async ({ input, logger }) => {
      const payload = slackInputSchema.parse(input);
      logger?.("notification.slack.start", {
        channel: payload.channel,
        mentionCount: payload.mentions?.length ?? 0,
      });
      // TODO: call Slack API
      return {
        status: "success",
        output: slackOutputSchema.parse({
          delivered: true,
          ts: Date.now().toString(),
        }),
      };
    },
  });

  registerAction({
    name: "notification.triggerPagerDuty",
    description: "Trigger a PagerDuty incident with given payload.",
    version: "1.0.1",
    contract: {
      input: pagerDutyInputSchema,
      output: pagerDutyOutputSchema,
    },
    guardrails: [
      requireIdempotency({
        store: options.idempotencyStore,
        keyResolver: (context) => {
          const payload = context.input as z.infer<typeof pagerDutyInputSchema>;
          return ["notify", "pagerduty", context.workspaceId, payload?.dedupKey ?? ""]
            .filter(Boolean)
            .join(":");
        },
        ttlMs: 10 * 60 * 1000,
        onDuplicateMessage: "PagerDuty event already triggered for this dedup key.",
      }),
    ],
    handler: async ({ input, logger }) => {
      const payload = pagerDutyInputSchema.parse(input);
      logger?.("notification.pagerduty.start", {
        summary: payload.summary,
        severity: payload.severity,
      });
      // TODO: call PagerDuty API
      return {
        status: "success",
        output: pagerDutyOutputSchema.parse({
          incidentId: `pd-${Math.random().toString(16).slice(2, 8)}`,
          status: "triggered",
        }),
      };
    },
  });

  registerAction({
    name: "notification.sendEmail",
    description: "Send transactional email using configured provider.",
    version: "1.0.0",
    contract: {
      input: emailInputSchema,
      output: emailOutputSchema,
    },
    guardrails: [
      requireIdempotency({
        store: options.idempotencyStore,
        keyResolver: (context) => {
          const payload = context.input as z.infer<typeof emailInputSchema>;
          return [
            "notify",
            "email",
            context.workspaceId,
            payload?.idempotencyKey ?? context.runId ?? "",
          ]
            .filter(Boolean)
            .join(":");
        },
        ttlMs: 10 * 60 * 1000,
        onDuplicateMessage: "Duplicate email suppressed by idempotency guardrail.",
      }),
      rateLimit({
        limiter: options.rateLimiter,
        keyResolver: (context) =>
          ["notify", "email", context.workspaceId ?? context.tenantId ?? "global"].join(
            ":"
          ),
        onLimitExceededMessage: "Email sending rate exceeded.",
      }),
    ],
    handler: async ({ input, logger }) => {
      const payload = emailInputSchema.parse(input);
      logger?.("notification.email.start", {
        recipients: payload.to.length,
        subject: payload.subject,
      });
      // TODO: integrate with email provider
      return {
        status: "success",
        output: emailOutputSchema.parse({
          delivered: true,
          messageId: `mail-${Math.random().toString(16).slice(2, 10)}`,
        }),
      };
    },
  });
}
