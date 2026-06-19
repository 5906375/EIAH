import { Router } from "express";
import multer from "multer";
import type { TenantAwareRequest } from "../middlewares/enforceTenant";
import { enforceTenant } from "../middlewares/enforceTenant";
import { loadStoredObject, persistBuffer } from "../services/storage";
import { createUploadedDocument, findDocumentById, updateDocumentUrl } from "../services/uploads";

const MAX_FILE_SIZE_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 5 * 1024 * 1024); // 5 MB default
const ALLOWED_MIME_TYPES = (process.env.ALLOWED_UPLOAD_MIMES ?? "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/png,image/jpeg")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: Number(process.env.MAX_UPLOAD_FILES ?? 8),
  },
});

function normalizeUploadedFileName(fileName: string) {
  const trimmed = fileName.trim();
  if (!trimmed) return fileName;

  const looksMojibake = /Ã.|Â.|�/.test(trimmed);
  if (!looksMojibake) return trimmed;

  try {
    const decoded = Buffer.from(trimmed, "latin1").toString("utf8").trim();
    return decoded || trimmed;
  } catch {
    return trimmed;
  }
}

export const uploadsRouter = Router();

uploadsRouter.use(enforceTenant);

uploadsRouter.post(
  "/uploads",
  upload.array("files"),
  async (req: TenantAwareRequest, res) => {
    const auth = req.authContext;
    const client = req.prisma;
    if (!auth) {
      return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Missing auth context" } });
    }
    if (!client) {
      return res.status(500).json({ ok: false, error: { code: "PRISMA_MISSING", message: "Prisma client missing in request" } });
    }

    const agentSlug = (req.body?.agentSlug ?? req.query?.agentSlug ?? "").toString().trim();
    if (!agentSlug) {
      return res.status(400).json({
        ok: false,
        error: { code: "INVALID_REQUEST", message: "agentSlug is required" },
      });
    }

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      return res.status(400).json({
        ok: false,
        error: { code: "INVALID_REQUEST", message: "At least one file is required" },
      });
    }

    const results = [];
    for (const file of files) {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        return res.status(415).json({
          ok: false,
          error: { code: "UNSUPPORTED_MEDIA_TYPE", message: `Mime type ${file.mimetype} not allowed` },
        });
      }

      const normalizedFileName = normalizeUploadedFileName(file.originalname);
      const persisted = await persistBuffer(file.buffer, normalizedFileName, {
        tenantId: auth.tenantId,
        workspaceId: auth.workspaceId,
        agentSlug,
      });
      let record = await createUploadedDocument({
        prisma: client,
        tenantId: auth.tenantId,
        workspaceId: auth.workspaceId,
        agentSlug,
        fileName: normalizedFileName,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey: persisted.storageKey,
      });

      const publicUrl = `/api/uploads/${record.id}`;
      if (record.url !== publicUrl) {
        const updated = await updateDocumentUrl({
          prisma: client,
          id: record.id,
          tenantId: auth.tenantId,
          workspaceId: auth.workspaceId,
          url: publicUrl,
        });
        if (updated) {
          record = updated;
        }
      }

      results.push({
        id: record.id,
        name: record.fileName,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
        url: record.url,
        createdAt: record.createdAt,
      });
    }

    return res.json({ ok: true, data: results });
  }
);

uploadsRouter.get("/uploads/:id", async (req: TenantAwareRequest, res) => {
  const auth = req.authContext;
  const client = req.prisma;
  if (!auth) {
    return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Missing auth context" } });
  }
  if (!client) {
    return res.status(500).json({ ok: false, error: { code: "PRISMA_MISSING", message: "Prisma client missing in request" } });
  }

  const documentId = req.params.id;
  const doc = await findDocumentById({
    prisma: client,
    id: documentId,
    tenantId: auth.tenantId,
    workspaceId: auth.workspaceId,
  });
  if (!doc) {
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Document not found" } });
  }

  const buffer = await loadStoredObject(doc.storageKey);
  if (!buffer) {
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "File not available" } });
  }

  res.type(doc.mimeType);
  return res.send(buffer);
});
