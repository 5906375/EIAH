import assert from "node:assert/strict";
import test from "node:test";
import {
  WorkerTopologyConfigError,
  resolveWorkerTopology,
  type WorkerTopologyEnvironment,
  type WorkerTopologyReasonCode,
} from "./workerTopology";

function env(overrides: WorkerTopologyEnvironment = {}): WorkerTopologyEnvironment {
  return {
    NODE_ENV: "production",
    EIAH_ENVIRONMENT_ID: "unit",
    SERVICE_ROLE: "api",
    RUN_QUEUE_CONSUMER_MODE: "api-embedded",
    RUN_ATIVO_CONSUMER_MODE: "disabled",
    ...overrides,
  };
}

function expectReason(
  input: WorkerTopologyEnvironment,
  reasonCode: WorkerTopologyReasonCode,
) {
  assert.throws(
    () => resolveWorkerTopology(input),
    (error: unknown) =>
      error instanceof WorkerTopologyConfigError && error.reasonCode === reasonCode,
  );
}

test("fails closed when required production configuration is missing", () => {
  expectReason(
    { NODE_ENV: "production" },
    "WORKER_TOPOLOGY_ENVIRONMENT_ID_REQUIRED",
  );
  expectReason(
    env({ SERVICE_ROLE: undefined }),
    "WORKER_TOPOLOGY_SERVICE_ROLE_REQUIRED",
  );
  expectReason(
    env({ RUN_QUEUE_CONSUMER_MODE: undefined }),
    "WORKER_TOPOLOGY_RUN_QUEUE_MODE_REQUIRED",
  );
  expectReason(
    env({ RUN_ATIVO_CONSUMER_MODE: undefined }),
    "WORKER_TOPOLOGY_RUN_ATIVO_MODE_REQUIRED",
  );
});

test("rejects invalid enum values", () => {
  expectReason(
    env({ SERVICE_ROLE: "other" }),
    "WORKER_TOPOLOGY_SERVICE_ROLE_INVALID",
  );
  expectReason(
    env({ RUN_QUEUE_CONSUMER_MODE: "true" }),
    "WORKER_TOPOLOGY_RUN_QUEUE_MODE_INVALID",
  );
  expectReason(
    env({ RUN_ATIVO_CONSUMER_MODE: "standalone" }),
    "WORKER_TOPOLOGY_RUN_ATIVO_MODE_INVALID",
  );
});

test("allows API embedded ownership of runs only", () => {
  assert.deepEqual(resolveWorkerTopology(env()).consumes, {
    runs: true,
    runAtivoUniversal: false,
  });
});

test("allows standalone ownership of runs only", () => {
  const topology = resolveWorkerTopology(
    env({
      SERVICE_ROLE: "run-worker",
      RUN_QUEUE_CONSUMER_MODE: "standalone",
    }),
  );
  assert.deepEqual(topology.consumes, {
    runs: true,
    runAtivoUniversal: false,
  });
});

test("allows maintenance ownership of run-ativo-universal only", () => {
  const topology = resolveWorkerTopology(
    env({
      SERVICE_ROLE: "maintenance-worker",
      RUN_QUEUE_CONSUMER_MODE: "disabled",
      RUN_ATIVO_CONSUMER_MODE: "maintenance",
    }),
  );
  assert.deepEqual(topology.consumes, {
    runs: false,
    runAtivoUniversal: true,
  });
});

test("rejects queue ownership that conflicts with the service role", () => {
  expectReason(
    env({ SERVICE_ROLE: "api", RUN_QUEUE_CONSUMER_MODE: "standalone" }),
    "WORKER_TOPOLOGY_ROLE_RUN_QUEUE_CONFLICT",
  );
  expectReason(
    env({ SERVICE_ROLE: "run-worker", RUN_QUEUE_CONSUMER_MODE: "api-embedded" }),
    "WORKER_TOPOLOGY_ROLE_RUN_QUEUE_CONFLICT",
  );
  expectReason(
    env({ SERVICE_ROLE: "maintenance-worker", RUN_QUEUE_CONSUMER_MODE: "api-embedded" }),
    "WORKER_TOPOLOGY_ROLE_RUN_QUEUE_CONFLICT",
  );
});

test("forbids API and standalone from consuming run-ativo-universal", () => {
  expectReason(
    env({ RUN_ATIVO_CONSUMER_MODE: "maintenance" }),
    "WORKER_TOPOLOGY_ROLE_RUN_ATIVO_CONFLICT",
  );
  expectReason(
    env({
      SERVICE_ROLE: "run-worker",
      RUN_QUEUE_CONSUMER_MODE: "standalone",
      RUN_ATIVO_CONSUMER_MODE: "maintenance",
    }),
    "WORKER_TOPOLOGY_ROLE_RUN_ATIVO_CONFLICT",
  );
});

test("uses non-consuming defaults only in tests", () => {
  const topology = resolveWorkerTopology({ NODE_ENV: "test" });
  assert.equal(topology.environmentId, "test");
  assert.equal(topology.serviceRole, "api");
  assert.deepEqual(topology.consumes, {
    runs: false,
    runAtivoUniversal: false,
  });
});
