import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  apiGetTrustHistory,
  apiListDelegations,
  apiListRuns,
  apiListProfiles,
  apiGetGovernanceOverview,
  apiListPendingApprovals,
  apiApproveRun,
  apiListWorkspaces,
  apiGetAuthMe,
  apiGetIntegrityReport,
  apiListRunsGlobal,
  BASE_URL,
  type RunEvent,
  type Run,
  type PendingApproval,
  type DelegationPolicy,
} from "@/lib/api";
import { updateSession, useSession } from "@/state/sessionStore";

/**
 * Dashboard de Governança (Responsivo)
 * - Mantém layout visual tipo "Control Center" multi-camada
 * - Preparado para multi-tenant / personas / SSE / evidências (hashes)
 *
 * Observação:
 * - Este arquivo mantém tudo local para evitar criar muitos arquivos.
 * - Ícones e charts são implementados inline para evitar novas dependências.
 */

type Persona = "eiah_admin" | "global_auditor" | "tenant_admin" | "tenant_operator" | "tenant_viewer";

type Workspace = { id: string; name: string };

const mapRoleToPersona = (role?: string | null): Persona => {
  const raw = (role ?? "").toLowerCase();
  if (raw.includes("global_auditor") || raw.includes("auditor")) return "global_auditor";
  if (raw.includes("tenant_operator") || raw.includes("operator")) return "tenant_operator";
  if (raw.includes("tenant_viewer") || raw.includes("viewer")) return "tenant_viewer";
  if (raw.includes("global_admin") || raw.includes("admin") || raw.includes("eiah")) return "eiah_admin";
  return "tenant_admin";
};

type IntegrityStatus =
  | "matched"
  | "missing_in_scl"
  | "missing_in_guardrail"
  | "hash_mismatch";

type IntegrityRow = {
  runId: string;
  actionId: string;
  criticality: "low" | "medium" | "high" | "critical" | "unknown";
  status: IntegrityStatus;
  lastSeen: string;
  intentHash: string;
  payloadHash: string;
  policyHash?: string;
  signatureHash?: string;
  txId?: string;
};

type GuardrailEvent = {
  id: string;
  type: "pii" | "prompt_injection" | "policy";
  severity: "low" | "medium" | "high";
  createdAt: string;
  summary: string;
};

type TrustSeriesPoint = { t: string; score: number };

type ActiveRun = {
  runId: string;
  user: string;
  agent: string;
  startedAt: string;
  state: "running" | "blocked" | "completed" | "failed";
  lastEvent: string;
};

type IntentMonitorSummary = {
  runId: string;
  createdAt: string;
  intent: string | null;
  actions: string[];
};

type JudgeMetricsSummary = {
  total: number;
  flagged: number;
  clean: number;
  avgScore: number | null;
  lastSeen: string | null;
  topFlags: Array<{ flag: string; count: number }>;
};

const personaLabels: Record<Persona, string> = {
  eiah_admin: "Admin EIAH",
  global_auditor: "Auditor",
  tenant_admin: "Tenant Admin",
  tenant_operator: "Tenant Operator",
  tenant_viewer: "Tenant Viewer",
};

const emptyWorkspaces: Workspace[] = [];

const cn = (...classes: Array<string | undefined | false>) =>
  classes.filter(Boolean).join(" ");

function IconShield() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function IconActivity() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path d="M3 12h5l2-6 4 12 2-6h5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3l9 16H3l9-16z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M12 9v4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}

function IconTimer() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconFilter() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path d="M4 6h16l-6 7v5l-4 2v-7L4 6z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17" cy="10" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 20c0-3 3-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14 19c.4-2 2.2-3.5 4.5-3.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconKey() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="9" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13 9h8v3h-3v3h-3v3h-2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconZap() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-white/10 bg-surface/60", className)}>
      {children}
    </div>
  );
}

function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-4 pt-4", className)}>{children}</div>;
}

function CardTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("text-base font-semibold", className)}>{children}</div>;
}

function CardContent({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-4 pb-4", className)}>{children}</div>;
}

function Badge({
  variant = "secondary",
  className,
  children,
}: {
  variant?: "default" | "secondary" | "destructive" | "outline";
  className?: string;
  children: React.ReactNode;
}) {
  const styles =
    variant === "destructive"
      ? "border-red-500/40 bg-red-500/15 text-red-200"
      : variant === "outline"
      ? "border-white/20 bg-transparent text-muted-foreground"
      : variant === "default"
      ? "border-accent/30 bg-accent/15 text-foreground"
      : "border-white/10 bg-white/10 text-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]",
        styles,
        className
      )}
    >
      {children}
    </span>
  );
}

function Button({
  variant = "default",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "outline";
}) {
  const styles =
    variant === "outline"
      ? "border border-white/15 bg-transparent text-foreground hover:bg-white/10"
      : variant === "secondary"
      ? "bg-white/10 text-foreground hover:bg-white/20"
      : "bg-accent/90 text-surface hover:bg-accent";
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition",
        styles,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border border-white/10 bg-surface-strong/70 px-4 py-2 text-sm text-foreground shadow-[0_18px_36px_-28px_rgba(56,189,248,0.4)] outline-none focus:ring-2 focus:ring-accent/40",
        className
      )}
      {...props}
    />
  );
}

function Switch({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full border transition",
        checked ? "border-accent/60 bg-accent/40" : "border-white/20 bg-white/10"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

function Separator() {
  return <div className="h-px w-full bg-white/10" />;
}

type TabsContextValue = {
  value: string;
  setValue: (next: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

function Tabs({
  defaultValue,
  children,
  className,
}: {
  defaultValue: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

function TabsList({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/5 p-2",
        className
      )}
    >
      {children}
    </div>
  );
}

function TabsTrigger({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(TabsContext);
  if (!ctx) return null;
  const active = ctx.value === value;
  return (
    <button
      type="button"
      onClick={() => ctx.setValue(value)}
      className={cn(
        "rounded-xl px-3 py-2 text-sm font-semibold transition",
        active ? "bg-accent/20 text-foreground" : "text-muted-foreground hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

function TabsContent({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(TabsContext);
  if (!ctx || ctx.value !== value) return null;
  return <div className={className}>{children}</div>;
}

function kpiCard(props: { title: string; value: string; hint: string; icon: React.ReactNode }) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {props.title}
          </CardTitle>
          <div className="text-muted-foreground">{props.icon}</div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{props.value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{props.hint}</div>
      </CardContent>
    </Card>
  );
}

function EvidenceRow({
  label,
  value,
  sensitive = false,
  reveal,
}: {
  label: string;
  value?: string;
  sensitive?: boolean;
  reveal?: boolean;
}) {
  const v = value?.trim() ? value : "—";
  const masked = sensitive && !reveal && v !== "—" ? `${v.slice(0, 6)}…${v.slice(-4)}` : v;
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-xs">{masked}</div>
    </div>
  );
}

function can(permission: string, perms: Set<string>) {
  return perms.has(permission);
}

function statusBadge(status: IntegrityStatus) {
  const map: Record<
    IntegrityStatus,
    { label: string; icon: React.ReactNode; variant?: "default" | "secondary" | "destructive" | "outline" }
  > = {
    matched: { label: "Matched", icon: <IconShield />, variant: "secondary" },
    missing_in_scl: { label: "Missing in SCL", icon: <IconAlert />, variant: "outline" },
    missing_in_guardrail: { label: "Missing in Guardrail", icon: <IconAlert />, variant: "outline" },
    hash_mismatch: { label: "Hash mismatch", icon: <IconAlert />, variant: "destructive" },
  };
  const s = map[status];
  return (
    <Badge variant={s.variant} className="gap-1">
      {s.icon}
      <span>{s.label}</span>
    </Badge>
  );
}

function criticalityBadge(c: IntegrityRow["criticality"]) {
  const v =
    c === "critical"
      ? "destructive"
      : c === "high"
      ? "default"
      : c === "unknown"
      ? "outline"
      : "secondary";
  return <Badge variant={v}>{c.toUpperCase()}</Badge>;
}

function LineSpark({ data }: { data: TrustSeriesPoint[] }) {
  const width = 520;
  const height = 220;
  const padding = 24;
  const max = 100;
  const min = 0;
  const points = data.map((d, index) => {
    const x = padding + (index / Math.max(1, data.length - 1)) * (width - padding * 2);
    const y = padding + (1 - (d.score - min) / (max - min)) * (height - padding * 2);
    return { x, y };
  });
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`)
    .join(" ");
  const area = `${line} L${width - padding},${height - padding} L${padding},${height - padding} Z`;
  return (
    <svg className="h-full w-full" viewBox={`0 0 ${width} ${height}`}>
      <rect x="0" y="0" width={width} height={height} fill="transparent" />
      <path d={area} fill="currentColor" opacity="0.12" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2" />
      {points.map((p, i) => (
        <circle key={`${p.x}-${p.y}-${i}`} cx={p.x} cy={p.y} r="2" fill="currentColor" />
      ))}
    </svg>
  );
}

export default function GovernanceDashboard() {
  const session = useSession();
  const [persona, setPersona] = useState<Persona>(() => {
    if (typeof window === "undefined") return "tenant_admin";
    const stored = window.localStorage.getItem("eiah_profile_active_role");
    return mapRoleToPersona(stored);
  });
  const [authRole, setAuthRole] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [availablePersonas, setAvailablePersonas] = useState<Persona[]>(["tenant_admin"]);
  const isGlobalAdmin = authRole === "global_admin";
  const isGlobalView = isGlobalAdmin && persona === "eiah_admin";
  const [workspaces, setWorkspaces] = useState<Workspace[]>(emptyWorkspaces);
  const [globalWorkspaces, setGlobalWorkspaces] = useState<Workspace[]>(emptyWorkspaces);
  const [workspaceId, setWorkspaceId] = useState(session.workspaceId);
  const [globalTenantFilter, setGlobalTenantFilter] = useState("");
  const [globalWorkspaceFilter, setGlobalWorkspaceFilter] = useState("");
  const [search, setSearch] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [revealEvidence, setRevealEvidence] = useState(false);
  const [shadowMode, setShadowMode] = useState(true);

  const [trustSeries, setTrustSeries] = useState<TrustSeriesPoint[]>([]);
  const [integrityRows, setIntegrityRows] = useState<IntegrityRow[]>([]);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [approvalActionLoading, setApprovalActionLoading] = useState<Record<string, "APPROVED" | "REJECTED" | null>>(
    {}
  );
  const [guardrailEvents, setGuardrailEvents] = useState<GuardrailEvent[]>([]);
  const [activeRuns, setActiveRuns] = useState<ActiveRun[]>([]);
  const [delegations, setDelegations] = useState<DelegationPolicy[]>([]);
  const [intentMonitor, setIntentMonitor] = useState<IntentMonitorSummary | null>(null);
  const [judgeMetrics, setJudgeMetrics] = useState<JudgeMetricsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());
  const eventCursorRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let active = true;
    apiGetAuthMe()
      .then((response) => {
        if (!active || !response?.data) return;
        const { role, roles, permissions: perms } = response.data;
        const personas = (roles ?? [role])
          .map((r) => mapRoleToPersona(r))
          .filter(Boolean) as Persona[];
        const uniquePersonas = Array.from(new Set(personas));
        setAuthRole(role ?? null);
        setPermissions(new Set(perms ?? []));
        setAvailablePersonas(uniquePersonas.length > 0 ? uniquePersonas : ["tenant_admin"]);
        setPersona(mapRoleToPersona(role));
      })
      .catch(() => {
        if (!active) return;
        setPermissions(new Set());
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const loadActiveProfile = () => {
      apiListProfiles()
        .then((response) => {
          const items = response.items ?? [];
          const activeId = window.localStorage.getItem("eiah_profile_active_id");
          const active =
            (activeId && items.find((p) => p.id === activeId)) || items[0] || null;
          if (!active) return;
          const effectiveRole =
            active.fullName?.trim() === "Carlos Alberto Merlo"
              ? "eiah_admin"
              : active.role ?? "";
          const nextPersona = mapRoleToPersona(effectiveRole);
          setPersona((current) => (authRole ? current : nextPersona));
          window.localStorage.setItem("eiah_profile_active_role", effectiveRole);
          updateSession({
            tenantId: active.tenantId?.trim() || session.tenantId,
            workspaceId: active.workspaceId?.trim() || session.workspaceId,
          });
        })
        .catch(() => {
          // ignore
        });
    };

    loadActiveProfile();

    const onStorage = (event: StorageEvent) => {
      if (event.key === "eiah_profile_active_id") {
        loadActiveProfile();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, [session.tenantId, session.workspaceId]);

  const filteredIntegrity = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return integrityRows;
    return integrityRows.filter((r) =>
      `${r.runId} ${r.actionId} ${r.status}`.toLowerCase().includes(q)
    );
  }, [integrityRows, search]);

  const mismatchCount = integrityRows.filter((r) => r.status === "hash_mismatch").length;
  const missingCount = integrityRows.filter(
    (r) => r.status === "missing_in_scl" || r.status === "missing_in_guardrail"
  ).length;
  const pendingApprovals = approvals.filter((a) => a.status === "awaiting_approval").length;

  async function handleApprovalDecision(runId: string, decision: "APPROVED" | "REJECTED") {
    if (!can("approvals.approve", permissions)) return;
    const reason =
      decision === "REJECTED"
        ? (window.prompt("Motivo da rejeição (opcional):") || "").trim() || null
        : null;
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `approve_${runId}_${Date.now()}`;

    setApprovalActionLoading((prev) => ({ ...prev, [runId]: decision }));
    setError(null);
    try {
      await apiApproveRun(runId, {
        decision,
        reason,
        idempotency_key: idempotencyKey,
      });
      const next = await apiListPendingApprovals({ limit: 200 }).catch(() => ({ items: [] as PendingApproval[] }));
      setApprovals(next.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao processar decisão de approval");
    } finally {
      setApprovalActionLoading((prev) => ({ ...prev, [runId]: null }));
    }
  }

  useEffect(() => {
    const currentWorkspace = session.workspaceId || "workspace-demo";
    setWorkspaceId(currentWorkspace);
    setWorkspaces([
      {
        id: currentWorkspace,
        name: `Workspace — ${currentWorkspace}`,
      },
    ]);
  }, [session.workspaceId]);

  useEffect(() => {
    if (!isGlobalView) return;
    let active = true;
    apiListWorkspaces({
      tenantId: globalTenantFilter.trim() || undefined,
      limit: 200,
    })
      .then((response) => {
        if (!active) return;
        const items = response.items ?? [];
        setGlobalWorkspaces(
          items.map((w) => ({
            id: w.id,
            name: `${w.name} — ${w.id}`,
          }))
        );
      })
      .catch(() => {
        if (!active) return;
        setGlobalWorkspaces([]);
      });

    return () => {
      active = false;
    };
  }, [isGlobalView, globalTenantFilter]);

  useEffect(() => {
    if (!workspaceId) return;
    let active = true;

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [
          trustHistory,
          runsResponse,
          pendingApprovalsResponse,
          delegationsResponse,
          governanceOverview,
          integrityReport,
        ] =
          await Promise.all([
            apiGetTrustHistory(workspaceId).catch(() => null),
            (isGlobalView
              ? apiListRunsGlobal({
                  size: 200,
                  tenantId: globalTenantFilter.trim() || undefined,
                  workspaceId: globalWorkspaceFilter.trim() || undefined,
                })
              : apiListRuns({ workspaceId, size: 80 })
            ).catch(() => ({ items: [] as Run[] })),
            apiListPendingApprovals({ limit: 200 }).catch(() => ({ items: [] as PendingApproval[] })),
            apiListDelegations({ role: "all" }).catch(() => ({ items: [] })),
            apiGetGovernanceOverview({ limit: 200 }).catch(() => null),
            apiGetIntegrityReport({ limit: 500 }).catch(() => null),
          ]);

        if (!active) return;

        setTrustSeries(trustHistory?.points ?? []);

        const runs = runsResponse?.items ?? [];
        const nextActiveRuns = runs
          .filter((run) => ["running", "blocked"].includes(run.status))
          .map((run) => ({
            runId: run.id,
            user: "—",
            agent: run.agent,
            startedAt: run.startedAt ?? run.finishedAt ?? "—",
            state:
              run.status === "blocked"
                ? "blocked"
                : run.status === "running"
                ? "running"
                : run.status === "error"
                ? "failed"
                : "completed",
            lastEvent: `status: ${run.status}`,
          }));
        setActiveRuns(nextActiveRuns);

        setApprovals(pendingApprovalsResponse?.items ?? []);

        setDelegations(delegationsResponse?.items ?? []);
        setIntentMonitor(governanceOverview?.intent ?? null);
        setJudgeMetrics(governanceOverview?.judge ?? null);

        setIntegrityRows(
          integrityReport?.rows?.map((row) => ({
            runId: row.runId,
            actionId: row.actionId,
            criticality: row.criticality,
            status: row.status,
            lastSeen: row.lastSeen,
            intentHash: row.intentHash,
            payloadHash: row.payloadHash,
            policyHash: row.policyHash ?? undefined,
            signatureHash: row.signatureHash ?? undefined,
            txId: row.txId ?? undefined,
          })) ?? []
        );
        setGuardrailEvents([]);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Falha ao carregar dados");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();
    return () => {
      active = false;
    };
  }, [workspaceId, persona, globalTenantFilter, globalWorkspaceFilter, isGlobalView]);

  useEffect(() => {
    const runIds = activeRuns.slice(0, 5).map((run) => run.runId);
    if (runIds.length === 0) {
      eventSourcesRef.current.forEach((source) => source.close());
      eventSourcesRef.current.clear();
      eventCursorRef.current.clear();
      return;
    }

    let cancelled = false;

    const connectAll = async () => {
      const baseUrl =
        BASE_URL.startsWith("http") || BASE_URL.startsWith("https")
          ? BASE_URL
          : `${window.location.origin}${BASE_URL}`;

      runIds.forEach((runId) => {
        if (eventSourcesRef.current.has(runId)) return;
        const cursor = eventCursorRef.current.get(runId);
        const url = new URL(`${baseUrl}/runs/${runId}/stream`);
        if (cursor) url.searchParams.set("cursor", cursor);

        const source = new EventSource(url.toString(), { withCredentials: true });
        eventSourcesRef.current.set(runId, source);

        source.onmessage = (e) => {
          if (cancelled) return;
          try {
            const parsed = JSON.parse(e.data) as RunEvent;
            eventCursorRef.current.set(runId, parsed.id);
            setActiveRuns((prev) =>
              prev.map((entry) => {
                if (entry.runId !== runId) return entry;
                const nextState =
                  parsed.type.includes("blocked")
                    ? "blocked"
                    : parsed.type.includes("error")
                    ? "failed"
                    : parsed.type.includes("completed") || parsed.type.includes("finalized")
                    ? "completed"
                    : entry.state;
                return {
                  ...entry,
                  state: nextState,
                  lastEvent: parsed.type,
                };
              })
            );
          } catch {
            // ignore invalid events
          }
        };

        source.onerror = () => {
          source.close();
          eventSourcesRef.current.delete(runId);
        };
      });
    };

    connectAll();

    return () => {
      cancelled = true;
      eventSourcesRef.current.forEach((source) => source.close());
      eventSourcesRef.current.clear();
    };
  }, [activeRuns]);

  return (
    <div className="min-h-screen w-full bg-background">
      <div className="sticky top-0 z-40 border-b border-white/10 bg-surface/80 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <IconShield />
              <div className="text-sm font-semibold leading-tight">
                Dashboard de Governança - Control Center • Runs • Trust • Ledger • Approvals • Delegação
              </div>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="flex items-center gap-2">
                <IconUsers />
                <Select
                  value={persona}
                  onValueChange={(v) => {
                    const next = v as Persona;
                    if (!availablePersonas.includes(next)) return;
                    setPersona(next);
                  }}
                >
                  <SelectTrigger className="w-[190px] rounded-xl">
                    <SelectValue placeholder="Persona" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePersonas.map((item) => (
                      <SelectItem key={item} value={item}>
                        {personaLabels[item]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isGlobalView ? (
                <>
                  <Input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Senha"
                    className="w-full rounded-xl md:w-[160px]"
                    maxLength={8}
                  />
                  <Input
                    value={globalTenantFilter}
                    onChange={(e) => setGlobalTenantFilter(e.target.value)}
                    placeholder="tenantId (opcional)"
                    className="w-full rounded-xl md:w-[200px]"
                  />
                  <Select
                    value={globalWorkspaceFilter || "__all"}
                    onValueChange={(next) =>
                      setGlobalWorkspaceFilter(next === "__all" ? "" : next)
                    }
                  >
                    <SelectTrigger className="w-full rounded-xl md:w-[240px]">
                      <SelectValue placeholder="workspaceId (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">Todos os workspaces</SelectItem>
                      {globalWorkspaces.length === 0 ? (
                        <SelectItem value="__none" disabled>
                          Nenhum workspace encontrado
                        </SelectItem>
                      ) : (
                        globalWorkspaces.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-white/10"
                    onClick={() => {
                      setGlobalTenantFilter("");
                      setGlobalWorkspaceFilter("");
                    }}
                  >
                    Limpar filtros
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Select
                    value={workspaceId}
                    onValueChange={(next) => {
                      setWorkspaceId(next);
                      updateSession({ workspaceId: next });
                    }}
                  >
                    <SelectTrigger className="w-[220px] rounded-xl">
                      <SelectValue placeholder="Workspace" />
                    </SelectTrigger>
                    <SelectContent>
                      {workspaces.length === 0 ? (
                        <SelectItem value={workspaceId}>
                          {workspaceId ? `Workspace — ${workspaceId}` : "Workspace"}
                        </SelectItem>
                      ) : (
                        workspaces.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="relative">
                <div className="pointer-events-none absolute left-3 top-2.5 text-muted-foreground">
                  <IconSearch />
                </div>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar run/action/status…"
                  className="w-full rounded-xl pl-9 md:w-[280px]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-6">
        {loading && (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-muted-foreground">
            Carregando dados do workspace...
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {kpiCard({
            title: "Runs ativas (SSE)",
            value: String(activeRuns.length),
            hint: "Execuções em tempo real (stream)",
            icon: <IconActivity />,
          })}
          {kpiCard({
            title: "Incidentes Guardrail",
            value: String(guardrailEvents.length),
            hint: "PII / prompt injection / policy",
            icon: <IconShield />,
          })}
          {kpiCard({
            title: "Integrity issues",
            value: `${mismatchCount + missingCount}`,
            hint: "Mismatch + missing (Guardrail↔SCL)",
            icon: <IconKey />,
          })}
          {kpiCard({
            title: "Approvals pendentes",
            value: String(pendingApprovals),
            hint: "Aprovações humanas (Fase 5.2)",
            icon: <IconTimer />,
          })}
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="flex w-full flex-wrap justify-start gap-2 rounded-2xl p-2">
            <TabsTrigger value="overview" className="rounded-xl">
              Visão geral
            </TabsTrigger>
            <TabsTrigger value="runs" className="rounded-xl">
              Runs
            </TabsTrigger>
            <TabsTrigger value="governance" className="rounded-xl">
              Governança
            </TabsTrigger>
            <TabsTrigger value="ledger" className="rounded-xl">
              Ledger & Integridade
            </TabsTrigger>
            {can("approvals.view", permissions) ? (
              <TabsTrigger value="approvals" className="rounded-xl" data-testid="tab-approvals">
                Approvals
              </TabsTrigger>
            ) : null}
            {can("delegation.view", permissions) ? (
              <TabsTrigger value="delegation" className="rounded-xl">
                Delegação
              </TabsTrigger>
            ) : null}
            {can("ops.view", permissions) ? (
              <TabsTrigger value="ops" className="rounded-xl">
                Ops (link)
              </TabsTrigger>
            ) : null}
            {can("reports.view", permissions) ? (
              <TabsTrigger value="report" className="rounded-xl">
                Relatório
              </TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="rounded-2xl shadow-sm lg:col-span-2">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">Trust Score (workspace)</CardTitle>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <IconZap />
                        <span className="text-xs">Judge Gate</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Shadow</span>
                        <Switch
                          checked={shadowMode}
                          onCheckedChange={setShadowMode}
                          disabled={!can("governance.judge.toggle", permissions)}
                        />
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="h-[260px] text-accent">
                  {trustSeries.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      Sem histórico de Trust Score.
                    </div>
                  ) : (
                    <LineSpark data={trustSeries} />
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <IconLock /> TrustGate pode bloquear ações críticas
                    </div>
                    <div>
                      Modo atual:{" "}
                      <span className="font-medium">{shadowMode ? "Shadow" : "Blocking"}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Guardrail Alerts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {guardrailEvents.length === 0 ? (
                    <div className="rounded-xl border border-white/10 p-4 text-sm text-muted-foreground">
                      Sem alertas de guardrail no workspace.
                    </div>
                  ) : (
                    guardrailEvents.map((e) => (
                      <div key={e.id} className="rounded-xl border border-white/10 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                e.severity === "high"
                                  ? "destructive"
                                  : e.severity === "medium"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {e.type}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{e.createdAt}</span>
                          </div>
                          <div className="text-muted-foreground">
                            <IconAlert />
                          </div>
                        </div>
                        <div className="mt-2 text-sm">{e.summary}</div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">Runs ativas (tempo real)</CardTitle>
                    <Button variant="outline" className="rounded-xl gap-2">
                      <IconFilter />
                      Filtros
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {activeRuns.length === 0 ? (
                    <div className="rounded-xl border border-white/10 p-4 text-sm text-muted-foreground">
                      Nenhuma run ativa no momento.
                    </div>
                  ) : (
                    activeRuns.map((r) => (
                      <div
                        key={r.runId}
                        data-testid={`active-run-${r.runId}`}
                        className="flex flex-col gap-1 rounded-xl border border-white/10 p-3 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs">{r.runId}</span>
                            <Badge
                              variant={
                                r.state === "blocked"
                                  ? "destructive"
                                  : r.state === "running"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {r.state}
                            </Badge>
                          </div>
                          <div className="mt-1 text-sm truncate">{r.lastEvent}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {r.user} • {r.agent} • {r.startedAt}
                          </div>
                        </div>
                        <Button className="rounded-xl mt-2 md:mt-0" variant="secondary">
                          Abrir
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Ledger Integrity (resumo)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl border border-white/10 p-3">
                    <div>
                      <div className="text-sm font-medium">Hash mismatches</div>
                      <div className="text-xs text-muted-foreground">Exige investigação imediata</div>
                    </div>
                    <Badge variant={mismatchCount ? "destructive" : "secondary"}>{mismatchCount}</Badge>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-white/10 p-3">
                    <div>
                      <div className="text-sm font-medium">Missing entries</div>
                      <div className="text-xs text-muted-foreground">Guardrail ↔ SCL desalinhado</div>
                    </div>
                    <Badge variant={missingCount ? "default" : "secondary"}>{missingCount}</Badge>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">Evidências (hashes) no UI</div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Revelar</span>
                      <Switch checked={revealEvidence} onCheckedChange={setRevealEvidence} />
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    (Dica) Em produção, isso deve ser JIT Access com log/auditoria.
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="runs" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="rounded-2xl shadow-sm lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Run Viewer (SSE + Replay)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-xl border border-white/10 p-4">
                    <div className="text-sm font-medium">Selecione uma run para ver timeline</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Integre com /api/runs/:id/events e /api/runs/:id/stream
                    </div>
                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                      {activeRuns.length === 0 ? (
                        <div className="text-xs text-muted-foreground">
                          Sem runs ativas para exibir.
                        </div>
                      ) : (
                        activeRuns.map((r) => (
                          <Button
                            key={r.runId}
                            variant="outline"
                            className="justify-start rounded-xl font-mono"
                          >
                            {r.runId}
                          </Button>
                        ))
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Defensive UI</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl border border-white/10 p-3">
                    <div>
                      <div className="text-sm font-medium">PII mascarada</div>
                      <div className="text-xs text-muted-foreground">Oculta por padrão</div>
                    </div>
                    <Badge variant="secondary">ON</Badge>
                  </div>
                  <div className="rounded-xl border border-white/10 p-3">
                    <div className="text-sm font-medium">JIT Access (recomendado)</div>
                    <div className="text-xs text-muted-foreground">
                      Solicitar liberação temporária com log/auditoria
                    </div>
                    <Button className="mt-3 rounded-xl" variant="secondary" disabled>
                      Solicitar acesso
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="governance" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Intent Monitor</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {intentMonitor ? (
                    <>
                      <div className="rounded-xl border border-white/10 p-3">
                        <div className="text-xs text-muted-foreground">O que o agente entendeu</div>
                        <div className="mt-1 text-sm">
                          {intentMonitor.intent
                            ? `"${intentMonitor.intent}"`
                            : "Sem intenção registrada ainda."}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 p-3">
                        <div className="text-xs text-muted-foreground">O que foi executado</div>
                        <div className="mt-1 text-sm">
                          {intentMonitor.actions.length > 0
                            ? intentMonitor.actions.join(" → ")
                            : "Sem execuções registradas."}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Última execução: {intentMonitor.runId}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-white/10 p-3 text-sm text-muted-foreground">
                      Sem dados de intenção disponíveis ainda.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">AI-as-a-Judge</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {judgeMetrics && judgeMetrics.total > 0 ? (
                    <div className="grid h-full content-start gap-3 text-sm">
                      <div className="flex items-center justify-between rounded-xl border border-white/10 p-3">
                        <span>Total de avaliações</span>
                        <span className="font-semibold">{judgeMetrics.total}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-white/10 p-3">
                          <div className="text-xs text-muted-foreground">Flagged</div>
                          <div className="mt-1 text-base font-semibold">{judgeMetrics.flagged}</div>
                        </div>
                        <div className="rounded-xl border border-white/10 p-3">
                          <div className="text-xs text-muted-foreground">Clean</div>
                          <div className="mt-1 text-base font-semibold">{judgeMetrics.clean}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-white/10 p-3">
                        <span>Score médio</span>
                        <span className="font-semibold">
                          {judgeMetrics.avgScore ?? "—"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Última avaliação: {judgeMetrics.lastSeen ?? "—"}
                      </div>
                      {judgeMetrics.topFlags.length > 0 && (
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {judgeMetrics.topFlags.map((flag) => (
                            <span
                              key={flag.flag}
                              className="rounded-full border border-white/10 px-2 py-1"
                            >
                              {flag.flag} · {flag.count}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        Sem métricas de juiz disponíveis ainda.
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="ledger" className="mt-4">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">Ledger & Integridade (Guardrail ↔ SCL)</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1">
                      <IconKey />
                      Evidências
                    </Badge>
                    <Button variant="outline" className="rounded-xl gap-2">
                      <IconFilter />
                      Filtros
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-sm">
                    <thead className="bg-white/5">
                      <tr className="text-left">
                        <th className="px-4 py-3">Run</th>
                        <th className="px-4 py-3">Action</th>
                        <th className="px-4 py-3">Criticality</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Last seen</th>
                        <th className="px-4 py-3">Evidências</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIntegrity.length === 0 ? (
                        <tr className="border-t border-white/10">
                          <td className="px-4 py-4 text-sm text-muted-foreground" colSpan={6}>
                            Sem dados de integridade no momento.
                          </td>
                        </tr>
                      ) : (
                        filteredIntegrity.map((r) => (
                          <tr key={`${r.runId}_${r.actionId}`} className="border-t border-white/10">
                            <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{r.runId}</td>
                            <td className="px-4 py-3 max-w-[420px] truncate">{r.actionId}</td>
                            <td className="px-4 py-3">{criticalityBadge(r.criticality)}</td>
                            <td className="px-4 py-3">{statusBadge(r.status)}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {r.lastSeen}
                            </td>
                            <td className="px-4 py-3">
                              <div className="grid gap-1 min-w-[260px]">
                                <EvidenceRow label="intentHash" value={r.intentHash} sensitive />
                                <EvidenceRow label="payloadHash" value={r.payloadHash} sensitive />
                                {can("ledger.view", permissions) ? (
                                  <>
                                    <EvidenceRow
                                      label="policyHash"
                                      value={r.policyHash}
                                      sensitive
                                      reveal={revealEvidence}
                                    />
                                    <EvidenceRow
                                      label="signatureHash"
                                      value={r.signatureHash}
                                      sensitive
                                      reveal={revealEvidence}
                                    />
                                    <EvidenceRow
                                      label="txId"
                                      value={r.txId}
                                      sensitive
                                      reveal={revealEvidence}
                                    />
                                  </>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-col gap-2 text-xs text-muted-foreground">
                  <div>
                    • Hash mismatch → alerta crítico + investigação. Missing → reconciliação atrasada ou
                    falha de logging.
                  </div>
                  <div>
                    • Em produção, revelar evidências sensíveis deve usar JIT Access + audit log.
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="approvals" className="mt-4">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Approvals pendentes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {approvals.length === 0 ? (
                  <div className="rounded-xl border border-white/10 p-4 text-sm text-muted-foreground">
                    Sem approvals pendentes no workspace.
                  </div>
                ) : (
                  approvals.map((a) => (
                    <div
                      key={a.runId}
                      data-testid={`approval-item-${a.runId}`}
                      className="flex flex-col gap-2 rounded-xl border border-white/10 p-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{a.runId}</span>
                          <Badge variant={a.criticality === "critical" ? "destructive" : "default"}>
                            {a.criticality.toUpperCase()}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {a.requiredApprovals > 1
                              ? `Aprovacoes: ${a.requiredApprovals}`
                              : "Aprovacoes: 1"}
                          </span>
                        </div>
                        <div className="mt-1 text-sm">
                          {a.reason ? `Motivo: ${a.reason}` : "Motivo: —"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Solicitado por {a.requestedBy ?? "—"} • {a.createdAt ?? "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          className="rounded-xl"
                          data-testid={`approval-approve-${a.runId}`}
                          variant="secondary"
                          disabled={
                            !can("approvals.approve", permissions) ||
                            approvalActionLoading[a.runId] === "APPROVED"
                          }
                          onClick={() => handleApprovalDecision(a.runId, "APPROVED")}
                        >
                          {approvalActionLoading[a.runId] === "APPROVED" ? "Aprovando..." : "Aprovar"}
                        </Button>
                        <Button
                          className="rounded-xl"
                          data-testid={`approval-reject-${a.runId}`}
                          variant="outline"
                          disabled={
                            !can("approvals.approve", permissions) ||
                            approvalActionLoading[a.runId] === "REJECTED"
                          }
                          onClick={() => handleApprovalDecision(a.runId, "REJECTED")}
                        >
                          {approvalActionLoading[a.runId] === "REJECTED" ? "Rejeitando..." : "Rejeitar"}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
                <div className="text-xs text-muted-foreground">
                  (Integração) Pendencias seguem contrato estavel para PolicyEngine e UI.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="delegation" className="mt-4">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Delegação (policyHash/signatureHash)</CardTitle>
              </CardHeader>
              <CardContent>
                {delegations.length === 0 ? (
                  <div className="rounded-xl border border-white/10 p-4 text-sm text-muted-foreground">
                    Nenhuma delegação ativa no workspace.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {delegations.map((d) => (
                      <div
                        key={d.id}
                        className="rounded-xl border border-white/10 p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs">{d.id}</span>
                          <Badge variant="secondary">{d.scope}</Badge>
                          <Badge variant={d.status === "active" ? "default" : "outline"}>
                            {d.status ?? "—"}
                          </Badge>
                        </div>
                        <div className="mt-2 grid gap-1">
                          <EvidenceRow label="policyHash" value={d.policyHash} sensitive reveal={revealEvidence} />
                          <EvidenceRow
                            label="signatureHash"
                            value={d.signatureHash}
                            sensitive
                            reveal={revealEvidence}
                          />
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          trustMin: {d.trustMin} • validUntil: {d.validUntil}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ops" className="mt-4">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Ops (Prom/OTel/Grafana)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-xl border border-white/10 p-4">
                  <div className="text-sm font-medium">Link seguro para Grafana</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Exibir apenas para Admin Global (EIAH). Ideal: SSO + pasta por tenant.
                  </div>
                  <Button className="mt-3 rounded-xl" variant="secondary" disabled>
                    Abrir Grafana
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  (Fase 0) Painéis: scheduler/lock-skip, BullMQ lag, reconcile SLO, DLQ growth.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="report" className="mt-4">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Relatório (Admin Global)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-xl border border-white/10 p-4">
                  <div className="text-sm font-medium">Relatório do Admin Global (sem alterações no sistema)</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Observação: não existe tabela "Organization" no schema; usei Tenant como organização. "Agentes"
                    foram contados via runs.agent (tabela agent_profiles vazia).
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 p-4">
                  <div className="text-sm font-medium">Organizações / Tenants (resumo)</div>
                  <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
                    <table className="min-w-[980px] w-full text-xs text-muted-foreground">
                      <thead className="bg-white/5 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">id</th>
                          <th className="px-3 py-2 text-left font-medium">name</th>
                          <th className="px-3 py-2 text-left font-medium">created_at</th>
                          <th className="px-3 py-2 text-left font-medium">workspaces</th>
                          <th className="px-3 py-2 text-left font-medium">runs</th>
                          <th className="px-3 py-2 text-left font-medium">run_events</th>
                          <th className="px-3 py-2 text-left font-medium">agents_used</th>
                          <th className="px-3 py-2 text-left font-medium">users</th>
                          <th className="px-3 py-2 text-left font-medium">api_tokens</th>
                          <th className="px-3 py-2 text-left font-medium">delegations_out</th>
                          <th className="px-3 py-2 text-left font-medium">delegations_in</th>
                          <th className="px-3 py-2 text-left font-medium">marketplace_items</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        <tr>
                          <td className="px-3 py-2">tenant-demo</td>
                          <td className="px-3 py-2">Tenant Demo</td>
                          <td className="px-3 py-2">2026-01-19 17:41:21</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">37</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">9</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">1</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2">tenant-A</td>
                          <td className="px-3 py-2">Tenant A</td>
                          <td className="px-3 py-2">2026-01-19 18:31:50</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">4</td>
                          <td className="px-3 py-2">162</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">2</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">0</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2">tenant-B</td>
                          <td className="px-3 py-2">Tenant B</td>
                          <td className="px-3 py-2">2026-01-19 18:31:50</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">0</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2">tenant-C</td>
                          <td className="px-3 py-2">Tenant C</td>
                          <td className="px-3 py-2">2026-01-19 18:31:50</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">0</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2">tenant-D</td>
                          <td className="px-3 py-2">Tenant D</td>
                          <td className="px-3 py-2">2026-01-19 18:31:50</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">0</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2">tenant-E</td>
                          <td className="px-3 py-2">Tenant E</td>
                          <td className="px-3 py-2">2026-01-19 18:31:50</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">0</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2">tenant-F</td>
                          <td className="px-3 py-2">Tenant F</td>
                          <td className="px-3 py-2">2026-01-19 18:31:50</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">0</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2">jusall</td>
                          <td className="px-3 py-2">Jusall</td>
                          <td className="px-3 py-2">2026-01-19 20:05:30</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">66</td>
                          <td className="px-3 py-2">1995</td>
                          <td className="px-3 py-2">7</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">0</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2">tenant-a</td>
                          <td className="px-3 py-2">TENANT A</td>
                          <td className="px-3 py-2">2026-01-28 11:55:20</td>
                          <td className="px-3 py-2">2</td>
                          <td className="px-3 py-2">4</td>
                          <td className="px-3 py-2">114</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">0</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 p-4">
                  <div className="text-sm font-medium">Workspaces (detalhe por tenant)</div>
                  <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
                    <table className="min-w-[900px] w-full text-xs text-muted-foreground">
                      <thead className="bg-white/5 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">id</th>
                          <th className="px-3 py-2 text-left font-medium">name</th>
                          <th className="px-3 py-2 text-left font-medium">tenant_name</th>
                          <th className="px-3 py-2 text-left font-medium">agents</th>
                          <th className="px-3 py-2 text-left font-medium">runs</th>
                          <th className="px-3 py-2 text-left font-medium">run_events</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        <tr>
                          <td className="px-3 py-2">cmkllheha0000wwkmp7uhma76</td>
                          <td className="px-3 py-2">Default</td>
                          <td className="px-3 py-2">Jusall</td>
                          <td className="px-3 py-2">AADV, DeFi_1, EIAH, fin-nexus, I_BC, J_360, MKT</td>
                          <td className="px-3 py-2">66</td>
                          <td className="px-3 py-2">1995</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2">workspace-A</td>
                          <td className="px-3 py-2">Workspace A</td>
                          <td className="px-3 py-2">Tenant A</td>
                          <td className="px-3 py-2">MKT</td>
                          <td className="px-3 py-2">4</td>
                          <td className="px-3 py-2">162</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2">cmkxyxpz50004v4qfua49ygvh</td>
                          <td className="px-3 py-2">Default</td>
                          <td className="px-3 py-2">TENANT A</td>
                          <td className="px-3 py-2">guardian</td>
                          <td className="px-3 py-2">4</td>
                          <td className="px-3 py-2">114</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2">ws_d2e9331f917d</td>
                          <td className="px-3 py-2">Depto. Financeiro</td>
                          <td className="px-3 py-2">TENANT A</td>
                          <td className="px-3 py-2">—</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">0</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2">workspace-B</td>
                          <td className="px-3 py-2">Workspace B</td>
                          <td className="px-3 py-2">Tenant B</td>
                          <td className="px-3 py-2">—</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">0</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2">workspace-C</td>
                          <td className="px-3 py-2">Workspace C</td>
                          <td className="px-3 py-2">Tenant C</td>
                          <td className="px-3 py-2">—</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">0</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2">workspace-D</td>
                          <td className="px-3 py-2">Workspace D</td>
                          <td className="px-3 py-2">Tenant D</td>
                          <td className="px-3 py-2">—</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">0</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2">workspace-demo</td>
                          <td className="px-3 py-2">Workspace Demo</td>
                          <td className="px-3 py-2">Tenant Demo</td>
                          <td className="px-3 py-2">MKT</td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2">37</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2">workspace-E</td>
                          <td className="px-3 py-2">Workspace E</td>
                          <td className="px-3 py-2">Tenant E</td>
                          <td className="px-3 py-2">—</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">0</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2">workspace-F</td>
                          <td className="px-3 py-2">Workspace F</td>
                          <td className="px-3 py-2">Tenant F</td>
                          <td className="px-3 py-2">—</td>
                          <td className="px-3 py-2">0</td>
                          <td className="px-3 py-2">0</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 p-4">
                  <div className="text-sm font-medium">Agentes cadastrados (agent_profiles)</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Nenhum registro encontrado (tabela agent_profiles vazia).
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  Se quiser, posso gerar: relatório com runs por agente (top agents por tenant/workspace), relatório de
                  delegations detalhado (delegator → delegatee + status) e export CSV/JSON desses relatórios.
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="pt-4 text-xs text-muted-foreground">
          Nota: este layout é responsivo (mobile-first) e pronto para multi-tenant/personas. Para
          produção, substituir mocks por BFF + aplicar JIT Access para evidências sensíveis.
        </div>
      </div>
    </div>
  );
}
