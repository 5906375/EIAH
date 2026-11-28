import express from "express";
import { asyncHandler, createGovernedRouter } from "../middlewares/asyncHandler";
import { createMetaOperationalAdapter, type MetaLabMetric, type MetaLabStore } from "../services/whatsappMetaAdapter";
import { resolveMetaOperationalConfig, type MetaOperationalConfig } from "../services/whatsappMetaOperationalConfig";

export const META_WHATSAPP_WEBHOOK_PATH = "/api/webhooks/meta/whatsapp";

export function createMetaWhatsappRouter(dependencies: {
  environment: () => Readonly<Record<string, string | undefined>>;
  store: (config: MetaOperationalConfig) => MetaLabStore;
  observe: (metric: MetaLabMetric) => void;
  now?: () => number;
}) {
  const router = createGovernedRouter();
  // This entire namespace is terminal: never fall through into the generic URL/body logger.
  router.use(asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const unavailable = (status: number) => res.status(status).json({ ok: false });
    try {
      const decision = resolveMetaOperationalConfig(dependencies.environment());
      if (decision.state === "disabled") { unavailable(404); return; }
      if (decision.state !== "configured") { unavailable(503); return; }
      if (req.path !== "/") { unavailable(404); return; }
      const adapter = createMetaOperationalAdapter({ ...decision.config,
        store: dependencies.store(decision.config), now: dependencies.now ?? Date.now, observe: dependencies.observe });
      if (req.method === "GET") {
        const result = adapter.handshake(req.query);
        if (result.status === 200) res.status(200).type("text/plain").send(result.challenge);
        else unavailable(result.status);
        return;
      }
      if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); unavailable(405); return; }
      if (!req.is("application/json") || (req.headers["content-encoding"] && req.headers["content-encoding"] !== "identity")) {
        unavailable(415); return;
      }
      const parseError: unknown = await new Promise(resolve => {
        express.raw({ type: "application/json", limit: decision.config.limits.payloadBytes, inflate: false })(req, res, resolve);
      });
      if (parseError) {
        const tooLarge = typeof parseError === "object" && "type" in parseError && parseError.type === "entity.too.large";
        unavailable(tooLarge ? 413 : 400); return;
      }
      if (!Buffer.isBuffer(req.body)) { unavailable(400); return; }
      const result = await adapter.inbound(req.body, req.get("x-hub-signature-256"));
      // ACK contains no event, tenant, sender, content, signature, token or raw error.
      res.status(result.status).json({ ok: result.status === 200 });
    } catch {
      unavailable(503);
    }
  }));
  return router;
}
