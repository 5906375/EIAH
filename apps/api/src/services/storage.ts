import path from "path";
import {
  type StorageObjectRef,
  type StorageScope,
  assertSafeStorageKey,
  createLocalStorageProvider,
  createObjectStorageProvider,
  createStorageProviderFromEnv,
  buildScopedStorageKey,
} from "./storageProvider";

const DEFAULT_STORAGE_DIR = path.resolve(process.cwd(), "uploads");

function getStorageRoot() {
  return process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : DEFAULT_STORAGE_DIR;
}

function resolveProvider() {
  return createStorageProviderFromEnv({ localRootDir: getStorageRoot() });
}

export type PersistedFile = StorageObjectRef;
export type { StorageScope };
export { assertSafeStorageKey, buildScopedStorageKey, createLocalStorageProvider, createObjectStorageProvider };

export async function persistBuffer(
  buffer: Buffer,
  originalName: string,
  scope?: StorageScope,
  objectId?: string
): Promise<PersistedFile> {
  return resolveProvider().putObject({ buffer, originalName, scope, objectId });
}

export async function loadStoredObject(storageKey: string): Promise<Buffer | null> {
  return resolveProvider().getObject(storageKey);
}

export async function loadFileAbsolutePath(storageKey: string): Promise<string | null> {
  const provider = resolveProvider();
  if (!provider.getAbsolutePath) return null;
  return provider.getAbsolutePath(storageKey);
}

export async function storedObjectExists(storageKey: string): Promise<boolean> {
  return resolveProvider().exists(storageKey);
}

export async function deleteStoredObject(storageKey: string): Promise<void> {
  await resolveProvider().deleteObject(storageKey);
}
