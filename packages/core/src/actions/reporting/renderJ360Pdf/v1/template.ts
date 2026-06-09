import type { RunAtivoReportingInput } from "../../runAtivoSchema";
import { buildJ360PdfHtml } from "../../j360LegalReportRenderer";

export function buildJ360PdfTemplateHtml(payload: RunAtivoReportingInput) {
  return buildJ360PdfHtml(payload);
}
