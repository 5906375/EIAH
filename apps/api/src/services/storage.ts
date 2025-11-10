import { mkdir, writeFile, stat } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const DEFAULT_STORAGE_DIR = path.resolve(process.cwd(), "uploads");

function getStorageRoot() {
  return process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : DEFAULT_STORAGE_DIR;
}

async function ensureStorageDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

export type PersistedFile = {
  storageKey: string;
  absolutePath: string;
};

export async function persistBuffer(buffer: Buffer, originalName: string): Promise<PersistedFile> {
  const storageRoot = getStorageRoot();
  await ensureStorageDir(storageRoot);

  const ext = path.extname(originalName) || "";
  const storageKey = `${randomUUID()}${ext}`;
  const absolutePath = path.join(storageRoot, storageKey);

  await writeFile(absolutePath, buffer);

  return {
    storageKey,
    absolutePath,
  };
}

export async function loadFileAbsolutePath(storageKey: string): Promise<string | null> {
  const storageRoot = getStorageRoot();
  const absolutePath = path.join(storageRoot, storageKey);
  try {
    await stat(absolutePath);
    return absolutePath;
  } catch {
    return null;
  }
}
