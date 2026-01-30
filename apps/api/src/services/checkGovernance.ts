// apps/api/src/services/checkGovernance.ts
import { assertGovernanceEnv } from "./intentValidator";

try {
  assertGovernanceEnv();
  console.log("✅ Governance check passed — all critical envs active");
  process.exit(0);
} catch (err) {
  console.error("❌ Governance check failed:", (err as Error).message);
  process.exit(1);
}
