import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseMetaDeliveryReceipts,
  verifyMetaWebhookSignature,
} from "../integrations/whatsapp/webhook";

describe("whatsapp webhook parser", () => {
  it("extracts delivery receipts from meta payload", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "entry_1",
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: "wamid.HBgLM1",
                    status: "delivered",
                    timestamp: "1739966400",
                  },
                  {
                    id: "wamid.HBgLM2",
                    status: "read",
                    timestamp: "1739966401",
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const receipts = parseMetaDeliveryReceipts(payload);
    expect(receipts).toHaveLength(2);
    expect(receipts[0]).toEqual(
      expect.objectContaining({
        messageId: "wamid.HBgLM1",
        status: "delivered",
      })
    );
    expect(receipts[1]).toEqual(
      expect.objectContaining({
        messageId: "wamid.HBgLM2",
        status: "read",
      })
    );
  });

  it("validates x-hub-signature-256 when app secret is configured", () => {
    const appSecret = "meta_secret_test";
    const rawBody = Buffer.from(JSON.stringify({ test: true }), "utf8");
    const signature = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
    const valid = verifyMetaWebhookSignature({
      appSecret,
      rawBody,
      signatureHeader: signature,
    });
    expect(valid).toBe(true);
    const invalid = verifyMetaWebhookSignature({
      appSecret,
      rawBody,
      signatureHeader: "sha256=deadbeef",
    });
    expect(invalid).toBe(false);
  });
});
