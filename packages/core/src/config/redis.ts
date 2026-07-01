export function requireRedisUrl(value: string | undefined, context: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(
      `${context}: REDIS_URL_REQUIRED — Redis URL must be configured explicitly. ` +
        `Set REDIS_URL (or the service-specific variable) in your environment. ` +
        `Localhost fallback is forbidden in runtime.`
    );
  }
  return value;
}
