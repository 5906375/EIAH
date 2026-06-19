import "./support/testInfraEnv.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {
  createDraft,
  consumeDraft,
  expireDraft,
  closeDraftStoreResources,
  _clearAllDraftsForTesting,
} from "../services/imob/intake/imobContractDraftService";
import { cleanupExpiredUploadedDocuments } from "../services/uploadRetentionService";
import { createStorageProviderFromEnv } from "../services/storageProvider";
import {
  getImobIntakeCounterSnapshot,
  getImobIntakeObservabilityEventsForTesting,
  IMOB_INTAKE_OBSERVABILITY_COUNTER,
  renderImobIntakeCountersAsPrometheusText,
  resetImobIntakeObservabilityForTesting,
} from "../services/imob/intake/imobIntakeObservability";
import type { ImobContractClassification } from "../services/imob/intake/imobContractClassifier";
import type { ImobExtractedLease } from "../services/imob/intake/imobLeaseExtractor";

function makeLease(): ImobExtractedLease {
  return {
    propertyLabel: "apto 101",
    city: "Florianópolis",
    state: "SC",
    monthlyRentCents: 200000,
    condoFeeCents: 30000,
    depositCents: 200000,
    depositInstallmentCents: 100000,
    startDate: "2026-07-01",
    endDate: "2027-07-01",
    adjustmentIndex: "IPCA anual",
    lateFeePercent: 2,
    monthlyInterestPercent: 1,
    gracePeriodBusinessDays: 3,
    contractPurpose: "residencial",
  };
}

function makeClassification(): ImobContractClassification {
  return {
    documentType: "lease_contract",
    contractType: "residential_lease",
    canonicalJourneyType: "documentation",
    suggestedActionId: "imob.contract.intake",
    requiresConfirmation: true,
  };
}

function makeDraftParams() {
  return {
    tenantId: "tenant-observability",
    workspaceId: "workspace-observability",
    extractedLease: makeLease(),
    classification: makeClassification(),
    evidenceDrafts: [{ documentHash: "hash-observability", documentKind: "lease_contract" as const, piiMasked: true as const }],
    pendingItems: ["documento complementar"],
    riskFlags: ["lateFee > 2%"],
  };
}

function createFakeUploadClient() {
  return {
    uploadedDocument: {
      async findMany() {
        return [
          {
            id: "doc-1",
            tenantId: "tenant-observability",
            workspaceId: "workspace-observability",
            agentSlug: "imob-intake",
            fileName: "contrato-observability.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            sizeBytes: 128,
            storageKey: "tenant-observability/workspace-observability/doc-1.docx",
            createdAt: new Date("2026-05-01T00:00:00.000Z"),
          },
        ];
      },
      async deleteMany() {
        return { count: 1 };
      },
    },
  };
}

const previousEnv = {
  DRAFT_STORE: process.env.DRAFT_STORE,
  NODE_ENV: process.env.NODE_ENV,
  STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
  OBJECT_STORAGE_ADAPTER: process.env.OBJECT_STORAGE_ADAPTER,
  OBJECT_STORAGE_BUCKET: process.env.OBJECT_STORAGE_BUCKET,
  OBJECT_STORAGE_ENDPOINT: process.env.OBJECT_STORAGE_ENDPOINT,
  OBJECT_STORAGE_REGION: process.env.OBJECT_STORAGE_REGION,
  OBJECT_STORAGE_ACCESS_KEY_ID: process.env.OBJECT_STORAGE_ACCESS_KEY_ID,
  OBJECT_STORAGE_SECRET_ACCESS_KEY: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
};

test.beforeEach(async () => {
  process.env.NODE_ENV = "test";
  process.env.DRAFT_STORE = "memory";
  resetImobIntakeObservabilityForTesting();
  await closeDraftStoreResources();
  await _clearAllDraftsForTesting();
});

test.after(async () => {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (typeof value === "string") process.env[key] = value;
    else delete process.env[key];
  }
  await closeDraftStoreResources();
});

test("observability emits draft and cleanup events without PII", async () => {
  const draft = await createDraft(makeDraftParams());
  await consumeDraft(draft.draftId, { tenantId: draft.tenantId, workspaceId: draft.workspaceId });
  const mismatchedDraft = await createDraft(makeDraftParams());
  await consumeDraft(mismatchedDraft.draftId, { tenantId: mismatchedDraft.tenantId, workspaceId: "workspace-other" });
  const draftToExpire = await createDraft(makeDraftParams());
  await expireDraft(draftToExpire.draftId, 0);

  await cleanupExpiredUploadedDocuments({
    prisma: createFakeUploadClient() as never,
    enabled: true,
    dryRun: true,
    now: new Date("2026-06-18T12:00:00.000Z"),
    deps: {
      objectExists: async () => true,
      deleteObject: async () => undefined,
    },
  });

  await cleanupExpiredUploadedDocuments({
    prisma: createFakeUploadClient() as never,
    enabled: false,
    dryRun: true,
    now: new Date("2026-06-18T12:00:00.000Z"),
  });

  await cleanupExpiredUploadedDocuments({
    prisma: createFakeUploadClient() as never,
    enabled: true,
    dryRun: false,
    now: new Date("2026-06-18T12:00:00.000Z"),
    deps: {
      objectExists: async () => true,
      deleteObject: async () => {
        throw new Error("delete failed");
      },
    },
  });

  const events = getImobIntakeObservabilityEventsForTesting();
  const eventNames = events.map((event) => event.event);
  assert.ok(eventNames.includes("draft_store_mode"));
  assert.ok(eventNames.includes("draft_created"));
  assert.ok(eventNames.includes("draft_consumed"));
  assert.ok(eventNames.includes("draft_expired"));
  assert.ok(eventNames.includes("draft_scope_mismatch"));
  assert.ok(eventNames.includes("upload_retention_skipped"));
  assert.ok(eventNames.includes("upload_retention_candidates"));
  assert.ok(eventNames.includes("upload_retention_failed"));

  const serialized = JSON.stringify(events);
  assert.ok(!serialized.includes("Florianópolis"));
  assert.ok(!serialized.includes("documento complementar"));
  assert.ok(!serialized.includes("hash-observability"));
  assert.ok(!serialized.includes("contrato-observability.docx"));

  const counters = getImobIntakeCounterSnapshot();
  assert.equal(counters.get('imob_intake_drafts_created_total'), 3);
  assert.equal(counters.get('imob_intake_drafts_consumed_total'), 1);
  assert.equal(counters.get('imob_intake_drafts_expired_total{source="manual"}'), 1);
  assert.equal(counters.get('imob_intake_drafts_scope_mismatch_total'), 1);
  assert.equal(counters.get('imob_intake_cleanup_candidates_total{mode="dry-run"}'), 1);
  assert.equal(counters.get('imob_intake_cleanup_skipped_total{mode="disabled"}'), 1);
  assert.equal(counters.get('imob_intake_cleanup_failures_total{mode="delete",reasonCode="DELETE_FAILED"}'), 1);

  const prometheus = renderImobIntakeCountersAsPrometheusText();
  assert.ok(prometheus.includes(IMOB_INTAKE_OBSERVABILITY_COUNTER.DRAFTS_CREATED));
  assert.ok(prometheus.includes(IMOB_INTAKE_OBSERVABILITY_COUNTER.CLEANUP_CANDIDATES));
});

test("object storage gate emits safe reasonCode and provider mode", () => {
  process.env.STORAGE_PROVIDER = "object";
  process.env.OBJECT_STORAGE_ADAPTER = "s3-compatible";
  delete process.env.OBJECT_STORAGE_BUCKET;
  process.env.OBJECT_STORAGE_ENDPOINT = "https://bucket.example.internal";
  process.env.OBJECT_STORAGE_REGION = "us-east-1";
  process.env.OBJECT_STORAGE_ACCESS_KEY_ID = "secret-access";
  process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = "super-secret";

  assert.throws(
    () => createStorageProviderFromEnv({ localRootDir: "/tmp/eiah-observability-test" }),
    /OBJECT_STORAGE_BUCKET obrigatório/,
  );

  const events = getImobIntakeObservabilityEventsForTesting();
  const providerEvent = events.find((event) => event.event === "storage_provider_mode");
  const gateEvent = events.find((event) => event.event === "object_storage_gate_failed");
  assert.ok(providerEvent);
  assert.equal(providerEvent?.payload.mode, "object");
  assert.ok(gateEvent);
  assert.equal(gateEvent?.payload.reasonCode, "OBJECT_STORAGE_BUCKET_REQUIRED");

  const serialized = JSON.stringify(gateEvent);
  assert.ok(!serialized.includes("super-secret"));
  assert.ok(!serialized.includes("secret-access"));
});

test("touched intake observability files use direct imports instead of the broad @eiah/core barrel", async () => {
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const files = [
    "apps/api/src/services/imob/intake/imobIntakeObservability.ts",
    "apps/api/src/services/imob/intake/imobContractDraftService.ts",
    "apps/api/src/services/storageProvider.ts",
    "apps/api/src/services/uploadRetentionService.ts",
    "apps/api/src/workers/uploadRetentionWorker.ts",
  ];

  for (const file of files) {
    const content = await readFile(path.join(repoRoot, file), "utf8");
    assert.ok(!content.includes('from "@eiah/core";'), `${file} must not import the broad @eiah/core barrel`);
  }
});
