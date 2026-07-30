export const CONNECTION_REASON_CODES = {
  redisUrlRequired: "REDIS_URL_REQUIRED",
} as const;

export type ConnectionReasonCode =
  (typeof CONNECTION_REASON_CODES)[keyof typeof CONNECTION_REASON_CODES];

export class ConnectionPolicyError extends Error {
  constructor(
    readonly reasonCode: ConnectionReasonCode,
    message: string,
  ) {
    super(message);
    this.name = "ConnectionPolicyError";
  }
}

export function requireRedisUrl(value: string | undefined, context: string): string {
  if (!value || value.trim().length === 0) {
    throw new ConnectionPolicyError(
      CONNECTION_REASON_CODES.redisUrlRequired,
      `${context}: REDIS_URL_REQUIRED — Redis URL must be configured explicitly. ` +
        `Set REDIS_URL (or the service-specific variable) in your environment. ` +
        `Localhost fallback is forbidden in runtime.`,
    );
  }
  if (/\$\{[^}]+\}/.test(value)) {
    throw new Error(
      `${context}: CONFIG_PLACEHOLDER_UNRESOLVED — Redis URL contains an unresolved placeholder. ` +
        `Set REDIS_URL (or the service-specific variable) to an explicit redis:// or rediss:// URL.`
    );
  }
  return value;
}
