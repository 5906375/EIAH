export type ExperienceDiagnosticRecentEvent = {
  eventType: "experience.recommended_action.aligned" | "experience.recommended_action.diverged";
  message: string;
  createdAt: string;
  surfaceId: string | null;
  landingPath: string | null;
  primaryActionId: string | null;
  primaryActionPath: string | null;
  source: string | null;
};

export type ExperienceDiagnosticSnapshot = {
  window: "7d" | "30d";
  totals: {
    aligned: number;
    diverged: number;
  };
  alignment: {
    rate: number | null;
    status: "healthy" | "watch" | "poor" | "unknown";
    summary: string;
    dominantSource: string;
    dominantAlignedSource: string;
    dominantDivergedSource: string;
    dominantAlignedSurface: string;
    dominantDivergedSurface: string;
    convergenceSummary: string;
    divergenceSummary: string;
  };
  latestEventAt: string | null;
  recentEvents: ExperienceDiagnosticRecentEvent[];
};
