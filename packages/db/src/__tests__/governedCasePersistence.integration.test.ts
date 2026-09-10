import assert from "node:assert/strict";
import process from "node:process";
import { after, test } from "node:test";

const databaseUrl = process.env.DATABASE_URL?.trim();
const validHash = "sha256:" + "a".repeat(64);
let dbModulePromise: Promise<typeof import("../index.ts")> | undefined;

function loadDb() {
  dbModulePromise ??= import("../index.ts");
  return dbModulePromise;
}

function scope(suffix: string) {
  return {
    tenantId: "pre-duimp-db-tenant-" + suffix,
    workspaceId: "pre-duimp-db-workspace-" + suffix,
  };
}

async function createScope(db: any, ids: ReturnType<typeof scope>) {
  await db.tenant.create({
    data: { id: ids.tenantId, name: "PRE-DUIMP DB tenant " + ids.tenantId },
  });
  await db.workspace.create({
    data: {
      id: ids.workspaceId,
      tenantId: ids.tenantId,
      name: "PRE-DUIMP DB workspace " + ids.workspaceId,
    },
  });
}

function governedCaseData(
  ids: ReturnType<typeof scope>,
  caseId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: caseId,
    tenantId: ids.tenantId,
    workspaceId: ids.workspaceId,
    schemaVersion: "1.0.0",
    caseType: "PRE_DUIMP",
    revision: 1,
    lifecycle: "DISCOVERY" as const,
    subject: { reference: caseId },
    domainState: {},
    snapshot: { reference: caseId },
    snapshotHash: validHash,
    ...overrides,
  };
}

function revisionData(
  ids: ReturnType<typeof scope>,
  caseId: string,
  revisionId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: revisionId,
    caseId,
    tenantId: ids.tenantId,
    workspaceId: ids.workspaceId,
    revision: 1,
    schemaVersion: "1.0.0",
    lifecycle: "DISCOVERY" as const,
    snapshot: { reference: revisionId },
    snapshotHash: validHash,
    fromLifecycle: null,
    toLifecycle: "DISCOVERY" as const,
    actorType: "system",
    actorRef: null,
    transitionCode: "case.created",
    ...overrides,
  };
}

function stamp(label: string) {
  return label + "-" + Date.now() + "-" + process.pid + "-" + Math.random().toString(16).slice(2);
}

if (!databaseUrl) {
  test(
    "governed case persistence requires the dedicated local PostgreSQL URL",
    { skip: "DATABASE_URL is required for the real DB tests" },
    () => {},
  );
} else {
  after(async () => {
    if (dbModulePromise) {
      const { closePrismaResources } = await dbModulePromise;
      await closePrismaResources();
    }
  });

  test("governed case tables and lifecycle enum exist", async () => {
    const { prismaGlobal } = await loadDb();
    const rows = await prismaGlobal.$queryRawUnsafe<Array<Record<string, unknown>>>(
      "SELECT to_regclass('public.governed_cases')::text AS cases, " +
        "to_regclass('public.governed_case_revisions')::text AS revisions, " +
        "EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GovernedCaseLifecycle') AS lifecycle",
    );

    assert.equal(rows[0]?.cases, "governed_cases");
    assert.equal(rows[0]?.revisions, "governed_case_revisions");
    assert.equal(rows[0]?.lifecycle, true);
  });

  test("tenant clients isolate governed cases by tenant and workspace", async () => {
    const { prismaGlobal, getPrismaForTenant } = await loadDb();
    const suffix = stamp("isolation");
    const a = scope(suffix + "-a");
    const b = scope(suffix + "-b");
    const caseA = "pre-duimp-case-" + suffix + "-a";
    const caseB = "pre-duimp-case-" + suffix + "-b";

    try {
      await createScope(prismaGlobal, a);
      await createScope(prismaGlobal, b);
      const tenantA = getPrismaForTenant(a.tenantId, a.workspaceId);
      const tenantB = getPrismaForTenant(b.tenantId, b.workspaceId);

      const dataA = governedCaseData(a, caseA);
      const dataB = governedCaseData(b, caseB);
      delete (dataA as any).tenantId;
      delete (dataA as any).workspaceId;
      delete (dataB as any).tenantId;
      delete (dataB as any).workspaceId;

      await tenantA.governedCase.create({ data: dataA });
      await tenantB.governedCase.create({ data: dataB });

      assert.equal(await tenantA.governedCase.count(), 1);
      assert.equal(await tenantB.governedCase.count(), 1);
      assert.equal(await tenantA.governedCase.findFirst({ where: { id: caseB } }), null);
      assert.equal(await tenantB.governedCase.findFirst({ where: { id: caseA } }), null);
    } finally {
      await prismaGlobal.governedCase.deleteMany({
        where: { tenantId: { in: [a.tenantId, b.tenantId] } },
      });
      await prismaGlobal.workspace.deleteMany({
        where: { id: { in: [a.workspaceId, b.workspaceId] } },
      });
      await prismaGlobal.tenant.deleteMany({
        where: { id: { in: [a.tenantId, b.tenantId] } },
      });
    }
  });

  test("hash and positive revision constraints reject invalid cases", async () => {
    const { prismaGlobal } = await loadDb();

    for (const overrides of [{ snapshotHash: "invalid" }, { revision: 0 }]) {
      const suffix = stamp("constraint");
      const ids = scope(suffix);
      await assert.rejects(
        prismaGlobal.$transaction(async (tx) => {
          await createScope(tx, ids);
          await tx.governedCase.create({
            data: governedCaseData(ids, "pre-duimp-case-" + suffix, overrides),
          });
        }),
      );
    }
  });

  test("composite FK rejects a revision with a different scope", async () => {
    const { prismaGlobal } = await loadDb();
    const suffix = stamp("cross-scope");
    const a = scope(suffix + "-a");
    const b = scope(suffix + "-b");
    const caseId = "pre-duimp-case-" + suffix;

    await assert.rejects(
      prismaGlobal.$transaction(async (tx) => {
        await createScope(tx, a);
        await createScope(tx, b);
        await tx.governedCase.create({ data: governedCaseData(a, caseId) });
        await tx.governedCaseRevision.create({
          data: revisionData(b, caseId, "pre-duimp-revision-" + suffix),
        });
      }),
    );
  });

  test("case and first revision are atomic when a duplicate revision fails", async () => {
    const { prismaGlobal } = await loadDb();
    const suffix = stamp("atomic");
    const ids = scope(suffix);
    const caseId = "pre-duimp-case-" + suffix;

    await assert.rejects(
      prismaGlobal.$transaction(async (tx) => {
        await createScope(tx, ids);
        await tx.governedCase.create({ data: governedCaseData(ids, caseId) });
        await tx.governedCaseRevision.create({
          data: revisionData(ids, caseId, "pre-duimp-revision-" + suffix + "-1"),
        });
        await tx.governedCaseRevision.create({
          data: revisionData(ids, caseId, "pre-duimp-revision-" + suffix + "-2"),
        });
      }),
    );

    assert.equal(
      await prismaGlobal.governedCase.count({ where: { tenantId: ids.tenantId } }),
      0,
    );
    assert.equal(
      await prismaGlobal.tenant.count({ where: { id: ids.tenantId } }),
      0,
    );
  });

  for (const operation of ["update", "delete"] as const) {
    test("revision history rejects " + operation, async () => {
      const { prismaGlobal } = await loadDb();
      const suffix = stamp("append-only-" + operation);
      const ids = scope(suffix);
      const caseId = "pre-duimp-case-" + suffix;
      const revisionId = "pre-duimp-revision-" + suffix;

      await assert.rejects(
        prismaGlobal.$transaction(async (tx) => {
          await createScope(tx, ids);
          await tx.governedCase.create({ data: governedCaseData(ids, caseId) });
          await tx.governedCaseRevision.create({
            data: revisionData(ids, caseId, revisionId),
          });

          if (operation === "update") {
            await tx.governedCaseRevision.update({
              where: { id: revisionId },
              data: { actorRef: "forbidden" },
            });
          } else {
            await tx.governedCaseRevision.delete({ where: { id: revisionId } });
          }
        }),
        /append-only/,
      );
    });
  }

  test("case deletion is restricted while revision history exists", async () => {
    const { prismaGlobal } = await loadDb();
    const suffix = stamp("restrict");
    const ids = scope(suffix);
    const caseId = "pre-duimp-case-" + suffix;

    await assert.rejects(
      prismaGlobal.$transaction(async (tx) => {
        await createScope(tx, ids);
        await tx.governedCase.create({ data: governedCaseData(ids, caseId) });
        await tx.governedCaseRevision.create({
          data: revisionData(ids, caseId, "pre-duimp-revision-" + suffix),
        });
        await tx.governedCase.delete({ where: { id: caseId } });
      }),
    );
  });
}
