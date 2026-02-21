export type WhatsAppTemplateParameter = {
  type: "text";
  text: string;
};

export type WhatsAppTemplateComponent = {
  type: "header" | "body" | "button";
  parameters: WhatsAppTemplateParameter[];
  sub_type?: "quick_reply" | "url";
  index?: number;
};

export type WhatsAppSendTemplateInput = {
  tenantId: string;
  workspaceId: string;
  to: string;
  templateName: string;
  languageCode: string;
  components?: WhatsAppTemplateComponent[];
  context?: Record<string, unknown>;
};

export type WhatsAppTemplatePayload = {
  messaging_product: "whatsapp";
  to: string;
  type: "template";
  template: {
    name: string;
    language: { code: string };
    components?: Array<{
      type: string;
      parameters: Array<{ type: "text"; text: string }>;
      sub_type?: "quick_reply" | "url";
      index?: number;
    }>;
  };
};

export type WhatsAppSendResult = {
  messageId: string;
  providerPayload?: unknown;
};

export type WhatsAppDeliveryReceipt = {
  tenantId: string;
  workspaceId: string;
  messageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  raw?: unknown;
};

export interface WhatsAppTransport {
  sendTemplate(payload: WhatsAppTemplatePayload): Promise<WhatsAppSendResult>;
}

export interface WhatsAppStore {
  hasOptIn(params: { tenantId: string; workspaceId: string; to: string }): Promise<boolean>;
  persistOutboundMessage(params: {
    tenantId: string;
    workspaceId: string;
    messageId: string;
    to: string;
    payload: WhatsAppTemplatePayload;
    context?: Record<string, unknown>;
  }): Promise<void>;
  persistDeliveryReceipt(receipt: WhatsAppDeliveryReceipt): Promise<void>;
}

export type WhatsAppDeliveryStatus = "sent" | "delivered" | "read" | "failed";

export class WhatsAppOptInRequiredError extends Error {
  constructor(to: string) {
    super(`WHATSAPP_OPT_IN_REQUIRED:${to}`);
    this.name = "WhatsAppOptInRequiredError";
  }
}

export function buildWhatsAppTemplatePayload(
  input: Omit<WhatsAppSendTemplateInput, "tenantId" | "workspaceId" | "context">
): WhatsAppTemplatePayload {
  return {
    messaging_product: "whatsapp",
    to: input.to,
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.languageCode },
      components: input.components?.map((component) => ({
        type: component.type,
        parameters: component.parameters.map((parameter) => ({
          type: parameter.type,
          text: parameter.text,
        })),
        sub_type: component.sub_type,
        index: component.index,
      })),
    },
  };
}

export function createWhatsAppTransportStub(): WhatsAppTransport {
  let sequence = 0;
  return {
    async sendTemplate() {
      sequence += 1;
      return {
        messageId: `wa_stub_${String(sequence).padStart(6, "0")}`,
        providerPayload: { provider: "stub" },
      };
    },
  };
}

export function createWhatsAppService(params: {
  transport?: WhatsAppTransport;
  store: WhatsAppStore;
}) {
  const transport = params.transport ?? createWhatsAppTransportStub();
  const store = params.store;

  return {
    async sendTemplate(input: WhatsAppSendTemplateInput): Promise<WhatsAppSendResult> {
      const optedIn = await store.hasOptIn({
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        to: input.to,
      });
      if (!optedIn) {
        throw new WhatsAppOptInRequiredError(input.to);
      }

      const payload = buildWhatsAppTemplatePayload({
        to: input.to,
        templateName: input.templateName,
        languageCode: input.languageCode,
        components: input.components,
      });

      const sent = await transport.sendTemplate(payload);
      await store.persistOutboundMessage({
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        messageId: sent.messageId,
        to: input.to,
        payload,
        context: input.context,
      });

      return sent;
    },

    async recordDeliveryReceipt(receipt: WhatsAppDeliveryReceipt): Promise<void> {
      await store.persistDeliveryReceipt(receipt);
    },
  };
}
