import type { RunAtivoReportingInput } from "../../runAtivoSchema";
import {
  buildGuardianReportBaseHtml,
  buildGuardianTemplateMismatchReport,
  extractGuardianReport,
} from "../../guardianReportRenderer";

export function buildGuardianPdfHtml(payload: RunAtivoReportingInput) {
  const report = extractGuardianReport(payload) ?? buildGuardianTemplateMismatchReport(payload);
  return buildGuardianReportBaseHtml({
    payload,
    report,
    theme: "light",
    includeRaw: false,
  });
}
