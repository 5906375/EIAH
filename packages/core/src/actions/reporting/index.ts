import { z } from "zod";
import { registerAction } from "../actionRegistry";
import {
  requireIdempotency,
  encodeGuardrailKey,
  type IdempotencyStore,
} from "../guardrails";
import {
  RunAtivoReportingInputSchema,
  type RunAtivoReportingInput,
} from "./runAtivoSchema";
import { shouldUseGuardianRenderer } from "./guardianReportRenderer";
import { shouldUseJ360LegalRenderer } from "./j360LegalReportRenderer";
import { shouldUseMktCampaignRenderer } from "./mktCampaignReportRenderer";
import { buildLandingPageHtml } from "./renderRunAtivoLandingPage/v1/template";
import { buildPdfHtml } from "./renderRunAtivoPdf/v1/template";
import { buildGuardianLandingPageHtml } from "./renderGuardianLandingPage/v1/template";
import { buildGuardianPdfHtml } from "./renderGuardianPdf/v1/template";
import { buildJ360LandingTemplateHtml } from "./renderJ360LandingPage/v1/template";
import { buildJ360PdfTemplateHtml } from "./renderJ360Pdf/v1/template";
import { buildMktLandingPageHtml as buildMktLandingTemplateHtml } from "./mktCampaignReportRenderer";
import { buildMktPdfHtml as buildMktPdfTemplateHtml } from "./mktCampaignReportRenderer";
import { buildAlertPayload } from "./buildRunAtivoAlert/v1/alertFactory";
export {
  buildJ360LandingPageHtml,
  buildJ360PdfHtml,
  shouldUseJ360LegalRenderer,
  extractJ360LegalReport,
} from "./j360LegalReportRenderer";
export {
  buildMktLandingPageHtml,
  buildMktPdfHtml,
  shouldUseMktCampaignRenderer,
  extractMktCampaignReport,
} from "./mktCampaignReportRenderer";

const landingPageOutputSchema = z.object({
  html: z.string(),
  version: z.literal("v1"),
});

const pdfOutputSchema = z.object({
  html: z.string(),
  version: z.literal("v1"),
  theme: z.literal("light"),
});

const alertOutputSchema = z.object({
  message: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  highlight: z.string().optional(),
});

type RegisterReportingActionsOptions = {
  idempotencyStore: IdempotencyStore;
};

function createGuardrail(store: IdempotencyStore, actionType: string) {
  return requireIdempotency({
    store,
    ttlMs: 5 * 60 * 1000,
    keyResolver: (context) => {
      const resolverKey = [
        actionType,
        context.workspaceId ?? context.tenantId ?? "global",
        context.runId ?? "no-run",
      ]
        .filter(Boolean)
        .join(":");
      return encodeGuardrailKey({
        tenantId: context.tenantId ?? "global",
        actionType,
        idempotencyKey: resolverKey,
      });
    },
  });
}

export function registerReportingActions(options: RegisterReportingActionsOptions) {
  const guardrail = createGuardrail(options.idempotencyStore, "reporting");

  registerAction({
    name: "reporting.runAtivo.renderLandingPage",
    description: "Renderiza a landing page do Run Ativo em modo responsivo.",
    version: "1.0.0",
    criticality: "low",
    contract: {
      input: RunAtivoReportingInputSchema,
      output: landingPageOutputSchema,
    },
    guardrails: [guardrail],
    handler: async ({ input }) => {
      const payload = input as RunAtivoReportingInput;
      const html = shouldUseGuardianRenderer(payload)
        ? buildGuardianLandingPageHtml(payload)
        : shouldUseMktCampaignRenderer(payload)
        ? buildMktLandingTemplateHtml(payload)
        : shouldUseJ360LegalRenderer(payload)
        ? buildJ360LandingTemplateHtml(payload)
        : buildLandingPageHtml(payload);
      return {
        status: "success",
        output: landingPageOutputSchema.parse({ html, version: "v1" }),
      };
    },
  });

  registerAction({
    name: "reporting.runAtivo.renderPdf",
    description: "Gera HTML em tema claro pronto para conversão em PDF.",
    version: "1.0.0",
    criticality: "low",
    contract: {
      input: RunAtivoReportingInputSchema,
      output: pdfOutputSchema,
    },
    guardrails: [guardrail],
    handler: async ({ input }) => {
      const payload = input as RunAtivoReportingInput;
      const html = shouldUseGuardianRenderer(payload)
        ? buildGuardianPdfHtml(payload)
        : shouldUseMktCampaignRenderer(payload)
        ? buildMktPdfTemplateHtml(payload)
        : shouldUseJ360LegalRenderer(payload)
        ? buildJ360PdfTemplateHtml(payload)
        : buildPdfHtml(payload);
      return {
        status: "success",
        output: pdfOutputSchema.parse({
          html,
          version: "v1",
          theme: "light",
        }),
      };
    },
  });

  registerAction({
    name: "reporting.runAtivo.buildAlert",
    description: "Produz alerta curto com foco em riscos e prioridades.",
    version: "1.0.0",
    criticality: "low",
    contract: {
      input: RunAtivoReportingInputSchema,
      output: alertOutputSchema,
    },
    guardrails: [guardrail],
    handler: async ({ input }) => {
      const payload = input as RunAtivoReportingInput;
      const alert = buildAlertPayload(payload);
      return {
        status: "success",
        output: alertOutputSchema.parse(alert),
      };
    },
  });
}

export {
  RunAtivoReportingInputSchema,
  type RunAtivoReportingInput,
  type RunAtivoRecommendation,
  type RunAtivoTimelineItem,
} from "./runAtivoSchema";
export {
  RecipeOrchestrationSchema,
  type RecipeOrchestration,
  type RecipeOrchestrationAgentKey,
} from "./recipeOrchestrationSchema";
export {
  J360LegalReportSchema,
  J360LegalDecisionSchema,
  J360LegalRiskLevelSchema,
  type J360LegalReport,
} from "./j360LegalReportSchema";
export {
  MktCampaignReportSchema,
  MktCampaignChannelSchema,
  MktCampaignReportRiskLevelSchema,
  type MktCampaignReport,
} from "./mktCampaignReportSchema";
