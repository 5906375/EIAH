import { randomUUID } from "node:crypto";

import {
  PRE_DUIMP_CASE_TYPE_V1,
  preDuimpCaseV1Schema,
  type PreDuimpCaseV1,
} from "@eiah/contracts";
import { getPrismaForTenant, Prisma } from "@repo/db";

import {
  canonicalizeGovernedJsonV1,
  validateAndHashPreDuimpGovernedCaseSnapshot,
} from "./preDuimpGovernedCaseCanonicalization.js";
import {
  PRE_DUIMP_CASE_TRANSITION_DENIED,
  validatePreDuimpLifecycleSnapshotV1,
  validatePreDuimpLifecycleTransitionV1,
  type PreDuimpGovernedCaseLifecycleV1,
} from "./preDuimpGovernedCaseLifecycle.js";

export const PRE_DUIMP_CASE_INVALID_SNAPSHOT =
  "PRE_DUIMP_CASE_INVALID_SNAPSHOT" as const;
export const PRE_DUIMP_CASE_REVISION_CONFLICT =
  "PRE_DUIMP_CASE_REVISION_CONFLICT" as const;
export const PRE_DUIMP_CASE_INTEGRITY_VIOLATION =
  "PRE_DUIMP_CASE_INTEGRITY_VIOLATION" as const;

export type PreDuimpGovernedCaseScopeV1 = Readonly<{
  tenantId: string;
  workspaceId: string;
}>;

export type CreatePreDuimpGovernedCaseCommandV1 = Readonly<{
  snapshot: unknown;
  actorType: string;
  actorRef?: string | null;
  transitionCode?: string;
}>;

export type TransitionPreDuimpGovernedCaseCommandV1 = Readonly<{
  caseId: string;
  expectedRevision: number;
  toLifecycle: PreDuimpGovernedCaseLifecycleV1;
  snapshot: unknown;
  actorType: string;
  actorRef?: string | null;
  transitionCode: string;
}>;

export type ListPreDuimpGovernedCasesFiltersV1 = Readonly<{
  lifecycle?: PreDuimpGovernedCaseLifecycleV1;
  take?: number;
}>;

export type GovernedCaseWriteResultV1 =
  | { status: "created"; case: PreDuimpCaseV1 }
  | { status: "updated"; case: PreDuimpCaseV1 }
  | { status: "not_found" }
  | {
      status: "revision_conflict";
      reasonCode: typeof PRE_DUIMP_CASE_REVISION_CONFLICT;
      currentRevision: number;
    }
  | {
      status: "transition_denied";
      reasonCode: typeof PRE_DUIMP_CASE_TRANSITION_DENIED;
    }
  | {
      status: "invalid_snapshot";
      reasonCode: typeof PRE_DUIMP_CASE_INVALID_SNAPSHOT;
    };

export interface PreDuimpGovernedCaseRepositoryV1 {
  create(
    command: CreatePreDuimpGovernedCaseCommandV1,
  ): Promise<GovernedCaseWriteResultV1>;
  get(caseId: string): Promise<PreDuimpCaseV1 | null>;
  list(
    filters?: ListPreDuimpGovernedCasesFiltersV1,
  ): Promise<readonly PreDuimpCaseV1[]>;
  transition(
    command: TransitionPreDuimpGovernedCaseCommandV1,
  ): Promise<GovernedCaseWriteResultV1>;
  listRevisions(caseId: string): Promise<readonly PreDuimpCaseV1[]>;
}

type GovernedCaseDbClientV1 = Pick<
  Prisma.TransactionClient,
  "governedCase" | "governedCaseRevision"
>;

type TransactionRunnerV1 = <T>(
  operation: (transaction: GovernedCaseDbClientV1) => Promise<T>,
) => Promise<T>;

export type PreDuimpGovernedCaseRepositoryTestDependenciesV1 = Readonly<{
  client: GovernedCaseDbClientV1;
  runInTransaction: TransactionRunnerV1;
  now?: () => Date;
  createId?: (kind: "case" | "revision") => string;
}>;

type GovernedCaseProjectionRowV1 = {
  id: string;
  tenantId: string;
  workspaceId: string;
  schemaVersion: string;
  caseType: string;
  revision: number;
  lifecycle: string;
  subject: unknown;
  domainState: unknown;
  snapshot: unknown;
  snapshotHash: string;
  createdAt: Date;
  updatedAt: Date;
};

type GovernedCaseRevisionRowV1 = {
  caseId: string;
  tenantId: string;
  workspaceId: string;
  schemaVersion: string;
  revision: number;
  lifecycle: string;
  snapshot: unknown;
  snapshotHash: string;
};

class RevisionConflictSignal extends Error {}

export class PreDuimpGovernedCaseIntegrityError extends Error {
  readonly reasonCode = PRE_DUIMP_CASE_INTEGRITY_VIOLATION;

  constructor(message: string) {
    super(message);
    this.name = "PreDuimpGovernedCaseIntegrityError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(label + " is required");
  }
  return normalized;
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function prepareAuthoritativeSnapshot(input: {
  source: unknown;
  scope: PreDuimpGovernedCaseScopeV1;
  caseId: string;
  revision: number;
  lifecycle: PreDuimpGovernedCaseLifecycleV1;
  createdAt: string;
  updatedAt: string;
}): PreDuimpCaseV1 | null {
  let candidate: Record<string, unknown>;
  try {
    const cloned = structuredClone(input.source);
    if (!isRecord(cloned)) return null;
    candidate = cloned;
  } catch {
    return null;
  }

  candidate.schemaVersion = "governed-case.v1";
  candidate.caseId = input.caseId;
  candidate.caseType = PRE_DUIMP_CASE_TYPE_V1;
  candidate.tenantId = input.scope.tenantId;
  candidate.workspaceId = input.scope.workspaceId;
  candidate.revision = input.revision;
  candidate.lifecycle = input.lifecycle;
  candidate.createdAt = input.createdAt;
  candidate.updatedAt = input.updatedAt;

  if (isRecord(candidate.gateDecision)) {
    candidate.gateDecision = {
      ...candidate.gateDecision,
      caseId: input.caseId,
      tenantId: input.scope.tenantId,
      workspaceId: input.scope.workspaceId,
      readinessOnly: true,
      authorizationState: "NOT_REQUESTED",
      externalTransmissionAllowed: false,
    };
  }

  if (isRecord(candidate.domainState)) {
    candidate.domainState = {
      ...candidate.domainState,
      externalTransmissionAllowed: false,
    };
  }

  if (Array.isArray(candidate.corporatePolicyEvaluations)) {
    candidate.corporatePolicyEvaluations =
      candidate.corporatePolicyEvaluations.map((evaluation) =>
        isRecord(evaluation)
          ? {
              ...evaluation,
              tenantId: input.scope.tenantId,
              workspaceId: input.scope.workspaceId,
            }
          : evaluation,
      );
  }

  if (Array.isArray(candidate.humanAuthorityDecisions)) {
    candidate.humanAuthorityDecisions = candidate.humanAuthorityDecisions.map(
      (decision) => {
        if (!isRecord(decision)) return decision;
        return {
          ...decision,
          tenantId: input.scope.tenantId,
          workspaceId: input.scope.workspaceId,
          subject: isRecord(decision.subject)
            ? { ...decision.subject, caseId: input.caseId }
            : decision.subject,
        };
      },
    );
  }

  const parsed = preDuimpCaseV1Schema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function assertProjectionIntegrity(
  row: GovernedCaseProjectionRowV1,
): PreDuimpCaseV1 {
  const validated = validateAndHashPreDuimpGovernedCaseSnapshot(row.snapshot);
  const snapshot = validated.snapshot;

  const scalarMatches =
    row.id === snapshot.caseId &&
    row.tenantId === snapshot.tenantId &&
    row.workspaceId === snapshot.workspaceId &&
    row.schemaVersion === snapshot.schemaVersion &&
    row.caseType === snapshot.caseType &&
    row.revision === snapshot.revision &&
    row.lifecycle === snapshot.lifecycle &&
    row.snapshotHash === validated.snapshotHash &&
    row.createdAt.toISOString() === snapshot.createdAt &&
    row.updatedAt.toISOString() === snapshot.updatedAt;

  const jsonMatches =
    canonicalizeGovernedJsonV1(row.subject) ===
      canonicalizeGovernedJsonV1(snapshot.subject) &&
    canonicalizeGovernedJsonV1(row.domainState) ===
      canonicalizeGovernedJsonV1(snapshot.domainState);

  if (!scalarMatches || !jsonMatches) {
    throw new PreDuimpGovernedCaseIntegrityError(
      "governed case projection diverges from its validated snapshot",
    );
  }

  return snapshot;
}

function assertRevisionIntegrity(
  row: GovernedCaseRevisionRowV1,
): PreDuimpCaseV1 {
  const validated = validateAndHashPreDuimpGovernedCaseSnapshot(row.snapshot);
  const snapshot = validated.snapshot;
  if (
    row.caseId !== snapshot.caseId ||
    row.tenantId !== snapshot.tenantId ||
    row.workspaceId !== snapshot.workspaceId ||
    row.schemaVersion !== snapshot.schemaVersion ||
    row.revision !== snapshot.revision ||
    row.lifecycle !== snapshot.lifecycle ||
    row.snapshotHash !== validated.snapshotHash
  ) {
    throw new PreDuimpGovernedCaseIntegrityError(
      "governed case revision diverges from its validated snapshot",
    );
  }
  return snapshot;
}

class PreDuimpGovernedCaseRepository
  implements PreDuimpGovernedCaseRepositoryV1
{
  constructor(
    private readonly scope: PreDuimpGovernedCaseScopeV1,
    private readonly dependencies: Required<
      PreDuimpGovernedCaseRepositoryTestDependenciesV1
    >,
  ) {}

  private findProjection(caseId: string) {
    return this.dependencies.client.governedCase.findFirst({
      where: {
        id: caseId,
        tenantId: this.scope.tenantId,
        workspaceId: this.scope.workspaceId,
        caseType: PRE_DUIMP_CASE_TYPE_V1,
      },
    });
  }

  async create(
    command: CreatePreDuimpGovernedCaseCommandV1,
  ): Promise<GovernedCaseWriteResultV1> {
    const caseId = requireIdentifier(
      this.dependencies.createId("case"),
      "caseId",
    );
    const revisionId = requireIdentifier(
      this.dependencies.createId("revision"),
      "revisionId",
    );
    const now = this.dependencies.now();
    if (!Number.isFinite(now.getTime())) {
      return {
        status: "invalid_snapshot",
        reasonCode: PRE_DUIMP_CASE_INVALID_SNAPSHOT,
      };
    }

    const snapshot = prepareAuthoritativeSnapshot({
      source: command.snapshot,
      scope: this.scope,
      caseId,
      revision: 1,
      lifecycle: "DISCOVERY",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    if (!snapshot || !validatePreDuimpLifecycleSnapshotV1(snapshot).ok) {
      return {
        status: "invalid_snapshot",
        reasonCode: PRE_DUIMP_CASE_INVALID_SNAPSHOT,
      };
    }

    const actorType = command.actorType.trim();
    const transitionCode = (command.transitionCode ?? "case.created").trim();
    if (!actorType || !transitionCode) {
      return {
        status: "invalid_snapshot",
        reasonCode: PRE_DUIMP_CASE_INVALID_SNAPSHOT,
      };
    }

    const { snapshotHash } =
      validateAndHashPreDuimpGovernedCaseSnapshot(snapshot);

    await this.dependencies.runInTransaction(async (transaction) => {
      await transaction.governedCase.create({
        data: {
          id: caseId,
          tenantId: this.scope.tenantId,
          workspaceId: this.scope.workspaceId,
          schemaVersion: snapshot.schemaVersion,
          caseType: snapshot.caseType,
          revision: snapshot.revision,
          lifecycle: snapshot.lifecycle,
          subject: jsonInput(snapshot.subject),
          domainState: jsonInput(snapshot.domainState),
          snapshot: jsonInput(snapshot),
          snapshotHash,
          createdAt: now,
          updatedAt: now,
        },
      });
      await transaction.governedCaseRevision.create({
        data: {
          id: revisionId,
          caseId,
          tenantId: this.scope.tenantId,
          workspaceId: this.scope.workspaceId,
          revision: 1,
          schemaVersion: snapshot.schemaVersion,
          lifecycle: snapshot.lifecycle,
          snapshot: jsonInput(snapshot),
          snapshotHash,
          fromLifecycle: null,
          toLifecycle: "DISCOVERY",
          actorType,
          actorRef: command.actorRef?.trim() || null,
          transitionCode,
          createdAt: now,
        },
      });
    });

    return { status: "created", case: snapshot };
  }

  async get(caseId: string): Promise<PreDuimpCaseV1 | null> {
    const row = await this.findProjection(requireIdentifier(caseId, "caseId"));
    return row
      ? assertProjectionIntegrity(row as GovernedCaseProjectionRowV1)
      : null;
  }

  async list(
    filters: ListPreDuimpGovernedCasesFiltersV1 = {},
  ): Promise<readonly PreDuimpCaseV1[]> {
    const take = Math.min(Math.max(filters.take ?? 100, 1), 200);
    const rows = await this.dependencies.client.governedCase.findMany({
      where: {
        tenantId: this.scope.tenantId,
        workspaceId: this.scope.workspaceId,
        caseType: PRE_DUIMP_CASE_TYPE_V1,
        ...(filters.lifecycle ? { lifecycle: filters.lifecycle } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take,
    });
    return rows.map((row) =>
      assertProjectionIntegrity(row as GovernedCaseProjectionRowV1),
    );
  }

  async transition(
    command: TransitionPreDuimpGovernedCaseCommandV1,
  ): Promise<GovernedCaseWriteResultV1> {
    const caseId = requireIdentifier(command.caseId, "caseId");
    const loadedRow = await this.findProjection(caseId);
    if (!loadedRow) return { status: "not_found" };

    const current = assertProjectionIntegrity(
      loadedRow as GovernedCaseProjectionRowV1,
    );
    if (current.revision !== command.expectedRevision) {
      return {
        status: "revision_conflict",
        reasonCode: PRE_DUIMP_CASE_REVISION_CONFLICT,
        currentRevision: current.revision,
      };
    }

    const transition = validatePreDuimpLifecycleTransitionV1(
      current.lifecycle,
      command.toLifecycle,
    );
    if (!transition.ok) {
      return {
        status: "transition_denied",
        reasonCode: PRE_DUIMP_CASE_TRANSITION_DENIED,
      };
    }

    const actorType = command.actorType.trim();
    const transitionCode = command.transitionCode.trim();
    const revisionId = requireIdentifier(
      this.dependencies.createId("revision"),
      "revisionId",
    );
    const now = this.dependencies.now();
    if (!actorType || !transitionCode || !Number.isFinite(now.getTime())) {
      return {
        status: "invalid_snapshot",
        reasonCode: PRE_DUIMP_CASE_INVALID_SNAPSHOT,
      };
    }

    const snapshot = prepareAuthoritativeSnapshot({
      source: command.snapshot,
      scope: this.scope,
      caseId,
      revision: current.revision + 1,
      lifecycle: command.toLifecycle,
      createdAt: current.createdAt,
      updatedAt: now.toISOString(),
    });
    if (!snapshot || !validatePreDuimpLifecycleSnapshotV1(snapshot).ok) {
      return {
        status: "invalid_snapshot",
        reasonCode: PRE_DUIMP_CASE_INVALID_SNAPSHOT,
      };
    }

    const { snapshotHash } =
      validateAndHashPreDuimpGovernedCaseSnapshot(snapshot);

    try {
      await this.dependencies.runInTransaction(async (transaction) => {
        const updated = await transaction.governedCase.updateMany({
          where: {
            id: caseId,
            tenantId: this.scope.tenantId,
            workspaceId: this.scope.workspaceId,
            revision: command.expectedRevision,
          },
          data: {
            schemaVersion: snapshot.schemaVersion,
            caseType: snapshot.caseType,
            revision: snapshot.revision,
            lifecycle: snapshot.lifecycle,
            subject: jsonInput(snapshot.subject),
            domainState: jsonInput(snapshot.domainState),
            snapshot: jsonInput(snapshot),
            snapshotHash,
            updatedAt: now,
          },
        });
        if (updated.count !== 1) throw new RevisionConflictSignal();

        await transaction.governedCaseRevision.create({
          data: {
            id: revisionId,
            caseId,
            tenantId: this.scope.tenantId,
            workspaceId: this.scope.workspaceId,
            revision: snapshot.revision,
            schemaVersion: snapshot.schemaVersion,
            lifecycle: snapshot.lifecycle,
            snapshot: jsonInput(snapshot),
            snapshotHash,
            fromLifecycle: current.lifecycle,
            toLifecycle: snapshot.lifecycle,
            actorType,
            actorRef: command.actorRef?.trim() || null,
            transitionCode,
            createdAt: now,
          },
        });
      });
    } catch (error) {
      if (!(error instanceof RevisionConflictSignal)) throw error;
      const latest = await this.findProjection(caseId);
      return {
        status: "revision_conflict",
        reasonCode: PRE_DUIMP_CASE_REVISION_CONFLICT,
        currentRevision: latest?.revision ?? current.revision,
      };
    }

    return { status: "updated", case: snapshot };
  }

  async listRevisions(caseId: string): Promise<readonly PreDuimpCaseV1[]> {
    const normalizedCaseId = requireIdentifier(caseId, "caseId");
    const rows = await this.dependencies.client.governedCaseRevision.findMany({
      where: {
        caseId: normalizedCaseId,
        tenantId: this.scope.tenantId,
        workspaceId: this.scope.workspaceId,
      },
      orderBy: { revision: "asc" },
    });
    return rows.map((row) =>
      assertRevisionIntegrity(row as GovernedCaseRevisionRowV1),
    );
  }
}

function normalizeScope(
  scope: PreDuimpGovernedCaseScopeV1,
): PreDuimpGovernedCaseScopeV1 {
  return {
    tenantId: requireIdentifier(scope.tenantId, "tenantId"),
    workspaceId: requireIdentifier(scope.workspaceId, "workspaceId"),
  };
}

export function createPreDuimpGovernedCaseRepository(
  scopeInput: PreDuimpGovernedCaseScopeV1,
): PreDuimpGovernedCaseRepositoryV1 {
  const scope = normalizeScope(scopeInput);
  const prisma = getPrismaForTenant(scope.tenantId, scope.workspaceId);
  return new PreDuimpGovernedCaseRepository(scope, {
    client: prisma as unknown as GovernedCaseDbClientV1,
    runInTransaction: async (operation) =>
      prisma.$transaction(async (transaction) =>
        operation(transaction as unknown as GovernedCaseDbClientV1),
      ),
    now: () => new Date(),
    createId: (kind) => "pre-duimp-" + kind + "-" + randomUUID(),
  });
}

/**
 * Test-only seam. Production callers must use
 * createPreDuimpGovernedCaseRepository(), whose client is always obtained from
 * getPrismaForTenant().
 */
export function createPreDuimpGovernedCaseRepositoryForTests(
  scopeInput: PreDuimpGovernedCaseScopeV1,
  dependencies: PreDuimpGovernedCaseRepositoryTestDependenciesV1,
): PreDuimpGovernedCaseRepositoryV1 {
  const scope = normalizeScope(scopeInput);
  return new PreDuimpGovernedCaseRepository(scope, {
    ...dependencies,
    now: dependencies.now ?? (() => new Date()),
    createId:
      dependencies.createId ??
      ((kind) => "pre-duimp-" + kind + "-" + randomUUID()),
  });
}
