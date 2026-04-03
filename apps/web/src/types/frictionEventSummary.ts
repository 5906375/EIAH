export type FrictionEventSummaryRecentEvent = {
  eventId: string;
  source: string;
  kind: string;
  severity: "low" | "medium" | "high";
  tenantId: string;
  workspaceId: string;
  activeDomain?: string;
  surfaceId?: string;
  reasonCode?: string;
  traceId?: string;
  summary: string;
  occurredAt: string;
  metadata?: Record<string, unknown>;
};

export type FrictionEventSummary = {
  scope: {
    tenantId: string;
    workspaceId: string | null;
    windowStart: string | null;
  };
  total: number;
  byKind: Record<string, number>;
  bySource: Record<string, number>;
  byDomain: Record<string, number>;
  bySurface: Record<string, number>;
  byReasonCode: Record<string, number>;
  byWorkspace: Record<string, number>;
  recentEvents: FrictionEventSummaryRecentEvent[];
};
