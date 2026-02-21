import type { WhatsAppSendResult, WhatsAppTemplatePayload, WhatsAppTransport } from "./index";

type MetaGraphConfig = {
  apiBaseUrl: string;
  apiVersion: string;
  phoneNumberId: string;
  accessToken: string;
};

function parseBoolEnv(value: string | undefined, fallback = false) {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "on", "yes"].includes(normalized)) return true;
  if (["0", "false", "off", "no"].includes(normalized)) return false;
  return fallback;
}

export function isWhatsAppProviderEnabled() {
  return parseBoolEnv(process.env.WHATSAPP_PROVIDER_ENABLED, false);
}

function resolveMetaConfig(): MetaGraphConfig {
  const apiBaseUrl = process.env.WHATSAPP_META_API_BASE_URL?.trim() || "https://graph.facebook.com";
  const apiVersion = process.env.WHATSAPP_META_API_VERSION?.trim() || "v21.0";
  const phoneNumberId = process.env.WHATSAPP_META_PHONE_NUMBER_ID?.trim();
  const accessToken = process.env.WHATSAPP_META_ACCESS_TOKEN?.trim();
  if (!phoneNumberId || !accessToken) {
    throw new Error("WHATSAPP_META_CONFIG_MISSING");
  }
  return { apiBaseUrl, apiVersion, phoneNumberId, accessToken };
}

function resolveMessageId(body: any): string {
  const messageId = body?.messages?.[0]?.id;
  if (typeof messageId !== "string" || messageId.trim().length === 0) {
    throw new Error("WHATSAPP_META_MESSAGE_ID_MISSING");
  }
  return messageId;
}

export function createWhatsAppTransportMeta(params?: {
  fetchFn?: typeof fetch;
  config?: MetaGraphConfig;
}): WhatsAppTransport {
  const fetchFn = params?.fetchFn ?? globalThis.fetch;
  const config = params?.config ?? resolveMetaConfig();

  return {
    async sendTemplate(payload: WhatsAppTemplatePayload): Promise<WhatsAppSendResult> {
      const endpoint = `${config.apiBaseUrl}/${config.apiVersion}/${config.phoneNumberId}/messages`;
      const response = await fetchFn(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          `WHATSAPP_META_HTTP_ERROR:${response.status}:${JSON.stringify(responseBody).slice(0, 300)}`
        );
      }
      return {
        messageId: resolveMessageId(responseBody),
        providerPayload: responseBody,
      };
    },
  };
}
