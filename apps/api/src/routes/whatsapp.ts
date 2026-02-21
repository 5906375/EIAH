import express, { Router } from "express";
import { createPrismaWhatsAppStore } from "../integrations/whatsapp/store";
import { parseMetaDeliveryReceipts, verifyMetaWebhookSignature } from "../integrations/whatsapp/webhook";

type DeliveryReceiptStore = {
  persistDeliveryReceiptByMessageId(params: {
    messageId: string;
    status: "sent" | "delivered" | "read" | "failed";
    timestamp: string;
    raw?: unknown;
  }): Promise<void>;
};

function parseJsonBody(raw: Buffer) {
  if (!raw || raw.length === 0) return {};
  return JSON.parse(raw.toString("utf8"));
}

export function createWhatsAppWebhookRouter(params?: {
  store?: DeliveryReceiptStore;
}) {
  const router = Router();
  const store = params?.store ?? createPrismaWhatsAppStore();

  router.get("/integrations/whatsapp/webhook", (req, res) => {
    const mode = String(req.query["hub.mode"] ?? "");
    const challenge = String(req.query["hub.challenge"] ?? "");
    const token = String(req.query["hub.verify_token"] ?? "");
    const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
    if (!expected) {
      return res.status(200).send(challenge || "ok");
    }
    if (mode === "subscribe" && token === expected) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ ok: false, error: { code: "WHATSAPP_WEBHOOK_VERIFY_FAILED" } });
  });

  router.post(
    "/integrations/whatsapp/webhook",
    express.raw({ type: "*/*" }),
    async (req, res) => {
      const rawBody = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(
            typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}),
            "utf8"
          );
      const signatureHeader =
        req.header("x-hub-signature-256") ?? req.header("X-Hub-Signature-256");
      const validSignature = verifyMetaWebhookSignature({
        appSecret: process.env.WHATSAPP_META_APP_SECRET?.trim(),
        rawBody,
        signatureHeader,
      });
      if (!validSignature) {
        return res.status(401).json({ ok: false, error: { code: "WHATSAPP_WEBHOOK_INVALID_SIGNATURE" } });
      }

      let payload: unknown;
      try {
        payload = parseJsonBody(rawBody);
      } catch {
        return res.status(400).json({ ok: false, error: { code: "WHATSAPP_WEBHOOK_INVALID_JSON" } });
      }

      const receipts = parseMetaDeliveryReceipts(payload);
      for (const receipt of receipts) {
        await store.persistDeliveryReceiptByMessageId({
          messageId: receipt.messageId,
          status: receipt.status,
          timestamp: receipt.timestamp,
          raw: receipt.raw,
        });
      }

      return res.json({
        ok: true,
        processed: receipts.length,
      });
    }
  );

  return router;
}

export const whatsappWebhookRouter = createWhatsAppWebhookRouter();
