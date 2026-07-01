export const SERVICE_ROLES = ["api", "run-worker", "maintenance-worker"] as const;
export const RUN_QUEUE_CONSUMER_MODES = ["api-embedded", "standalone", "disabled"] as const;
export const RUN_ATIVO_CONSUMER_MODES = ["maintenance", "disabled"] as const;

export type ServiceRole = (typeof SERVICE_ROLES)[number];
export type RunQueueConsumerMode = (typeof RUN_QUEUE_CONSUMER_MODES)[number];
export type RunAtivoConsumerMode = (typeof RUN_ATIVO_CONSUMER_MODES)[number];

export type WorkerTopologyReasonCode =
  | "WORKER_TOPOLOGY_ENVIRONMENT_ID_REQUIRED"
  | "WORKER_TOPOLOGY_SERVICE_ROLE_REQUIRED"
  | "WORKER_TOPOLOGY_SERVICE_ROLE_INVALID"
  | "WORKER_TOPOLOGY_RUN_QUEUE_MODE_REQUIRED"
  | "WORKER_TOPOLOGY_RUN_QUEUE_MODE_INVALID"
  | "WORKER_TOPOLOGY_RUN_ATIVO_MODE_REQUIRED"
  | "WORKER_TOPOLOGY_RUN_ATIVO_MODE_INVALID"
  | "WORKER_TOPOLOGY_ROLE_RUN_QUEUE_CONFLICT"
  | "WORKER_TOPOLOGY_ROLE_RUN_ATIVO_CONFLICT";

export type WorkerTopologyEnvironment = Record<string, string | undefined>;

export type WorkerTopology = {
  environmentId: string;
  serviceRole: ServiceRole;
  runQueueConsumerMode: RunQueueConsumerMode;
  runAtivoConsumerMode: RunAtivoConsumerMode;
  consumes: {
    runs: boolean;
    runAtivoUniversal: boolean;
  };
};

export class WorkerTopologyConfigError extends Error {
  readonly reasonCode: WorkerTopologyReasonCode;

  constructor(reasonCode: WorkerTopologyReasonCode, message: string) {
    super(message);
    this.name = "WorkerTopologyConfigError";
    this.reasonCode = reasonCode;
  }
}

function optionalValue(env: WorkerTopologyEnvironment, key: string) {
  const value = env[key]?.trim();
  return value ? value : null;
}

function requireValue(
  env: WorkerTopologyEnvironment,
  key: string,
  reasonCode: WorkerTopologyReasonCode,
  testFallback: string,
) {
  const value = optionalValue(env, key);
  if (value) return value;
  if (env.NODE_ENV === "test") return testFallback;
  throw new WorkerTopologyConfigError(reasonCode, `${key} is required outside NODE_ENV=test`);
}

function parseEnum<T extends string>(params: {
  env: WorkerTopologyEnvironment;
  key: string;
  values: readonly T[];
  requiredReasonCode: WorkerTopologyReasonCode;
  invalidReasonCode: WorkerTopologyReasonCode;
  testFallback: T;
}) {
  const value = requireValue(
    params.env,
    params.key,
    params.requiredReasonCode,
    params.testFallback,
  );
  if (!params.values.includes(value as T)) {
    throw new WorkerTopologyConfigError(
      params.invalidReasonCode,
      `${params.key} must be one of: ${params.values.join(", ")}`,
    );
  }
  return value as T;
}

function assertRoleMatrix(topology: Omit<WorkerTopology, "consumes">) {
  const { serviceRole, runQueueConsumerMode, runAtivoConsumerMode } = topology;

  const runQueueModeAllowed =
    (serviceRole === "api" && ["api-embedded", "disabled"].includes(runQueueConsumerMode)) ||
    (serviceRole === "run-worker" && ["standalone", "disabled"].includes(runQueueConsumerMode)) ||
    (serviceRole === "maintenance-worker" && runQueueConsumerMode === "disabled");

  if (!runQueueModeAllowed) {
    throw new WorkerTopologyConfigError(
      "WORKER_TOPOLOGY_ROLE_RUN_QUEUE_CONFLICT",
      `SERVICE_ROLE=${serviceRole} cannot use RUN_QUEUE_CONSUMER_MODE=${runQueueConsumerMode}`,
    );
  }

  const runAtivoModeAllowed =
    (serviceRole === "maintenance-worker" &&
      ["maintenance", "disabled"].includes(runAtivoConsumerMode)) ||
    (serviceRole !== "maintenance-worker" && runAtivoConsumerMode === "disabled");

  if (!runAtivoModeAllowed) {
    throw new WorkerTopologyConfigError(
      "WORKER_TOPOLOGY_ROLE_RUN_ATIVO_CONFLICT",
      `SERVICE_ROLE=${serviceRole} cannot use RUN_ATIVO_CONSUMER_MODE=${runAtivoConsumerMode}`,
    );
  }
}

export function resolveWorkerTopology(
  env: WorkerTopologyEnvironment = process.env,
): WorkerTopology {
  const environmentId = requireValue(
    env,
    "EIAH_ENVIRONMENT_ID",
    "WORKER_TOPOLOGY_ENVIRONMENT_ID_REQUIRED",
    "test",
  );
  const serviceRole = parseEnum({
    env,
    key: "SERVICE_ROLE",
    values: SERVICE_ROLES,
    requiredReasonCode: "WORKER_TOPOLOGY_SERVICE_ROLE_REQUIRED",
    invalidReasonCode: "WORKER_TOPOLOGY_SERVICE_ROLE_INVALID",
    testFallback: "api",
  });
  const runQueueConsumerMode = parseEnum({
    env,
    key: "RUN_QUEUE_CONSUMER_MODE",
    values: RUN_QUEUE_CONSUMER_MODES,
    requiredReasonCode: "WORKER_TOPOLOGY_RUN_QUEUE_MODE_REQUIRED",
    invalidReasonCode: "WORKER_TOPOLOGY_RUN_QUEUE_MODE_INVALID",
    testFallback: "disabled",
  });
  const runAtivoConsumerMode = parseEnum({
    env,
    key: "RUN_ATIVO_CONSUMER_MODE",
    values: RUN_ATIVO_CONSUMER_MODES,
    requiredReasonCode: "WORKER_TOPOLOGY_RUN_ATIVO_MODE_REQUIRED",
    invalidReasonCode: "WORKER_TOPOLOGY_RUN_ATIVO_MODE_INVALID",
    testFallback: "disabled",
  });

  const topology = {
    environmentId,
    serviceRole,
    runQueueConsumerMode,
    runAtivoConsumerMode,
  };
  assertRoleMatrix(topology);

  return {
    ...topology,
    consumes: {
      runs:
        (serviceRole === "api" && runQueueConsumerMode === "api-embedded") ||
        (serviceRole === "run-worker" && runQueueConsumerMode === "standalone"),
      runAtivoUniversal:
        serviceRole === "maintenance-worker" && runAtivoConsumerMode === "maintenance",
    },
  };
}
