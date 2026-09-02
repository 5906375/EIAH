import { env as processEnv } from "node:process";
import type { StructuredLogger } from "@eiah/core/logging/logger";

export const SECURITY_RELAXATION_ENV_KEYS = [
  "EIAH_ALLOW_UNVERIFIED_WALLET",
  "EIAH_ALLOW_PASSWORD_BOOTSTRAP",
  "EIAH_ALLOW_EMAIL_PASSWORD_RESET",
  "EIAH_ALLOW_GUARDRAIL_WARN_ONLY",
] as const;

export type SecurityRelaxationEnvKey = (typeof SECURITY_RELAXATION_ENV_KEYS)[number];

function isExplicitlyEnabled(
  key: SecurityRelaxationEnvKey,
  env: NodeJS.ProcessEnv = processEnv,
) {
  return env[key] === "true";
}

export function allowUnverifiedWallet(env: NodeJS.ProcessEnv = processEnv) {
  return isExplicitlyEnabled("EIAH_ALLOW_UNVERIFIED_WALLET", env);
}

export function allowPasswordBootstrap(env: NodeJS.ProcessEnv = processEnv) {
  return isExplicitlyEnabled("EIAH_ALLOW_PASSWORD_BOOTSTRAP", env);
}

export function allowEmailPasswordReset(env: NodeJS.ProcessEnv = processEnv) {
  return isExplicitlyEnabled("EIAH_ALLOW_EMAIL_PASSWORD_RESET", env);
}

export function allowGuardrailWarnOnly(env: NodeJS.ProcessEnv = processEnv) {
  return isExplicitlyEnabled("EIAH_ALLOW_GUARDRAIL_WARN_ONLY", env);
}

export function resolveGuardrailBlockMode(
  env: NodeJS.ProcessEnv = processEnv,
): "block" | "warn" {
  return allowGuardrailWarnOnly(env) ? "warn" : "block";
}

export function listEnabledSecurityRelaxations(
  env: NodeJS.ProcessEnv = processEnv,
): SecurityRelaxationEnvKey[] {
  return SECURITY_RELAXATION_ENV_KEYS.filter((key) => isExplicitlyEnabled(key, env));
}

export function warnEnabledSecurityRelaxations(
  logger: Pick<StructuredLogger, "warn">,
  env: NodeJS.ProcessEnv = processEnv,
) {
  for (const flag of listEnabledSecurityRelaxations(env)) {
    logger.warn({ flag }, "security.relaxation_enabled");
  }
}
