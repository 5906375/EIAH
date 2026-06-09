import type { RunAtivoReportingInput } from "../../runAtivoSchema";
import { buildJ360LandingPageHtml } from "../../j360LegalReportRenderer";

export function buildJ360LandingTemplateHtml(payload: RunAtivoReportingInput) {
  return buildJ360LandingPageHtml(payload);
}
