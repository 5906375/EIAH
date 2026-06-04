import type { RunAtivoReportingInput } from "../../runAtivoSchema";
import {
  buildGuardianReportBaseHtml,
  buildGuardianTemplateMismatchReport,
  extractGuardianReport,
} from "../../guardianReportRenderer";

export function buildGuardianLandingPageHtml(payload: RunAtivoReportingInput) {
  const report = extractGuardianReport(payload) ?? buildGuardianTemplateMismatchReport(payload);
  return buildGuardianReportBaseHtml({
    payload,
    report,
    theme: "dark",
    includeRaw: true,
  });
}
