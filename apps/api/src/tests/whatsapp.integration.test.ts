import { describe, expect, it, vi } from "vitest";
import {
  WhatsAppOptInRequiredError,
  buildWhatsAppTemplatePayload,
  createWhatsAppService,
  type WhatsAppStore,
  type WhatsAppTransport,
} from "../integrations/whatsapp";
import { createWhatsAppTransportMeta } from "../integrations/whatsapp/meta";
import { parseMetaDeliveryReceipts } from "../integrations/whatsapp/webhook";

describe("whatsapp integration stub", () => {
  it("blocks proactive template send when opt-in is missing", async () => {
    const store: WhatsAppStore = {
      hasOptIn: vi.fn().mockResolvedValue(false),
      persistOutboundMessage: vi.fn().mockResolvedValue(undefined),
      persistDeliveryReceipt: vi.fn().mockResolvedValue(undefined),
    };

    const service = createWhatsAppService({ store });

    await expect(
      service.sendTemplate({
        tenantId: "tenant-A",
        workspaceId: "workspace-A",
        to: "5511999999999",
        templateName: "rent_due_reminder",
        languageCode: "pt_BR",
      })
    ).rejects.toBeInstanceOf(WhatsAppOptInRequiredError);

    expect(store.persistOutboundMessage).not.toHaveBeenCalled();
  });

  it("builds utility template payload and persists outbound message", async () => {
    const sentPayloads: unknown[] = [];
    const transport: WhatsAppTransport = {
      sendTemplate: vi.fn(async (payload) => {
        sentPayloads.push(payload);
        return { messageId: "wamid.HBgLNDA" };
      }),
    };

    const store: WhatsAppStore = {
      hasOptIn: vi.fn().mockResolvedValue(true),
      persistOutboundMessage: vi.fn().mockResolvedValue(undefined),
      persistDeliveryReceipt: vi.fn().mockResolvedValue(undefined),
    };

    const service = createWhatsAppService({ store, transport });

    const sent = await service.sendTemplate({
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      to: "5511988887777",
      templateName: "rent_collection_utility",
      languageCode: "pt_BR",
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: "Financeiro" }],
        },
      ],
      context: { leaseId: "lease_123" },
    });

    expect(sent.messageId).toBe("wamid.HBgLNDA");
    expect(transport.sendTemplate).toHaveBeenCalledTimes(1);
    expect(sentPayloads[0]).toEqual(
      buildWhatsAppTemplatePayload({
        to: "5511988887777",
        templateName: "rent_collection_utility",
        languageCode: "pt_BR",
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: "Financeiro" }],
          },
        ],
      })
    );
    expect(store.persistOutboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-A",
        workspaceId: "workspace-A",
        messageId: "wamid.HBgLNDA",
        to: "5511988887777",
      })
    );
  });

  it("persists delivery receipt by message_id", async () => {
    const store: WhatsAppStore = {
      hasOptIn: vi.fn().mockResolvedValue(true),
      persistOutboundMessage: vi.fn().mockResolvedValue(undefined),
      persistDeliveryReceipt: vi.fn().mockResolvedValue(undefined),
    };

    const service = createWhatsAppService({ store });

    await service.recordDeliveryReceipt({
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      messageId: "wamid.HBgLNDA",
      status: "delivered",
      timestamp: "2026-02-19T10:30:00.000Z",
      raw: { status: "delivered" },
    });

    expect(store.persistDeliveryReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "wamid.HBgLNDA",
        status: "delivered",
      })
    );
  });

  it("meta transport sends Graph API payload and returns message id", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        messaging_product: "whatsapp",
        messages: [{ id: "wamid.meta.1" }],
      }),
    }));
    const transport = createWhatsAppTransportMeta({
      fetchFn: fetchMock as unknown as typeof fetch,
      config: {
        apiBaseUrl: "https://graph.facebook.com",
        apiVersion: "v21.0",
        phoneNumberId: "123456",
        accessToken: "token-abc",
      },
    });

    const result = await transport.sendTemplate(
      buildWhatsAppTemplatePayload({
        to: "551199998888",
        templateName: "rent_due_reminder",
        languageCode: "pt_BR",
      })
    );

    expect(result.messageId).toBe("wamid.meta.1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v21.0/123456/messages");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)?.Authorization).toBe("Bearer token-abc");
  });

  it("integrates webhook parsing with persistence sink", async () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: "wamid.HBgLNDA",
                    status: "delivered",
                    timestamp: "1739966400",
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const persistDeliveryReceiptByMessageId = vi.fn(async () => undefined);

    const receipts = parseMetaDeliveryReceipts(payload);
    for (const receipt of receipts) {
      await persistDeliveryReceiptByMessageId({
        messageId: receipt.messageId,
        status: receipt.status,
        timestamp: receipt.timestamp,
        raw: receipt.raw,
      });
    }

    expect(receipts).toHaveLength(1);
    expect(persistDeliveryReceiptByMessageId).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "wamid.HBgLNDA",
        status: "delivered",
      })
    );
  });
});
