import { z } from "zod";

export const MktCampaignChannelSchema = z.enum([
  "email",
  "linkedin",
  "whatsapp",
  "partnerships",
  "events",
  "communities",
  "blog_seo",
  "paid_media",
  "social",
  "other",
]);

export const MktCampaignReportRiskLevelSchema = z.enum(["low", "medium", "high"]);

export const MktCampaignWorkspaceBrandSchema = z.object({
  name: z.string().nullable().default(null),
  logoUrl: z.string().nullable().default(null),
  primaryColor: z.string().nullable().default(null),
  accentColor: z.string().nullable().default(null),
});

export const MktCampaignDocumentIdentitySchema = z.object({
  documentName: z.string().nullable().default(null),
  generatedAt: z.string().nullable().default(null),
  reportVersion: z.string().default("v1"),
});

export const MktCampaignSectionStatusSchema = z.enum(["available", "partial", "missing"]);

export const MktCampaignReportSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  anchor: z.string().min(1),
  summary: z.string().nullable().default(null),
  status: MktCampaignSectionStatusSchema.default("available"),
});

export const MktCampaignTableOfContentsItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  anchor: z.string().min(1),
  order: z.number().int().nonnegative(),
});

export const MktCampaignAudienceSchema = z.object({
  primary: z.string().min(1),
  segments: z.array(z.string()).default([]),
  geography: z.array(z.string()).default([]),
  notes: z.string().nullable().default(null),
});

export const MktCampaignIcpItemSchema = z.object({
  cluster: z.string().nullable().default(null),
  label: z.string().min(1),
  description: z.string().min(1),
  priority: z.number().int().positive().default(1),
});

export const MktCampaignIcpScoreRuleSchema = z.object({
  criterion: z.string().min(1),
  score: z.number().int(),
  note: z.string().nullable().default(null),
});

export const MktCampaignIcpScoringSchema = z.object({
  positiveSignals: z.array(z.string()).default([]),
  negativeSignals: z.array(z.string()).default([]),
  scoreRules: z.array(MktCampaignIcpScoreRuleSchema).default([]),
  mqlThreshold: z.number().int().nonnegative().default(60),
  sqlThreshold: z.number().int().nonnegative().default(80),
});

export const MktCampaignChannelPlanSchema = z.object({
  channel: MktCampaignChannelSchema,
  label: z.string().min(1),
  objective: z.string().min(1),
  approach: z.string().min(1),
  contentFocus: z.array(z.string()).default([]),
  targetMetric: z.string().nullable().default(null),
  targetMetricValue: z.string().nullable().default(null),
  cadence: z.string().nullable().default(null),
});

export const MktCampaignOutboundCadenceStepSchema = z.object({
  step: z.string().min(1),
  dayOffset: z.number().int().nonnegative(),
  channel: MktCampaignChannelSchema,
  action: z.string().min(1),
  goal: z.string().min(1),
});

export const MktCampaignTimelineItemSchema = z.object({
  period: z.string().min(1),
  activity: z.string().min(1),
  description: z.string().min(1),
  owner: z.string().nullable().default(null),
});

export const MktCampaignPrioritizationItemSchema = z.object({
  horizonDays: z.union([z.literal(30), z.literal(60), z.literal(90)]),
  focus: z.string().min(1),
  actions: z.array(z.string()).default([]),
  expectedOutcome: z.string().min(1),
});

export const MktCampaignAssetSchema = z.object({
  name: z.string().min(1),
  objective: z.string().min(1),
  format: z.string().nullable().default(null),
  owner: z.string().nullable().default(null),
});

export const MktCampaignKpiSchema = z.object({
  name: z.string().min(1),
  target: z.string().min(1),
  channel: MktCampaignChannelSchema.nullable().default(null),
  notes: z.string().nullable().default(null),
});

export const MktCampaignQualificationCriteriaSchema = z.object({
  category: z.enum(["lead", "partner", "pilot"]),
  criteria: z.array(z.string()).default([]),
});

export const MktCampaignValuePropositionSchema = z.object({
  legalArea: z.string().min(1),
  headline: z.string().min(1),
  pain: z.string().min(1),
  solution: z.string().min(1),
  cta: z.string().min(1),
  complianceNote: z.string().nullable().default(null),
});

export const MktCampaignColdEmailTemplateSchema = z.object({
  legalArea: z.string().min(1),
  stage: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  cta: z.string().nullable().default(null),
  complianceNote: z.string().nullable().default(null),
});

export const MktCampaignLaunchChecklistItemSchema = z.object({
  phase: z.string().min(1),
  item: z.string().min(1),
  owner: z.string().nullable().default(null),
  deadline: z.string().nullable().default(null),
  complianceFlag: z.string().nullable().default(null),
});

export const MktCampaignExecutiveGuidanceSchema = z.object({
  adjustNow: z.array(z.string()).default([]),
  dependsOnInternalReview: z.array(z.string()).default([]),
  rerunWhen: z.array(z.string()).default([]),
  readyToLaunchWhen: z.array(z.string()).default([]),
});

export const MktCampaignReportSchema = z.object({
  schemaVersion: z.literal("mkt_campaign_report.v1"),
  workspaceBrand: MktCampaignWorkspaceBrandSchema.default({
    name: null,
    logoUrl: null,
    primaryColor: null,
    accentColor: null,
  }),
  documentIdentity: MktCampaignDocumentIdentitySchema.default({
    documentName: null,
    generatedAt: null,
    reportVersion: "v1",
  }),
  reportSections: z.array(MktCampaignReportSectionSchema).default([]),
  tableOfContents: z.array(MktCampaignTableOfContentsItemSchema).default([]),
  campaignTitle: z.string().nullable().default(null),
  objective: z.string().min(1),
  campaignSummary: z.string().min(1),
  positioning: z.string().nullable().default(null),
  offer: z.string().nullable().default(null),
  audience: MktCampaignAudienceSchema,
  icp: z.array(MktCampaignIcpItemSchema).default([]),
  icpScoring: MktCampaignIcpScoringSchema.default({
    positiveSignals: [],
    negativeSignals: [],
    scoreRules: [],
    mqlThreshold: 60,
    sqlThreshold: 80,
  }),
  coreMessage: z.string().nullable().default(null),
  cta: z.string().nullable().default(null),
  complianceFlags: z.array(z.string()).default([]),
  valuePropositionByArea: z.array(MktCampaignValuePropositionSchema).default([]),
  priorityChannels: z.array(MktCampaignChannelSchema).default([]),
  channelPlans: z.array(MktCampaignChannelPlanSchema).default([]),
  outboundCadence: z.array(MktCampaignOutboundCadenceStepSchema).default([]),
  timeline: z.array(MktCampaignTimelineItemSchema).default([]),
  requiredAssets: z.array(MktCampaignAssetSchema).default([]),
  kpis: z.array(MktCampaignKpiSchema).default([]),
  qualificationCriteria: z.array(MktCampaignQualificationCriteriaSchema).default([]),
  coldEmailTemplates: z.array(MktCampaignColdEmailTemplateSchema).default([]),
  launchChecklist: z.array(MktCampaignLaunchChecklistItemSchema).default([]),
  followUpPlan: z.array(z.string()).default([]),
  prioritizationPlan: z.array(MktCampaignPrioritizationItemSchema).default([]),
  risks: z.array(z.string()).default([]),
  riskLevel: MktCampaignReportRiskLevelSchema.default("low"),
  nextActions: z.array(z.string()).default([]),
  executiveGuidance: MktCampaignExecutiveGuidanceSchema.default({
    adjustNow: [],
    dependsOnInternalReview: [],
    rerunWhen: [],
    readyToLaunchWhen: [],
  }),
});

export type MktCampaignReport = z.infer<typeof MktCampaignReportSchema>;
