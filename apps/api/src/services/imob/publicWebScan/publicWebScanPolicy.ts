import { publicWebAssistedPolicy } from "../marketScan/publicWebAssistedPolicy";

export const publicWebScanPolicy = {
  mode: "mock_manual",
  confidenceCap: publicWebAssistedPolicy.confidenceCap,
  maxPagesPerScan: publicWebAssistedPolicy.maxPagesPerScan,
  maxResultsPerSource: publicWebAssistedPolicy.maxResultsPerSource,
  collectPii: false,
  allowInternetFetch: false,
  limitations: [
    "Amostra pública limitada ou fornecida manualmente.",
    "Sem login, captcha, paywall ou automação de scraping.",
    "Dados de contato e PII são excluídos.",
    "Não substitui fonte autorizada, feed parceiro ou base licenciada.",
  ],
} as const;
