export const publicWebAssistedPolicy = {
  maxPagesPerScan: 10,
  maxResultsPerSource: 20,
  allowLogin: false,
  allowCaptchaBypass: false,
  allowPaywallBypass: false,
  collectContactFields: false,
  collectOwnerName: false,
  cacheTtlMinutes: 60,
  confidenceCap: 0.55,
  requireSourceAttribution: true,
} as const;

