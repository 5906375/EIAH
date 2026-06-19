import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  IMOB_INTAKE_OBSERVABILITY_COUNTER,
  recordImobIntakeObservabilityEvent,
} from "./imob/intake/imobIntakeObservability";

export type StorageScope = {
  tenantId: string;
  workspaceId: string;
  agentSlug?: string | null;
};

export type StorageObjectRef = {
  storageKey: string;
  absolutePath: string | null;
};

export type PutObjectInput = {
  buffer: Buffer;
  originalName: string;
  scope?: StorageScope | null;
  contentType?: string | null;
};

export interface StorageProvider {
  kind: "local" | "object";
  putObject(input: PutObjectInput): Promise<StorageObjectRef>;
  getObject(storageKey: string): Promise<Buffer | null>;
  exists(storageKey: string): Promise<boolean>;
  deleteObject(storageKey: string): Promise<void>;
  getAbsolutePath?(storageKey: string): Promise<string | null>;
}

export interface ObjectStorageClient {
  putObject(params: {
    bucket: string;
    key: string;
    body: Buffer;
    contentType?: string | null;
  }): Promise<void>;
  getObject(params: { bucket: string; key: string }): Promise<Buffer | null>;
  exists(params: { bucket: string; key: string }): Promise<boolean>;
  deleteObject(params: { bucket: string; key: string }): Promise<void>;
}

type LocalStorageProviderOptions = {
  rootDir: string;
};

type ObjectStorageProviderOptions = {
  bucket: string;
  prefix?: string;
  client?: ObjectStorageClient | null;
};

type CreateStorageProviderFromEnvOptions = {
  localRootDir: string;
};

type ObjectStorageAdapter = "s3-compatible";

const STORAGE_KEY_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
const STORAGE_SCOPE_SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function sanitizeScopeSegment(label: string, value: string) {
  const normalized = value.trim();
  if (!STORAGE_SCOPE_SEGMENT_RE.test(normalized)) {
    throw new Error(`${label} inválido para storage scope`);
  }
  return normalized;
}

function normalizeExtension(originalName: string) {
  const ext = path.extname(path.basename(originalName)).toLowerCase();
  if (!ext) return "";
  return /^[.a-z0-9_-]{1,16}$/.test(ext) ? ext : "";
}

function normalizeStorageKeyInput(storageKey: string) {
  const normalized = storageKey.replaceAll("\\", "/").trim();
  if (!normalized) {
    throw new Error("storageKey obrigatório");
  }
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error("storageKey absoluto não é permitido");
  }
  const segments = normalized.split("/");
  for (const segment of segments) {
    if (!segment || segment === "." || segment === ".." || !STORAGE_KEY_SEGMENT_RE.test(segment)) {
      throw new Error("storageKey inválido");
    }
  }
  return segments.join("/");
}

function normalizePrefix(prefix: string | undefined) {
  if (!prefix) return "";
  return normalizeStorageKeyInput(prefix);
}

function normalizeBooleanEnv(value: string | undefined, fallback = false) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function resolveLocalPath(rootDir: string, storageKey: string) {
  const normalizedKey = normalizeStorageKeyInput(storageKey);
  const normalizedRoot = path.resolve(rootDir);
  const absolutePath = path.resolve(normalizedRoot, normalizedKey);
  if (absolutePath !== normalizedRoot && !absolutePath.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error("storageKey fora do root permitido");
  }
  return { normalizedKey, absolutePath, normalizedRoot };
}

export function buildScopedStorageKey(params: {
  tenantId: string;
  workspaceId: string;
  originalName: string;
  objectId?: string;
}) {
  const tenantId = sanitizeScopeSegment("tenantId", params.tenantId);
  const workspaceId = sanitizeScopeSegment("workspaceId", params.workspaceId);
  const ext = normalizeExtension(params.originalName);
  const objectId = params.objectId ?? randomUUID();
  return `${tenantId}/${workspaceId}/${objectId}${ext}`;
}

export function assertSafeStorageKey(storageKey: string) {
  return normalizeStorageKeyInput(storageKey);
}

export function createLocalStorageProvider(options: LocalStorageProviderOptions): StorageProvider {
  const rootDir = path.resolve(options.rootDir);

  return {
    kind: "local",
    async putObject(input) {
      const storageKey = input.scope
        ? buildScopedStorageKey({
            tenantId: input.scope.tenantId,
            workspaceId: input.scope.workspaceId,
            originalName: input.originalName,
          })
        : `${randomUUID()}${normalizeExtension(input.originalName)}`;
      const { absolutePath } = resolveLocalPath(rootDir, storageKey);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, input.buffer);
      return { storageKey, absolutePath };
    },
    async getObject(storageKey) {
      const { absolutePath } = resolveLocalPath(rootDir, storageKey);
      try {
        return await readFile(absolutePath);
      } catch {
        return null;
      }
    },
    async exists(storageKey) {
      const { absolutePath } = resolveLocalPath(rootDir, storageKey);
      try {
        await stat(absolutePath);
        return true;
      } catch {
        return false;
      }
    },
    async deleteObject(storageKey) {
      const { absolutePath } = resolveLocalPath(rootDir, storageKey);
      await rm(absolutePath, { force: true });
    },
    async getAbsolutePath(storageKey) {
      const { absolutePath } = resolveLocalPath(rootDir, storageKey);
      try {
        await stat(absolutePath);
        return absolutePath;
      } catch {
        return null;
      }
    },
  };
}

export function createObjectStorageProvider(options: ObjectStorageProviderOptions): StorageProvider {
  const bucket = options.bucket.trim();
  if (!bucket) {
    throw new Error("OBJECT_STORAGE_BUCKET obrigatório");
  }
  const prefix = normalizePrefix(options.prefix);
  const client = options.client ?? null;

  function requireClient() {
    if (!client) {
      throw new Error("ObjectStorageProvider configurado sem client. Injete um adapter real ou fake.");
    }
    return client;
  }

  function buildObjectKey(input: PutObjectInput) {
    const baseKey = input.scope
      ? buildScopedStorageKey({
          tenantId: input.scope.tenantId,
          workspaceId: input.scope.workspaceId,
          originalName: input.originalName,
        })
      : `${randomUUID()}${normalizeExtension(input.originalName)}`;
    return prefix ? `${prefix}/${baseKey}` : baseKey;
  }

  function normalizeObjectKey(storageKey: string) {
    return normalizeStorageKeyInput(storageKey);
  }

  return {
    kind: "object",
    async putObject(input) {
      const key = buildObjectKey(input);
      await requireClient().putObject({
        bucket,
        key,
        body: input.buffer,
        contentType: input.contentType ?? null,
      });
      return { storageKey: key, absolutePath: null };
    },
    async getObject(storageKey) {
      return requireClient().getObject({ bucket, key: normalizeObjectKey(storageKey) });
    },
    async exists(storageKey) {
      return requireClient().exists({ bucket, key: normalizeObjectKey(storageKey) });
    },
    async deleteObject(storageKey) {
      await requireClient().deleteObject({ bucket, key: normalizeObjectKey(storageKey) });
    },
  };
}

function validateObjectStorageBucket(raw: string | undefined) {
  const bucket = raw?.trim() ?? "";
  if (!bucket) {
    throw new Error("OBJECT_STORAGE_BUCKET obrigatório");
  }
  return bucket;
}

function resolveObjectStorageAdapter(raw: string | undefined): ObjectStorageAdapter {
  const adapter = raw?.trim().toLowerCase();
  if (!adapter) {
    throw new Error("OBJECT_STORAGE_ADAPTER obrigatório quando STORAGE_PROVIDER=object");
  }
  if (adapter !== "s3-compatible") {
    throw new Error(`OBJECT_STORAGE_ADAPTER não suportado nesta build: ${adapter}`);
  }
  return adapter;
}

function validateS3CompatibleObjectStorageEnv() {
  const endpoint = process.env.OBJECT_STORAGE_ENDPOINT?.trim() ?? "";
  const region = process.env.OBJECT_STORAGE_REGION?.trim() ?? "";
  const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY?.trim() ?? "";

  const missing = [
    !endpoint ? "OBJECT_STORAGE_ENDPOINT" : null,
    !region ? "OBJECT_STORAGE_REGION" : null,
    !accessKeyId ? "OBJECT_STORAGE_ACCESS_KEY_ID" : null,
    !secretAccessKey ? "OBJECT_STORAGE_SECRET_ACCESS_KEY" : null,
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `STORAGE_PROVIDER=object configurado para s3-compatible sem env obrigatória: ${missing.join(", ")}`,
    );
  }

  return {
    endpoint,
    region,
    forcePathStyle: normalizeBooleanEnv(process.env.OBJECT_STORAGE_FORCE_PATH_STYLE, true),
  };
}

export function createStorageProviderFromEnv(options: CreateStorageProviderFromEnvOptions): StorageProvider {
  const configured = (process.env.STORAGE_PROVIDER ?? "local").trim().toLowerCase();
  recordImobIntakeObservabilityEvent({
    event: "storage_provider_mode",
    payload: { mode: configured },
    counterName: IMOB_INTAKE_OBSERVABILITY_COUNTER.STORAGE_PROVIDER_MODE,
    counterLabels: { mode: configured },
    onceKey: `storage-provider-mode:${configured}`,
  });
  if (configured === "object") {
    try {
      validateObjectStorageBucket(process.env.OBJECT_STORAGE_BUCKET);
    } catch (error) {
      recordImobIntakeObservabilityEvent({
        event: "object_storage_gate_failed",
        payload: { mode: configured, reasonCode: "OBJECT_STORAGE_BUCKET_REQUIRED" },
        level: "error",
        counterName: IMOB_INTAKE_OBSERVABILITY_COUNTER.OBJECT_STORAGE_GATE_FAILURES,
        counterLabels: { reasonCode: "OBJECT_STORAGE_BUCKET_REQUIRED" },
      });
      throw error;
    }

    try {
      resolveObjectStorageAdapter(process.env.OBJECT_STORAGE_ADAPTER);
    } catch (error) {
      const rawAdapter = process.env.OBJECT_STORAGE_ADAPTER?.trim().toLowerCase();
      const reasonCode = rawAdapter
        ? "OBJECT_STORAGE_ADAPTER_UNSUPPORTED"
        : "OBJECT_STORAGE_ADAPTER_REQUIRED";
      recordImobIntakeObservabilityEvent({
        event: "object_storage_gate_failed",
        payload: { mode: configured, reasonCode, adapter: rawAdapter ?? null },
        level: "error",
        counterName: IMOB_INTAKE_OBSERVABILITY_COUNTER.OBJECT_STORAGE_GATE_FAILURES,
        counterLabels: { reasonCode },
      });
      throw error;
    }

    try {
      validateS3CompatibleObjectStorageEnv();
    } catch (error) {
      recordImobIntakeObservabilityEvent({
        event: "object_storage_gate_failed",
        payload: { mode: configured, reasonCode: "OBJECT_STORAGE_ENV_INCOMPLETE" },
        level: "error",
        counterName: IMOB_INTAKE_OBSERVABILITY_COUNTER.OBJECT_STORAGE_GATE_FAILURES,
        counterLabels: { reasonCode: "OBJECT_STORAGE_ENV_INCOMPLETE" },
      });
      throw error;
    }

    recordImobIntakeObservabilityEvent({
      event: "object_storage_gate_failed",
      payload: {
        mode: configured,
        reasonCode: "OBJECT_STORAGE_REAL_ADAPTER_UNAVAILABLE",
        adapter: "s3-compatible",
      },
      level: "error",
      counterName: IMOB_INTAKE_OBSERVABILITY_COUNTER.OBJECT_STORAGE_GATE_FAILURES,
      counterLabels: { reasonCode: "OBJECT_STORAGE_REAL_ADAPTER_UNAVAILABLE" },
    });
    throw new Error(
      "STORAGE_PROVIDER=object configurado, mas esta build ainda nao possui adapter real instalado para OBJECT_STORAGE_ADAPTER=s3-compatible. Multi-instancia permanece NO-GO ate smoke real de bucket.",
    );
  }
  return createLocalStorageProvider({ rootDir: options.localRootDir });
}
