import React from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  apiCreateWorkspace,
  apiCreateWorkspaceInvitation,
  apiAutoRenewDelegations,
  apiGetShadowExecution,
  apiGetTenantEconomyOpportunities,
  apiGetProfile,
  apiListShadowExecutions,
  apiListHelpdeskSessions,
  apiGetHelpdeskContractCoverage,
  apiDeleteSession,
  apiListDelegations,
  apiPreviewDelegationRenewal,
  apiRenewDelegation,
  apiSwitchWorkspaceSession,
  apiUpdateProfile,
  type DelegationRenewalPreview,
  type HelpdeskSessionExport,
  type HelpdeskContractCoverageResponse,
  type ShadowExecutionContract,
} from "@/lib/api";
import { clearSession, updateSession, useSession } from "@/state/sessionStore";
import { useAgents } from "@/hooks/useAgents";
import { countShadowExecutionsByStage } from "@/lib/economyDerived";
import { formatBRL } from "@/lib/formatters";
import type {
  EconomyOpportunitySnapshot,
  ExperienceDiagnosticSnapshot,
  FrictionEventSummary,
  OperationalInsightSnapshot,
  OptimizationRecommendationSnapshot,
} from "@/types";

type WorkspaceRoleOption = {
  key: string;
  label: string;
  defaultPermissions: string[];
};

type WorkspaceMember = {
  userId: string;
  email: string;
  fullName: string;
  roleKey: string;
  roleLabel: string;
  permissions: string[];
  status: string;
  isCurrentUser: boolean;
  createdAt: string;
};

type WorkspaceInvitation = {
  id: string;
  email: string;
  fullName: string;
  roleKey: string;
  roleLabel: string;
  permissions: string[];
  status: string;
  token: string;
  expiresAt: string;
  createdAt: string;
};

type DelegationView = {
  id: string;
  marketplaceId?: string | null;
  scope: string;
  trustMin: number;
  validUntil: string;
  publisherLabel: string;
  itemName: string;
};

type ProfileState = {
  fullName: string;
  email: string;
  phone: string;
  cep: string;
  role: string;
  website: string;
  city: string;
  country: string;
};

const DEFAULT_STATE: ProfileState = {
  fullName: "",
  email: "",
  phone: "",
  cep: "",
  role: "",
  website: "",
  city: "",
  country: "",
};

function normalizeWorkspaceRoleKey(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "funcao";
}

const IMOB_STAGE_OPTIONS = [
  { key: "new", label: "Novo" },
  { key: "collecting", label: "Coleta" },
  { key: "pending_data", label: "Dados pendentes" },
  { key: "ready_for_review", label: "Pronto para revisão" },
  { key: "qualified", label: "Qualificado" },
] as const;

function buildImobStagePermission(stageKey: string) {
  return `imob.stage.${stageKey}`;
}

function getTopEntry(record: Record<string, number>) {
  return Object.entries(record).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
}

function resolveDateRangeByWindow(window: "7d" | "30d") {
  const days = window === "7d" ? 7 : 30;
  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);
  return {
    dateFrom: toIsoDate(start),
    dateTo: toIsoDate(end),
  };
}

const WORKSPACE_PERMISSION_GROUPS = [
  {
    key: "imob_access",
    label: "Acesso ao IMOB",
    options: [
      { key: "imob.chat.use", label: "Usar IMOB" },
      { key: "imob.case.review", label: "Revisar casos" },
      { key: "imob.stage.*", label: "Todas as etapas do IMOB" },
    ],
  },
  {
    key: "workspace_management",
    label: "Gestão do workspace",
    options: [
      { key: "workspace.manage_members", label: "Convidar membros" },
      { key: "workspace.manage_roles", label: "Gerir funções" },
    ],
  },
] as const;

type CollapsiblePanelProps = {
  title: string;
  description: string;
  badge?: string | null;
  defaultOpen?: boolean;
  headerActions?: React.ReactNode;
  headerExtras?: React.ReactNode;
  children: React.ReactNode;
};

function CollapsiblePanel({
  title,
  description,
  badge,
  defaultOpen = false,
  headerActions,
  headerExtras,
  children,
}: CollapsiblePanelProps) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5">
      <div className="px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-4">
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="min-w-0 flex-1 text-left transition hover:text-foreground"
            aria-expanded={open}
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">{title}</p>
              {badge ? <span className="pill bg-white/10 text-foreground/80">{badge}</span> : null}
            </div>
            {description ? <p className="mt-2 text-xs text-muted-foreground">{description}</p> : null}
          </button>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
          </div>
        </div>
        {headerExtras ? <div className="mt-3">{headerExtras}</div> : null}
      </div>
      {open ? <div className="border-t border-white/10 px-4 py-4 sm:px-5">{children}</div> : null}
    </section>
  );
}

type ExpandableListProps = {
  initialCount?: number;
  itemCount: number;
  children: (expanded: boolean) => React.ReactNode;
};

function ExpandableList({ initialCount = 4, itemCount, children }: ExpandableListProps) {
  const [expanded, setExpanded] = React.useState(false);
  const needsToggle = itemCount > initialCount;

  return (
    <div className="space-y-3">
      {children(expanded)}
      {needsToggle ? (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-foreground transition hover:bg-white/10"
        >
          {expanded ? "Mostrar menos" : `Mostrar mais ${itemCount - initialCount}`}
        </button>
      ) : null}
    </div>
  );
}

function formatWorkspacePermissionLabel(permission: string) {
  const normalized = permission.trim();
  if (!normalized) return permission;
  if (normalized === "workspace.manage_members") return "Convidar membros";
  if (normalized === "workspace.manage_roles") return "Gerir funções";
  if (normalized === "imob.chat.use") return "Usar IMOB";
  if (normalized === "imob.case.review") return "Revisar casos";
  if (normalized === "imob.stage.*") return "Todas as etapas do IMOB";
  if (normalized.startsWith("imob.stage.")) {
    const stageKey = normalized.slice("imob.stage.".length);
    return IMOB_STAGE_OPTIONS.find((item) => item.key === stageKey)?.label ?? stageKey;
  }
  return normalized;
}


export default function ProfilePage() {
  type WorkspaceAdminView =
    | "include_workspace"
    | "edit_workspace"
    | "delete_workspace"
    | "linked_workspaces"
    | "roles_members"
    | "signed_agents";
  type SaveScope = "cadastro" | "workspace";
  const navigate = useNavigate();
  const [form, setForm] = React.useState<ProfileState>(DEFAULT_STATE);
  const [saveStatus, setSaveStatus] = React.useState<Record<SaveScope, "idle" | "saving" | "saved" | "error">>({
    cadastro: "idle",
    workspace: "idle",
  });
  const session = useSession();
  const [profileLoading, setProfileLoading] = React.useState(true);
  const [tenantName, setTenantName] = React.useState("—");
  const [workspaceName, setWorkspaceName] = React.useState("—");
  const [workspaceRoleKey, setWorkspaceRoleKey] = React.useState("");
  const [workspaceRoleOptions, setWorkspaceRoleOptions] = React.useState<WorkspaceRoleOption[]>([]);
  const [workspacePermissions, setWorkspacePermissions] = React.useState<string[]>([]);
  const [workspaceCanManageMembers, setWorkspaceCanManageMembers] = React.useState(false);
  const [workspaceMembers, setWorkspaceMembers] = React.useState<WorkspaceMember[]>([]);
  const [workspaceInvitations, setWorkspaceInvitations] = React.useState<WorkspaceInvitation[]>([]);
  const [newWorkspaceRoleLabel, setNewWorkspaceRoleLabel] = React.useState("");
  const [newWorkspaceRolePermissions, setNewWorkspaceRolePermissions] = React.useState<string[]>([]);
  const [inviteFullName, setInviteFullName] = React.useState("");
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRoleKey, setInviteRoleKey] = React.useState("");
  const [inviteStagePermissions, setInviteStagePermissions] = React.useState<string[]>([]);
  const [inviteState, setInviteState] = React.useState<"idle" | "creating" | "success" | "error">("idle");
  const [inviteMessage, setInviteMessage] = React.useState<string | null>(null);
  const [workspaceResponsibleLabel, setWorkspaceResponsibleLabel] = React.useState("Responsável não definido");
  const [linkedWorkspaces, setLinkedWorkspaces] = React.useState<
    Array<{ id: string; name: string; createdAt?: string; isCurrent: boolean }>
  >([]);
  const { items: agentItems, status: agentsStatus, error: agentsError } = useAgents();
  const signedAgents = React.useMemo(() => {
    const unique = new Set<string>();
    agentItems.forEach((agent) => {
      const label = (agent.name ?? agent.id ?? "").trim();
      if (label) unique.add(label);
    });
    return [...unique];
  }, [agentItems]);
  const signedAgentsLoading = agentsStatus === "idle" || agentsStatus === "loading";
  const signedAgentsError = agentsError;
  const [newWorkspaceName, setNewWorkspaceName] = React.useState("");
  const [workspaceCreateState, setWorkspaceCreateState] = React.useState<
    "idle" | "creating" | "success" | "error"
  >("idle");
  const [workspaceCreateMessage, setWorkspaceCreateMessage] = React.useState<string | null>(null);
  const [workspaceCreated, setWorkspaceCreated] = React.useState<{
    workspaceId: string;
    name: string;
  } | null>(null);
  const [isSwitchingWorkspace, setIsSwitchingWorkspace] = React.useState(false);
  const [workspaceSwitchMessage, setWorkspaceSwitchMessage] = React.useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [workspaceAdminView, setWorkspaceAdminView] = React.useState<WorkspaceAdminView>("linked_workspaces");
  const [showLinkedWorkspaceMenu, setShowLinkedWorkspaceMenu] = React.useState(false);
  const [workspaceOptionListExpanded, setWorkspaceOptionListExpanded] = React.useState(true);
  const [signingOut, setSigningOut] = React.useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = React.useState<Record<SaveScope, string | null>>({
    cadastro: null,
    workspace: null,
  });
  const [delegationsStatus, setDelegationsStatus] = React.useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [delegationsError, setDelegationsError] = React.useState<string | null>(null);
  const [activeDelegations, setActiveDelegations] = React.useState<DelegationView[]>([]);
  const [expiredDelegations, setExpiredDelegations] = React.useState<DelegationView[]>([]);
  const [delegationRenewalPreviews, setDelegationRenewalPreviews] = React.useState<
    Record<string, DelegationRenewalPreview>
  >({});
  const [delegationRenewalStatus, setDelegationRenewalStatus] = React.useState<
    Record<string, "idle" | "loading" | "ready" | "error">
  >({});
  const [delegationRenewalError, setDelegationRenewalError] = React.useState<Record<string, string>>({});
  const [delegationRenewalNotice, setDelegationRenewalNotice] = React.useState<string | null>(null);
  const [delegationBulkRenewalState, setDelegationBulkRenewalState] = React.useState<"idle" | "loading">("idle");
  const [helpdeskExport, setHelpdeskExport] = React.useState<HelpdeskSessionExport | null>(null);
  const [helpdeskContractCoverage, setHelpdeskContractCoverage] = React.useState<HelpdeskContractCoverageResponse | null>(null);
  const [helpdeskStatus, setHelpdeskStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [helpdeskError, setHelpdeskError] = React.useState<string | null>(null);
  const [diagnosticsWindow, setDiagnosticsWindow] = React.useState<"7d" | "30d">("7d");
  const [diagnosticSnapshot, setDiagnosticSnapshot] = React.useState<ExperienceDiagnosticSnapshot | null>(null);
  const [frictionSummary, setFrictionSummary] = React.useState<FrictionEventSummary | null>(null);
  const [optimizationSnapshot, setOptimizationSnapshot] = React.useState<OptimizationRecommendationSnapshot | null>(null);
  const [economyOpportunitySnapshot, setEconomyOpportunitySnapshot] = React.useState<EconomyOpportunitySnapshot | null>(null);
  const [operationalInsightSnapshot, setOperationalInsightSnapshot] = React.useState<OperationalInsightSnapshot | null>(null);
  const [shadowExecutions, setShadowExecutions] = React.useState<ShadowExecutionContract[]>([]);
  const [shadowExecutionsStatus, setShadowExecutionsStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [shadowExecutionsError, setShadowExecutionsError] = React.useState<string | null>(null);
  const [shadowCurrentStageFilter, setShadowCurrentStageFilter] = React.useState<ShadowExecutionContract["currentStage"] | "all">("all");
  const [shadowApprovalStatusFilter, setShadowApprovalStatusFilter] = React.useState<ShadowExecutionContract["approvalStatus"] | "all">("all");
  const [shadowAgentFilter, setShadowAgentFilter] = React.useState("");
  const [expandedShadowExecutionId, setExpandedShadowExecutionId] = React.useState<string | null>(null);
  const [shadowExecutionDetail, setShadowExecutionDetail] = React.useState<ShadowExecutionContract | null>(null);
  const [shadowExecutionDetailStatus, setShadowExecutionDetailStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [shadowExecutionDetailError, setShadowExecutionDetailError] = React.useState<string | null>(null);
  const linkedWorkspaceTooltip = linkedWorkspaces.length > 0
    ? linkedWorkspaces.map((workspace) => workspace.name).join(" • ")
    : "Nenhum workspace vinculado";

  const handleChange =
    (field: keyof ProfileState) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const applyProfileData = React.useCallback((data: NonNullable<Awaited<ReturnType<typeof apiGetProfile>>["data"]>) => {
    setForm({
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      cep: data.cep,
      role: data.role,
      website: data.website,
      city: data.city,
      country: data.country,
    });
    setTenantName(data.tenant.name);
    setWorkspaceName(data.workspace.name);
    setWorkspaceRoleKey(data.workspace.roleKey);
    setWorkspaceRoleOptions(data.workspace.roleOptions);
    setWorkspacePermissions(data.workspace.permissions);
    setWorkspaceCanManageMembers(data.workspace.canManageMembers);
    setWorkspaceMembers(data.workspace.members);
    setWorkspaceInvitations(data.workspace.invitations);
    setWorkspaceResponsibleLabel(data.workspace.responsibleLabel);
    setInviteRoleKey((prev) => prev || data.workspace.roleOptions[0]?.key || "");
    setLinkedWorkspaces(data.workspaces);
    setDiagnosticSnapshot(data.experienceDiagnostics.diagnosticSnapshot);
    setFrictionSummary(data.experienceDiagnostics.frictionSummary);
    setOptimizationSnapshot(data.experienceDiagnostics.optimizationSnapshot);
    setOperationalInsightSnapshot(data.experienceDiagnostics.operationalInsightSnapshot);
  }, []);

  const loadProfileBundle = React.useCallback(
    async (window: "7d" | "30d") => {
      const [profileResponse, economyResponse] = await Promise.all([
        apiGetProfile(window),
        apiGetTenantEconomyOpportunities().catch(() => null),
      ]);
      if (!profileResponse.ok || !profileResponse.data) return null;
      applyProfileData(profileResponse.data);
      setEconomyOpportunitySnapshot(
        economyResponse?.ok && economyResponse.data
          ? economyResponse.data
          : profileResponse.data.experienceDiagnostics.economyOpportunitySnapshot
      );
      return profileResponse.data;
    },
    [applyProfileData]
  );

  const saveProfileSection = async (scope: SaveScope) => {
    setSaveErrorMessage((prev) => ({ ...prev, [scope]: null }));
    setSaveStatus((prev) => ({ ...prev, [scope]: "saving" }));
    try {
      const response = await apiUpdateProfile({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        cep: form.cep,
        role: form.role,
        website: form.website,
        city: form.city,
        country: form.country,
        tenantName,
        workspaceName,
        workspaceRoleOptions: workspaceRoleOptions.map((item) => ({ label: item.label, permissions: item.defaultPermissions })),
      });
      if (!response.ok || !response.data) {
        setSaveStatus((prev) => ({ ...prev, [scope]: "error" }));
        return;
      }
      applyProfileData(response.data);
      setSaveStatus((prev) => ({ ...prev, [scope]: "saved" }));
      setTimeout(() => {
        setSaveStatus((prev) => ({ ...prev, [scope]: "idle" }));
      }, 2500);
    } catch {
      setSaveStatus((prev) => ({ ...prev, [scope]: "error" }));
      setSaveErrorMessage((prev) => ({
        ...prev,
        [scope]: "Falha ao salvar perfil no backend. Tente novamente.",
      }));
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void saveProfileSection("cadastro");
  };

  const handleAddWorkspaceRole = async () => {
    const trimmed = newWorkspaceRoleLabel.trim();
    if (!trimmed) return;
    const label = trimmed
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
      .join(" ");
    const key = normalizeWorkspaceRoleKey(label);
    const nextRole = { key, label, defaultPermissions: newWorkspaceRolePermissions };
    const nextOptions = workspaceRoleOptions.some((item) => item.key === key)
      ? workspaceRoleOptions.map((item) => item.key === key ? nextRole : item)
      : [...workspaceRoleOptions, nextRole];
    setWorkspaceRoleOptions(nextOptions);
    setInviteRoleKey((prev) => prev || key);
    setNewWorkspaceRoleLabel("");
    setNewWorkspaceRolePermissions([]);
    try {
      const response = await apiUpdateProfile({
        workspaceRoleOptions: nextOptions.map((item) => ({ label: item.label, permissions: item.defaultPermissions })),
      });
      if (response.ok && response.data) {
        applyProfileData(response.data);
      }
    } catch {
      setSaveErrorMessage((prev) => ({ ...prev, workspace: "Falha ao salvar a nova função do workspace." }));
      setSaveStatus((prev) => ({ ...prev, workspace: "error" }));
    }
  };

  const handleInviteWorkspaceMember = async () => {
    const email = inviteEmail.trim().toLowerCase();
    const roleKey = inviteRoleKey.trim();
    if (!email || !roleKey) {
      setInviteState("error");
      setInviteMessage("Informe email e função para criar o convite.");
      return;
    }
    if (roleKey === "assistente" && inviteStagePermissions.length === 0) {
      setInviteState("error");
      setInviteMessage("Selecione ao menos uma etapa do IMOB para o assistente.");
      return;
    }

    setInviteState("creating");
    setInviteMessage(null);
    const selectedRole = workspaceRoleOptions.find((item) => item.key === roleKey);
    const permissions = roleKey === "assistente"
      ? inviteStagePermissions.map((stageKey) => buildImobStagePermission(stageKey))
      : selectedRole?.defaultPermissions;
    try {
      const response = await apiCreateWorkspaceInvitation({
        email,
        fullName: inviteFullName.trim() || undefined,
        roleKey,
        permissions,
      });
      if (!response.ok || !response.data) {
        setInviteState("error");
        setInviteMessage("Falha ao criar convite para o workspace.");
        return;
      }
      const data = response.data;
      const inviteUrl = typeof window !== "undefined"
        ? `${window.location.origin}/access?invite=${encodeURIComponent(data.token)}`
        : data.token;
      setWorkspaceInvitations((prev) => [
        {
          id: data.id,
          email: data.email,
          fullName: data.fullName,
          roleKey: data.roleKey,
          roleLabel: data.roleLabel,
          permissions: data.permissions,
          status: data.status,
          token: data.token,
          expiresAt: data.expiresAt,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setInviteState("success");
      setInviteMessage(`Convite criado: ${inviteUrl}`);
      setInviteFullName("");
      setInviteEmail("");
      setInviteStagePermissions([]);
    } catch (error) {
      setInviteState("error");
      setInviteMessage(error instanceof Error ? error.message : "Falha ao criar convite para o workspace.");
    }
  };

  const handleCreateWorkspace = async (event?: React.SyntheticEvent) => {
    event?.preventDefault();
    const name = newWorkspaceName.trim();
    if (!name) {
      setWorkspaceCreateState("error");
      setWorkspaceCreateMessage("Informe um nome para o novo workspace.");
      return;
    }

    setWorkspaceCreateState("creating");
    setWorkspaceCreateMessage(null);
    try {
      const response = await apiCreateWorkspace({ name });
      if (!response.ok || !response.data) {
        setWorkspaceCreateState("error");
        setWorkspaceCreateMessage("Falha ao criar workspace. Tente novamente.");
        return;
      }
      setWorkspaceCreated({ workspaceId: response.data.workspaceId, name: response.data.name });
      setWorkspaceCreateState("success");
      setWorkspaceCreateMessage(
        `Workspace criado com sucesso. Hash: ${response.data.workspaceId}.`
      );
      setNewWorkspaceName("");
      await loadProfileBundle(diagnosticsWindow);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao criar workspace. Tente novamente.";
      setWorkspaceCreateState("error");
      setWorkspaceCreateMessage(message);
    }
  };

  const handleSelectWorkspace = async (workspace: {
    id: string;
    name: string;
    createdAt?: string;
    isCurrent: boolean;
  }) => {
    if (workspace.isCurrent || isSwitchingWorkspace) return;
    setWorkspaceSwitchMessage(null);
    setIsSwitchingWorkspace(true);
    try {
      // Reflect selection immediately in the profile field.
      setWorkspaceName(workspace.name);
      setLinkedWorkspaces((prev) =>
        prev.map((item) => ({ ...item, isCurrent: item.id === workspace.id }))
      );

      const switched = await apiSwitchWorkspaceSession(workspace.id);
      if (!switched.ok || !switched.data?.token) {
        throw new Error(switched.error?.message ?? "Falha ao trocar workspace.");
      }

      updateSession({
        tenantId: switched.data.tenantId,
        workspaceId: switched.data.workspaceId,
        userId: switched.data.userId ?? session.userId,
        token: switched.data.token,
      });

      const refreshed = await loadProfileBundle(diagnosticsWindow);
      if (refreshed) {
        const selectedFromResponse = refreshed.workspaces.find((item) => item.id === workspace.id);
        setWorkspaceName(selectedFromResponse?.name ?? workspace.name);
      }

      setWorkspaceSwitchMessage({ type: "success", text: `Workspace ativo: ${workspace.name}` });
      setTimeout(() => setWorkspaceSwitchMessage(null), 2500);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao trocar workspace. Tente novamente.";
      setWorkspaceSwitchMessage({ type: "error", text: message });
    } finally {
      setIsSwitchingWorkspace(false);
    }
  };

  React.useEffect(() => {
    if (!session.token) {
      setProfileLoading(false);
      return;
    }
    let active = true;
    setProfileLoading(true);
    loadProfileBundle(diagnosticsWindow)
      .then((response) => {
        if (!active || !response) return;
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setProfileLoading(false);
      });
    return () => {
      active = false;
    };
  }, [diagnosticsWindow, loadProfileBundle, session.token]);


  React.useEffect(() => {
    if (!session.token) {
      setDelegationsStatus("ready");
      setDelegationsError(null);
      setActiveDelegations([]);
      setExpiredDelegations([]);
      return;
    }
    let mounted = true;
    setDelegationsStatus("loading");
    setDelegationsError(null);

    apiListDelegations({ role: "delegatee", workspaceScoped: true })
      .then((delegationResponse) => {
        if (!mounted) return;
        const toView = (delegation: {
          id: string;
          marketplaceId?: string | null;
          marketplaceName?: string | null;
          scope: string;
          trustMin: number;
          validUntil: string;
          delegatorId: string;
          publisherId?: string | null;
          publisherName?: string | null;
        }) => {
          return {
            id: delegation.id,
            marketplaceId: delegation.marketplaceId,
            scope: delegation.scope,
            trustMin: delegation.trustMin,
            validUntil: delegation.validUntil,
            publisherLabel: delegation.publisherName ?? delegation.publisherId ?? delegation.delegatorId,
            itemName: delegation.marketplaceName ?? delegation.marketplaceId ?? "Item desconhecido",
          };
        };

        const isActive = (validUntil?: string) => {
          if (!validUntil) return false;
          const timestamp = new Date(validUntil).getTime();
          return Number.isFinite(timestamp) && timestamp > Date.now();
        };

        const all = (delegationResponse.items ?? []).map(toView);
        setActiveDelegations(all.filter((item) => isActive(item.validUntil)));
        setExpiredDelegations(all.filter((item) => !isActive(item.validUntil)));
        setDelegationsStatus("ready");
      })
      .catch((error) => {
        if (!mounted) return;
        setDelegationsStatus("error");
        setDelegationsError(
          error instanceof Error ? error.message : "Falha ao carregar delegacoes do workspace."
        );
        setActiveDelegations([]);
        setExpiredDelegations([]);
      });

    return () => {
      mounted = false;
    };
  }, [session.token, session.workspaceId, session.tenantId]);

  React.useEffect(() => {
    if (!session.token || !session.workspaceId) {
      setHelpdeskExport(null);
      setHelpdeskContractCoverage(null);
      setHelpdeskStatus("ready");
      setHelpdeskError(null);
      return;
    }

    let mounted = true;
    setHelpdeskStatus("loading");
    setHelpdeskError(null);

    const { dateFrom, dateTo } = resolveDateRangeByWindow(diagnosticsWindow);

    Promise.all([
      apiListHelpdeskSessions({ workspaceId: session.workspaceId, limit: 200 }),
      apiGetHelpdeskContractCoverage({
        workspaceId: session.workspaceId,
        dateFrom,
        dateTo,
        granularity: diagnosticsWindow === "7d" ? "day" : "week",
        routeIntent: "help",
        agentId: "EIAH",
        includeUnknownSource: true,
      }),
    ])
      .then(([sessionsResponse, coverageResponse]) => {
        if (!mounted) return;
        setHelpdeskExport(sessionsResponse.data);
        setHelpdeskContractCoverage(coverageResponse.data);
        setHelpdeskStatus("ready");
      })
      .catch((error) => {
        if (!mounted) return;
        setHelpdeskStatus("error");
        setHelpdeskError(
          error instanceof Error ? error.message : "Falha ao carregar histórico UX do Chat Launcher."
        );
        setHelpdeskExport(null);
        setHelpdeskContractCoverage(null);
      });

    return () => {
      mounted = false;
    };
  }, [session.token, session.workspaceId, diagnosticsWindow]);

  const handleInspectShadowExecution = React.useCallback(async (shadowExecutionId: string) => {
    if (expandedShadowExecutionId === shadowExecutionId) {
      setExpandedShadowExecutionId(null);
      setShadowExecutionDetail(null);
      setShadowExecutionDetailStatus("idle");
      setShadowExecutionDetailError(null);
      return;
    }

    setExpandedShadowExecutionId(shadowExecutionId);
    setShadowExecutionDetail(null);
    setShadowExecutionDetailStatus("loading");
    setShadowExecutionDetailError(null);
    try {
      const response = await apiGetShadowExecution(shadowExecutionId);
      setShadowExecutionDetail(response.data);
      setShadowExecutionDetailStatus("ready");
    } catch (error) {
      setShadowExecutionDetail(null);
      setShadowExecutionDetailStatus("error");
      setShadowExecutionDetailError(
        error instanceof Error ? error.message : "Falha ao carregar snapshot completo."
      );
    }
  }, [expandedShadowExecutionId]);

  const handlePreviewDelegationRenewal = React.useCallback(async (delegationId: string) => {
    setDelegationRenewalNotice(null);
    setDelegationRenewalStatus((prev) => ({ ...prev, [delegationId]: "loading" }));
    setDelegationRenewalError((prev) => ({ ...prev, [delegationId]: "" }));
    try {
      const response = await apiPreviewDelegationRenewal(delegationId);
      setDelegationRenewalPreviews((prev) => ({ ...prev, [delegationId]: response.preview }));
      setDelegationRenewalStatus((prev) => ({ ...prev, [delegationId]: "ready" }));
    } catch (error) {
      setDelegationRenewalStatus((prev) => ({ ...prev, [delegationId]: "error" }));
      setDelegationRenewalError((prev) => ({
        ...prev,
        [delegationId]: error instanceof Error ? error.message : "Falha ao carregar preview de renewal.",
      }));
    }
  }, []);

  const handleApplyDelegationRenewal = React.useCallback(async (delegation: DelegationView) => {
    setDelegationRenewalNotice(null);
    setDelegationRenewalStatus((prev) => ({ ...prev, [delegation.id]: "loading" }));
    setDelegationRenewalError((prev) => ({ ...prev, [delegation.id]: "" }));
    try {
      await apiRenewDelegation(delegation.id);
      setDelegationRenewalNotice(`Renewal aplicada para ${delegation.itemName}.`);
      await Promise.allSettled([handlePreviewDelegationRenewal(delegation.id)]);
      if (session.token) {
        const delegationResponse = await apiListDelegations({ role: "delegatee", workspaceScoped: true });
        const isActive = (value?: string | null) => {
          if (!value) return false;
          const timestamp = new Date(value).getTime();
          return Number.isFinite(timestamp) && timestamp > Date.now();
        };
        const toView = (item: {
          id: string;
          marketplaceId?: string | null;
          scope: string;
          trustMin: number;
          validUntil: string;
          publisherName?: string | null;
          publisherId?: string | null;
          delegatorId: string;
          marketplaceName?: string | null;
        }): DelegationView => ({
          id: item.id,
          marketplaceId: item.marketplaceId,
          scope: item.scope,
          trustMin: item.trustMin,
          validUntil: item.validUntil,
          publisherLabel: item.publisherName ?? item.publisherId ?? item.delegatorId,
          itemName: item.marketplaceName ?? item.marketplaceId ?? "Item desconhecido",
        });
        const all = (delegationResponse.items ?? []).map(toView);
        setActiveDelegations(all.filter((item) => isActive(item.validUntil)));
        setExpiredDelegations(all.filter((item) => !isActive(item.validUntil)));
      }
      setDelegationRenewalStatus((prev) => ({ ...prev, [delegation.id]: "ready" }));
    } catch (error) {
      setDelegationRenewalStatus((prev) => ({ ...prev, [delegation.id]: "error" }));
      setDelegationRenewalError((prev) => ({
        ...prev,
        [delegation.id]: error instanceof Error ? error.message : "Falha ao aplicar renewal.",
      }));
    }
  }, [handlePreviewDelegationRenewal, session.token]);

  const handleAutoRenewDelegations = React.useCallback(async () => {
    setDelegationBulkRenewalState("loading");
    setDelegationRenewalNotice(null);
    try {
      const response = await apiAutoRenewDelegations();
      const renewed = response.data.renewed;
      setDelegationRenewalNotice(
        renewed > 0
          ? `${renewed} delegação(ões) renovada(s) automaticamente pela policy.`
          : "Nenhuma delegação elegível para renewal automática nesta janela."
      );
      if (session.token) {
        const delegationResponse = await apiListDelegations({ role: "delegatee", workspaceScoped: true });
        const isActive = (value?: string | null) => {
          if (!value) return false;
          const timestamp = new Date(value).getTime();
          return Number.isFinite(timestamp) && timestamp > Date.now();
        };
        const toView = (item: {
          id: string;
          marketplaceId?: string | null;
          scope: string;
          trustMin: number;
          validUntil: string;
          publisherName?: string | null;
          publisherId?: string | null;
          delegatorId: string;
          marketplaceName?: string | null;
        }): DelegationView => ({
          id: item.id,
          marketplaceId: item.marketplaceId,
          scope: item.scope,
          trustMin: item.trustMin,
          validUntil: item.validUntil,
          publisherLabel: item.publisherName ?? item.publisherId ?? item.delegatorId,
          itemName: item.marketplaceName ?? item.marketplaceId ?? "Item desconhecido",
        });
        const all = (delegationResponse.items ?? []).map(toView);
        setActiveDelegations(all.filter((item) => isActive(item.validUntil)));
        setExpiredDelegations(all.filter((item) => !isActive(item.validUntil)));
      }
    } catch (error) {
      setDelegationRenewalNotice(
        error instanceof Error ? error.message : "Falha ao executar renewal automática."
      );
    } finally {
      setDelegationBulkRenewalState("idle");
    }
  }, [session.token]);

  React.useEffect(() => {
    if (!session.token || !session.workspaceId) {
      setShadowExecutions([]);
      setShadowExecutionsStatus("ready");
      setShadowExecutionsError(null);
      return;
    }

    let mounted = true;
    setShadowExecutionsStatus("loading");
    setShadowExecutionsError(null);

    apiListShadowExecutions({
      workspaceId: session.workspaceId,
      limit: 5,
      currentStage: shadowCurrentStageFilter === "all" ? undefined : shadowCurrentStageFilter,
      approvalStatus: shadowApprovalStatusFilter === "all" ? undefined : shadowApprovalStatusFilter,
      agentId: shadowAgentFilter.trim() || undefined,
    })
      .then((response) => {
        if (!mounted) return;
        setShadowExecutions(response.data.items ?? []);
        setShadowExecutionsStatus("ready");
      })
      .catch((error) => {
        if (!mounted) return;
        setShadowExecutions([]);
        setShadowExecutionsStatus("error");
        setShadowExecutionsError(
          error instanceof Error ? error.message : "Falha ao carregar shadow executions persistidas."
        );
      });

    return () => {
      mounted = false;
    };
  }, [session.token, session.workspaceId, shadowAgentFilter, shadowApprovalStatusFilter, shadowCurrentStageFilter]);

  const shadowExecutionsByStage = React.useMemo(
    () => countShadowExecutionsByStage(shadowExecutions),
    [shadowExecutions]
  );

  const formatDate = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("pt-BR");
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("pt-BR");
  };

  const selectedWorkspaceRoleLabel = workspaceRoleOptions.find((item) => item.key === workspaceRoleKey)?.label ?? "";
  const workspaceResponsiblePreview = selectedWorkspaceRoleLabel
    ? `${form.fullName || form.email || "Usuário"} (${selectedWorkspaceRoleLabel})`
    : workspaceResponsibleLabel || form.fullName || form.email || "Usuário";

  const handleDownloadHelpdeskJson = () => {
    if (!helpdeskExport || typeof window === "undefined") return;
    const payload = {
      ...helpdeskExport,
      contractCoverage: helpdeskContractCoverage,
      experienceDiagnostics: diagnosticSnapshot
        ? {
            window: diagnosticsWindow,
            diagnosticSnapshot,
            optimizationSnapshot,
            economyOpportunitySnapshot,
            operationalInsightSnapshot,
          }
        : null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chat-launcher-ux-${helpdeskExport.workspaceId}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadHelpdeskCsv = () => {
    if (!helpdeskExport || !helpdeskContractCoverage || typeof window === "undefined") return;

    const escapeCsv = (value: string | number | null | undefined) => {
      const text = value == null ? "" : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };

    const summary = helpdeskContractCoverage.summary;
    const lines = [
      [
        "scope",
        "dateFrom",
        "dateTo",
        "granularity",
        "workspaceId",
        "workspaceName",
        "totalSessions",
        "contractSessions",
        "fallbackSessions",
        "unknownSourceSessions",
        "contractCoveragePct",
        "fallbackRatePct",
        "netContractCoveragePct",
      ].join(","),
      [
        "summary",
        helpdeskContractCoverage.window.dateFrom,
        helpdeskContractCoverage.window.dateTo,
        helpdeskContractCoverage.window.granularity,
        helpdeskContractCoverage.filters.workspaceId ?? helpdeskExport.workspaceId,
        "",
        summary.totalSessions,
        summary.contractSessions,
        summary.fallbackSessions,
        summary.unknownSourceSessions,
        summary.contractCoveragePct,
        summary.fallbackRatePct,
        summary.netContractCoveragePct,
      ]
        .map(escapeCsv)
        .join(","),
      ...helpdeskContractCoverage.byWorkspace.map((row) =>
        [
          "workspace",
          helpdeskContractCoverage.window.dateFrom,
          helpdeskContractCoverage.window.dateTo,
          helpdeskContractCoverage.window.granularity,
          row.workspaceId,
          row.workspaceName ?? "",
          row.totalSessions,
          row.contractSessions,
          row.fallbackSessions,
          row.unknownSourceSessions,
          row.contractCoveragePct,
          row.fallbackRatePct,
          row.netContractCoveragePct,
        ]
          .map(escapeCsv)
          .join(",")
      ),
      ...helpdeskContractCoverage.timeseries.map((row) =>
        [
          "timeseries",
          row.bucketStart,
          row.bucketStart,
          helpdeskContractCoverage.window.granularity,
          helpdeskContractCoverage.filters.workspaceId ?? helpdeskExport.workspaceId,
          "",
          row.totalSessions,
          row.contractSessions,
          row.fallbackSessions,
          row.unknownSourceSessions,
          row.contractCoveragePct,
          row.fallbackRatePct,
          row.netContractCoveragePct,
        ]
          .map(escapeCsv)
          .join(",")
      ),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chat-launcher-ux-${helpdeskExport.workspaceId}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handlePrintHelpdeskReport = () => {
    if (!helpdeskExport || typeof window === "undefined") return;
    const popup = window.open("", "_blank", "width=960,height=720");
    if (!popup) return;
    const alignmentSummaryBlock = diagnosticSnapshot
      ? `
          <h2>Diagnóstico do Experience Resolver</h2>
          <p>${diagnosticSnapshot.alignment.summary.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
        `
      : "";
    const contractCoverageBlock = helpdeskContractCoverage
      ? `
          <h2>Cobertura contratual do tutor</h2>
          <p><strong>Período:</strong> ${helpdeskContractCoverage.window.dateFrom} até ${helpdeskContractCoverage.window.dateTo}</p>
          <p><strong>Cobertura contratual:</strong> ${helpdeskContractCoverage.summary.contractCoveragePct}%</p>
          <p><strong>Taxa de fallback:</strong> ${helpdeskContractCoverage.summary.fallbackRatePct}%</p>
          <p><strong>Cobertura líquida:</strong> ${helpdeskContractCoverage.summary.netContractCoveragePct}%</p>
        `
      : "";
    popup.document.write(`
      <html>
        <head>
          <title>Relatório UX Chat Launcher</title>
          <style>
            body { font-family: sans-serif; padding: 24px; line-height: 1.5; white-space: pre-wrap; }
            h1 { margin: 0 0 16px; }
            pre { white-space: pre-wrap; font-family: inherit; }
          </style>
        </head>
        <body>
          <h1>Relatório UX do Chat Launcher</h1>
          ${alignmentSummaryBlock}
          ${contractCoverageBlock}
          <pre>${helpdeskExport.reportText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await apiDeleteSession().catch(() => undefined);
    } finally {
      clearSession();
      navigate("/access", { replace: true });
      setSigningOut(false);
    }
  };

  return (
    <div className="space-y-8">
      <form
        className="rounded-3xl border border-white/10 bg-surface/70 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.35)]"
        onSubmit={handleSubmit}
      >
        <div className="space-y-4 rounded-3xl border border-white/10 bg-black/10 p-4 sm:p-5">
          <div id="profile-personal" className="scroll-mt-24">
            <CollapsiblePanel
              title="Cadastro"
              description=""
              headerActions={
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground transition hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {signingOut ? "Saindo..." : "Sair"}
                </button>
              }
              defaultOpen
            >
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                    Dados pessoais
                  </h2>
                  <label className="block text-sm text-muted-foreground">
                    Nome completo
                    <input
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                      placeholder="Seu nome completo"
                      value={form.fullName}
                      onChange={handleChange("fullName")}
                    />
                  </label>
                  <label className="block text-sm text-muted-foreground">
                    Email
                    <input
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                      placeholder="voce@empresa.com"
                      type="email"
                      value={form.email}
                      onChange={handleChange("email")}
                    />
                  </label>
                  <label className="block text-sm text-muted-foreground">
                    Telefone
                    <input
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                      placeholder="+55 11 99999-9999"
                      value={form.phone}
                      onChange={handleChange("phone")}
                    />
                  </label>
                  <label className="block text-sm text-muted-foreground">
                    CEP
                    <input
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                      placeholder="00000-000"
                      value={form.cep}
                      onChange={handleChange("cep")}
                    />
                  </label>
                  <label className="block text-sm text-muted-foreground">
                    Cidade
                    <input
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                      placeholder="Cidade"
                      value={form.city}
                      onChange={handleChange("city")}
                    />
                  </label>
                </div>

                <div className="space-y-4">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                    Organização
                  </h2>
                  <label className="block text-sm text-muted-foreground">
                    Empresa (nome da organização)
                    <input
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                      placeholder="Nome da organização"
                      value={tenantName}
                      onChange={(event) => setTenantName(event.target.value)}
                    />
                  </label>
                  <label className="block text-sm text-muted-foreground">
                    Workspace
                    <input
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                      placeholder="Workspace"
                      value={workspaceName}
                      onChange={(event) => setWorkspaceName(event.target.value)}
                    />
                  </label>
                  <label className="block text-sm text-muted-foreground">
                    Cargo geral
                    <input
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                      placeholder="Seu cargo geral"
                      value={form.role}
                      onChange={handleChange("role")}
                    />
                  </label>
                  <label className="block text-sm text-muted-foreground">
                    Website
                    <input
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                      placeholder="https://empresa.com"
                      value={form.website}
                      onChange={handleChange("website")}
                    />
                  </label>
                  <label className="block text-sm text-muted-foreground">
                    Pais
                    <input
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                      placeholder="Pais"
                      value={form.country}
                      onChange={handleChange("country")}
                    />
                  </label>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <button
                  type="submit"
                  className="rounded-full border border-white/10 bg-accent/20 px-6 py-2 text-sm font-semibold text-foreground transition hover:bg-accent/30 disabled:opacity-60"
                  disabled={saveStatus.cadastro === "saving"}
                >
                  {saveStatus.cadastro === "saving" ? "Salvando..." : "Salvar"}
                </button>
                {saveStatus.cadastro === "saved" ? (
                  <span className="text-sm text-emerald-300">Cadastro atualizado.</span>
                ) : null}
                {saveStatus.cadastro === "error" ? (
                  <span className="text-sm text-red-300">
                    {saveErrorMessage.cadastro ?? "Falha ao salvar. Tente novamente."}
                  </span>
                ) : null}
                {profileLoading ? (
                  <span className="text-sm text-muted-foreground">Carregando perfil...</span>
                ) : null}
              </div>
            </CollapsiblePanel>
          </div>

          <div id="profile-workspace-admin" className="scroll-mt-24">
            <CollapsiblePanel
              title="Workspace"
              description=""
            >
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  {[
                    {
                      key: "include_workspace" as const,
                      label: "Incluir",
                      badge: workspaceCreated ? "novo" : null,
                      title: "Criar um novo workspace neste tenant",
                    },
                    {
                      key: "edit_workspace" as const,
                      label: "Editar",
                      badge: null,
                      title: "Editar o nome do workspace atual",
                    },
                    {
                      key: "delete_workspace" as const,
                      label: "Excluir",
                      badge: null,
                      title: "Excluir workspace",
                    },
                    {
                      key: "linked_workspaces" as const,
                      label: "Vinculados",
                      badge: `${linkedWorkspaces.length}`,
                      title: linkedWorkspaceTooltip,
                    },
                    {
                      key: "roles_members" as const,
                      label: "Membros",
                      badge: null,
                      title: "Funções, permissões, convites e membros do workspace",
                    },
                    {
                      key: "signed_agents" as const,
                      label: "Agentes assinados",
                      badge: `${signedAgents.length}`,
                      title: signedAgents.length > 0 ? signedAgents.join(" • ") : "Nenhuma assinatura ativa encontrada",
                    },
                  ]
                    .filter((item) => workspaceOptionListExpanded || workspaceAdminView === item.key)
                    .map((item) => {
                      const active = workspaceAdminView === item.key;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            if (active && !workspaceOptionListExpanded) {
                              setWorkspaceOptionListExpanded(true);
                              if (item.key === "linked_workspaces") {
                                setShowLinkedWorkspaceMenu(false);
                              }
                              return;
                            }

                            setWorkspaceAdminView(item.key);
                            setWorkspaceOptionListExpanded(false);
                            if (item.key === "linked_workspaces") {
                              setShowLinkedWorkspaceMenu(true);
                            } else {
                              setShowLinkedWorkspaceMenu(false);
                            }
                          }}
                          title={item.title}
                          className={`rounded-xl border px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.22em] transition ${
                            active
                              ? "border-accent/40 bg-accent/15 text-foreground"
                              : "border-white/10 bg-black/20 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {item.label}
                          {item.badge ? ` · ${item.badge}` : ""}
                        </button>
                      );
                    })}
                </div>
                {workspaceAdminView === "linked_workspaces" && showLinkedWorkspaceMenu && linkedWorkspaces.length > 0 ? (
                  <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/20 p-3">
                    {linkedWorkspaces.map((workspace) => (
                      <button
                        key={`workspace-submenu-${workspace.id}`}
                        type="button"
                        onClick={() => handleSelectWorkspace(workspace)}
                        disabled={isSwitchingWorkspace}
                        title={workspace.name}
                        className={`rounded-xl border px-3 py-2 text-left text-[11px] font-medium transition ${
                          workspace.isCurrent
                            ? "border-accent/40 bg-accent/15 text-accent"
                            : "border-white/10 bg-white/5 text-foreground hover:border-accent/30"
                        }`}
                      >
                        {workspace.name}
                      </button>
                    ))}
                  </div>
                ) : null}
                {workspaceAdminView === "linked_workspaces" ? (
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4 text-xs text-muted-foreground">
                    {linkedWorkspaces.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhum workspace vinculado encontrado.</p>
                    ) : null}
                    {workspaceSwitchMessage ? (
                      <p
                        className={`${linkedWorkspaces.length === 0 ? "mt-3 " : ""}text-xs ${
                          workspaceSwitchMessage.type === "success" ? "text-emerald-300" : "text-rose-300"
                        }`}
                      >
                        {workspaceSwitchMessage.text}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {workspaceAdminView === "roles_members" ? (
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4 text-sm text-muted-foreground">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">
                Função no workspace
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                O IMOB usa a membership oficial do workspace para identificar quem é o responsável real no chat e no dashboard.
              </p>
              <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Sua membership atual</p>
                <p className="mt-2 text-sm text-foreground">{selectedWorkspaceRoleLabel || "Sem função atribuída"}</p>
                <p className="mt-1 text-xs text-foreground/90">Responsável exibido no IMOB: {workspaceResponsiblePreview}</p>
                {workspacePermissions.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-foreground/80">
                    {workspacePermissions.map((permission) => (
                      <span key={permission} className="pill bg-white/10 text-foreground/80">
                        {formatWorkspacePermissionLabel(permission)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              {workspaceRoleOptions.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-foreground/85">
                  {workspaceRoleOptions.map((option) => (
                    <span
                      key={option.key}
                      className={`pill ${workspaceRoleKey === option.key ? "bg-accent/20 text-accent" : "bg-white/10 text-foreground"}`}
                      title={option.defaultPermissions.map((permission) => formatWorkspacePermissionLabel(permission)).join(" • ")}
                    >
                      {option.label}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                  placeholder="Adicionar função, ex.: Captador"
                  value={newWorkspaceRoleLabel}
                  onChange={(event) => setNewWorkspaceRoleLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleAddWorkspaceRole();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => void handleAddWorkspaceRole()}
                  className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/40 hover:text-accent"
                >
                  Adicionar função
                </button>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Permissões padrão da nova função</p>
                <div className="mt-3 space-y-3">
                  {WORKSPACE_PERMISSION_GROUPS.map((group) => (
                    <div key={group.key} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">{group.label}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {group.options.map((permissionOption) => {
                          const selected = newWorkspaceRolePermissions.includes(permissionOption.key);
                          return (
                            <button
                              key={permissionOption.key}
                              type="button"
                              onClick={() => {
                                setNewWorkspaceRolePermissions((prev) => selected
                                  ? prev.filter((item) => item !== permissionOption.key)
                                  : [...prev, permissionOption.key]);
                              }}
                              className={`pill transition ${selected ? "bg-accent/20 text-accent" : "bg-white/10 text-foreground"}`}
                            >
                              {permissionOption.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Etapas permitidas</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {IMOB_STAGE_OPTIONS.map((stageOption) => {
                        const permissionKey = buildImobStagePermission(stageOption.key);
                        const selected = newWorkspaceRolePermissions.includes(permissionKey);
                        const disabled = newWorkspaceRolePermissions.includes("imob.stage.*");
                        return (
                          <button
                            key={stageOption.key}
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                              if (disabled) return;
                              setNewWorkspaceRolePermissions((prev) => selected
                                ? prev.filter((item) => item !== permissionKey)
                                : [...prev, permissionKey]);
                            }}
                            className={`pill transition ${selected ? "bg-accent/20 text-accent" : "bg-white/10 text-foreground"} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                          >
                            {stageOption.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {newWorkspaceRolePermissions.includes("imob.stage.*")
                        ? "Todas as etapas do IMOB estão liberadas para esta função."
                        : "Selecione as etapas do IMOB que essa função pode operar."}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  A função criada passa a carregar esse acesso padrão dentro do workspace e os convites dessa função herdam essas permissões.
                </p>
              </div>
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Gestão de membros</p>
                  <span className={`text-xs ${workspaceCanManageMembers ? "text-emerald-300" : "text-amber-300"}`}>
                    {workspaceCanManageMembers ? "Você pode convidar membros" : "Somente gestor/admin pode convidar"}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <input
                    className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-foreground"
                    placeholder="Nome do convidado"
                    value={inviteFullName}
                    onChange={(event) => setInviteFullName(event.target.value)}
                    disabled={!workspaceCanManageMembers}
                  />
                  <input
                    className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-foreground"
                    placeholder="email@empresa.com"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    disabled={!workspaceCanManageMembers}
                  />
                  <select
                    className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-foreground"
                    value={inviteRoleKey}
                    onChange={(event) => {
                      const nextRoleKey = event.target.value;
                      setInviteRoleKey(nextRoleKey);
                      if (nextRoleKey !== "assistente") {
                        setInviteStagePermissions([]);
                      }
                    }}
                    disabled={!workspaceCanManageMembers}
                  >
                    <option value="">Selecione a função</option>
                    {workspaceRoleOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {inviteRoleKey === "assistente" ? (
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Etapas permitidas para assistente</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {IMOB_STAGE_OPTIONS.map((stageOption) => {
                        const selected = inviteStagePermissions.includes(stageOption.key);
                        return (
                          <button
                            key={stageOption.key}
                            type="button"
                            onClick={() => {
                              setInviteStagePermissions((prev) => selected
                                ? prev.filter((item) => item !== stageOption.key)
                                : [...prev, stageOption.key]);
                            }}
                            disabled={!workspaceCanManageMembers}
                            className={`pill transition ${selected ? "bg-accent/20 text-accent" : "bg-white/10 text-foreground"}`}
                          >
                            {stageOption.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Assistente só poderá atuar nas etapas marcadas acima. Gestor/admin têm acesso total. Corretor usa o IMOB sem permissão de convite.
                    </p>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleInviteWorkspaceMember()}
                    disabled={!workspaceCanManageMembers || inviteState === "creating"}
                    className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {inviteState === "creating" ? "Criando convite..." : "Convidar por email"}
                  </button>
                  {inviteMessage ? (
                    <span className={`text-xs ${inviteState === "success" ? "text-emerald-300" : "text-rose-300"}`}>
                      {inviteMessage}
                    </span>
                  ) : null}
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-[#0a1527] p-3">
                    <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Membros do workspace</p>
                    {workspaceMembers.length > 0 ? (
                      <ExpandableList itemCount={workspaceMembers.length}>
                        {(expanded) => (
                          <div className="mt-3 space-y-2">
                            {workspaceMembers.slice(0, expanded ? workspaceMembers.length : 4).map((member) => (
                              <div key={member.userId} className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-muted-foreground">
                                <p className="text-sm font-medium text-foreground">
                                  {member.fullName}
                                  {member.isCurrentUser ? " (você)" : ""}
                                </p>
                                <p className="mt-1">{member.email}</p>
                                <p className="mt-1">Função: {member.roleLabel}</p>
                                <p className="mt-1">Status: {member.status}</p>
                                {member.permissions.length > 0 ? (
                                  <p className="mt-1">Permissões: {member.permissions.map((permission) => formatWorkspacePermissionLabel(permission)).join(" • ")}</p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </ExpandableList>
                    ) : (
                      <p className="mt-3 text-xs text-muted-foreground">Nenhum membro oficial encontrado neste workspace.</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#0a1527] p-3">
                    <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Convites pendentes</p>
                    {workspaceInvitations.length > 0 ? (
                      <ExpandableList itemCount={workspaceInvitations.length}>
                        {(expanded) => (
                          <div className="mt-3 space-y-2">
                            {workspaceInvitations.slice(0, expanded ? workspaceInvitations.length : 4).map((invitation) => {
                              const inviteUrl = typeof window !== "undefined"
                                ? `${window.location.origin}/access?invite=${encodeURIComponent(invitation.token)}`
                                : invitation.token;
                              return (
                                <div key={invitation.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-muted-foreground">
                                  <p className="text-sm font-medium text-foreground">{invitation.fullName}</p>
                                  <p className="mt-1">{invitation.email}</p>
                                  <p className="mt-1">Função: {invitation.roleLabel}</p>
                                  {invitation.permissions.length > 0 ? (
                                    <p className="mt-1">Permissões: {invitation.permissions.map((permission) => formatWorkspacePermissionLabel(permission)).join(" • ")}</p>
                                  ) : null}
                                  <p className="mt-1">Expira em: {formatDateTime(invitation.expiresAt)}</p>
                                  <p className="mt-2 break-all text-[11px] text-accent">{inviteUrl}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </ExpandableList>
                    ) : (
                      <p className="mt-3 text-xs text-muted-foreground">Nenhum convite pendente neste workspace.</p>
                    )}
                  </div>
                </div>
              </div>
                  </div>
                ) : null}

                {workspaceAdminView === "include_workspace" ? (
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4 text-xs text-muted-foreground">
            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">
              Incluir workspace
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Crie um novo espaço de trabalho dentro do tenant atual. Um hash único será gerado
              automaticamente.
            </p>
            <div className="mt-3 space-y-3">
              <label className="block text-sm text-muted-foreground">
                Nome do novo workspace
                <input
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                  placeholder="Ex.: Financeiro, Contábil..."
                  value={newWorkspaceName}
                  onChange={(event) => setNewWorkspaceName(event.target.value)}
                />
              </label>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <button
                  type="button"
                  className="rounded-full border border-accent/40 bg-accent/15 px-3 py-1 font-semibold uppercase tracking-[0.3em] text-accent transition hover:border-accent/70 hover:bg-accent/25 disabled:opacity-60"
                  disabled={workspaceCreateState === "creating"}
                  onClick={handleCreateWorkspace}
                >
                  {workspaceCreateState === "creating" ? "Criando..." : "Criar workspace"}
                </button>
                {workspaceCreateMessage && (
                  <span
                    className={`text-xs ${
                      workspaceCreateState === "success" ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    {workspaceCreateMessage}
                  </span>
                )}
              </div>
              {workspaceCreated && (
                <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-foreground">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                    Workspace criado
                  </p>
                  <p className="mt-2 text-xs text-foreground">
                    {workspaceCreated.name} · {workspaceCreated.workspaceId}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Para usar o novo workspace, selecione-o no bloco "Workspaces vinculados".
                  </p>
                </div>
              )}
            </div>
                  </div>
                ) : null}

                {workspaceAdminView === "edit_workspace" ? (
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4 text-xs text-muted-foreground">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">
                      Editar workspace
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Escolha um workspace vinculado e atualize o nome do workspace em foco. A alteração é persistida pelo botão Salvar deste bloco.
                    </p>
                    <div className="mt-3 space-y-3">
                      {linkedWorkspaces.length > 0 ? (
                        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                          <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                            Workspaces vinculados
                          </p>
                          <div className="mt-3 flex flex-col gap-2">
                            {linkedWorkspaces.map((workspace) => (
                              <button
                                key={`workspace-edit-${workspace.id}`}
                                type="button"
                                onClick={() => handleSelectWorkspace(workspace)}
                                disabled={isSwitchingWorkspace}
                                title={workspace.name}
                                className={`rounded-xl border px-3 py-2 text-left text-[11px] font-medium transition ${
                                  workspace.isCurrent
                                    ? "border-accent/40 bg-accent/15 text-accent"
                                    : "border-white/10 bg-white/5 text-foreground hover:border-accent/30"
                                }`}
                              >
                                {workspace.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <label className="block text-sm text-muted-foreground">
                        Nome do workspace atual
                        <input
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                          placeholder="Workspace"
                          value={workspaceName}
                          onChange={(event) => setWorkspaceName(event.target.value)}
                        />
                      </label>
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                          Workspace em foco
                        </p>
                        <p className="mt-2 text-sm text-foreground">{workspaceName || "—"}</p>
                      </div>
                      {workspaceSwitchMessage ? (
                        <p
                          className={`text-xs ${
                            workspaceSwitchMessage.type === "success" ? "text-emerald-300" : "text-rose-300"
                          }`}
                        >
                          {workspaceSwitchMessage.text}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {workspaceAdminView === "delete_workspace" ? (
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4 text-xs text-muted-foreground">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">
                      Excluir workspace
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      A exclusão ainda não está disponível nesta tela porque o frontend atual não possui API de remoção de workspace.
                    </p>
                    <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100">
                      Workspace atual: {workspaceName || "—"}
                    </div>
                  </div>
                ) : null}

                {workspaceAdminView === "signed_agents" ? (
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4 text-xs text-muted-foreground">
            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">
              Agentes assinados
            </p>
            {signedAgentsLoading ? (
              <p className="mt-2">Carregando assinaturas...</p>
            ) : signedAgentsError ? (
              <p className="mt-2 text-rose-300">{signedAgentsError}</p>
            ) : signedAgents.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-foreground/85">
                {signedAgents.map((agent) => (
                  <span key={agent} className="pill bg-white/10 text-foreground">
                    {agent}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Nenhuma assinatura ativa encontrada.</p>
            )}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <button
                    type="button"
                    onClick={() => void saveProfileSection("workspace")}
                    className="rounded-full border border-white/10 bg-accent/20 px-6 py-2 text-sm font-semibold text-foreground transition hover:bg-accent/30 disabled:opacity-60"
                    disabled={saveStatus.workspace === "saving"}
                  >
                    {saveStatus.workspace === "saving" ? "Salvando..." : "Salvar"}
                  </button>
                  {saveStatus.workspace === "saved" ? (
                    <span className="text-sm text-emerald-300">Workspace atualizado.</span>
                  ) : null}
                  {saveStatus.workspace === "error" ? (
                    <span className="text-sm text-red-300">
                      {saveErrorMessage.workspace ?? "Falha ao salvar. Tente novamente."}
                    </span>
                  ) : null}
                  {profileLoading ? (
                    <span className="text-sm text-muted-foreground">Carregando perfil...</span>
                  ) : null}
                </div>
              </div>
            </CollapsiblePanel>
          </div>

          <div id="profile-governance" className="scroll-mt-24">
            <CollapsiblePanel
              title="Governança & evidências"
              description="Delegações, evidências UX e diagnósticos operacionais do resolver e da fricção."
            >
              <div className="space-y-4">
          <CollapsiblePanel
            title="Delegacoes ativas"
            description="Visao das delegacoes em vigor. Mantidas acessiveis, mas agora resumidas em um painel proprio."
            badge={`${activeDelegations.length} ativos`}
            defaultOpen
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">
                Delegacoes ativas
              </p>
              <span className="text-xs text-muted-foreground">{activeDelegations.length} ativo(s)</span>
            </div>
            {delegationsStatus === "loading" ? (
              <p className="mt-3 text-sm text-muted-foreground">Carregando delegacoes...</p>
            ) : delegationsStatus === "error" ? (
              <p className="mt-3 text-sm text-rose-300">{delegationsError ?? "Falha ao carregar delegacoes."}</p>
            ) : activeDelegations.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Nenhuma delegacao ativa encontrada.</p>
            ) : (
              <ExpandableList itemCount={activeDelegations.length}>
                {(expanded) => (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {activeDelegations.slice(0, expanded ? activeDelegations.length : 4).map((delegation) => (
                      <div
                        key={delegation.id}
                        className="rounded-xl border border-white/10 bg-[#0a1527] p-4 text-xs text-muted-foreground"
                      >
                        <p className="text-sm font-semibold text-foreground">{delegation.itemName}</p>
                        <p className="mt-2">Publisher: {delegation.publisherLabel}</p>
                        <p>Scope: {delegation.scope}</p>
                        <p>Trust minimo: {delegation.trustMin}</p>
                        <p>Valido ate: {formatDate(delegation.validUntil)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </ExpandableList>
            )}
          </CollapsiblePanel>
          <CollapsiblePanel
            title="Evidencias UX do Chat Launcher"
            description="Historico de friccao do chat agora fica fechado por padrao e mostra poucas entradas primeiro."
            badge={helpdeskExport ? `${helpdeskExport.totalSessions} sessoes` : null}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">
                  Evidências UX do Chat Launcher
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Histórico persistido por workspace para demonstrar fricções do chat e apoiar melhoria de UX.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadHelpdeskJson}
                  disabled={!helpdeskExport}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-foreground transition hover:bg-white/10 disabled:opacity-50"
                >
                  Exportar JSON
                </button>
                <button
                  type="button"
                  onClick={handleDownloadHelpdeskCsv}
                  disabled={!helpdeskExport || !helpdeskContractCoverage}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-foreground transition hover:bg-white/10 disabled:opacity-50"
                >
                  Exportar CSV
                </button>
                <button
                  type="button"
                  onClick={handlePrintHelpdeskReport}
                  disabled={!helpdeskExport}
                  className="rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-accent transition hover:border-accent/70 hover:bg-accent/25 disabled:opacity-50"
                >
                  Imprimir
                </button>
              </div>
            </div>
            {helpdeskStatus === "loading" ? (
              <p className="mt-3 text-sm text-muted-foreground">Carregando evidências UX...</p>
            ) : helpdeskStatus === "error" ? (
              <p className="mt-3 text-sm text-rose-300">{helpdeskError ?? "Falha ao carregar histórico UX."}</p>
            ) : !helpdeskExport || helpdeskExport.groups.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Nenhum histórico persistido do Chat Launcher neste workspace.</p>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-white/10 bg-[#0a1527] p-4 text-xs text-muted-foreground">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-accent/80">Sessões</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{helpdeskExport.totalSessions}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#0a1527] p-4 text-xs text-muted-foreground">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-accent/80">Runs agrupados</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{helpdeskExport.totalRunGroups}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#0a1527] p-4 text-xs text-muted-foreground">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-accent/80">Clarificação em excesso</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{helpdeskExport.summary.clarification_overuse ?? 0}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#0a1527] p-4 text-xs text-muted-foreground">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-accent/80">Fallback genérico</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{helpdeskExport.summary.generic_fallback ?? 0}</p>
                  </div>
                </div>
                {helpdeskContractCoverage ? (
                  <div className="space-y-3 rounded-xl border border-white/10 bg-[#0a1527] p-4 text-xs text-muted-foreground">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-accent/80">
                        Cobertura contratual do tutor
                      </p>
                      <span className="text-[11px] text-muted-foreground">
                        Período: {helpdeskContractCoverage.window.dateFrom} até {helpdeskContractCoverage.window.dateTo}
                      </span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">source=tutor_contract_v1</p>
                        <p className="mt-2 text-lg font-semibold text-foreground">
                          {helpdeskContractCoverage.summary.contractCoveragePct}%
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">fallback rate</p>
                        <p className="mt-2 text-lg font-semibold text-foreground">
                          {helpdeskContractCoverage.summary.fallbackRatePct}%
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">cobertura líquida</p>
                        <p className="mt-2 text-lg font-semibold text-foreground">
                          {helpdeskContractCoverage.summary.netContractCoveragePct}%
                        </p>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-[11px]">
                        <thead>
                          <tr className="text-muted-foreground">
                            <th className="px-2 py-2 font-medium">Período</th>
                            <th className="px-2 py-2 font-medium">Sessões</th>
                            <th className="px-2 py-2 font-medium">Contrato %</th>
                            <th className="px-2 py-2 font-medium">Fallback %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {helpdeskContractCoverage.timeseries.slice(-8).map((row) => (
                            <tr key={row.bucketStart} className="border-t border-white/10">
                              <td className="px-2 py-2">{row.bucketStart}</td>
                              <td className="px-2 py-2">{row.totalSessions}</td>
                              <td className="px-2 py-2">{row.contractCoveragePct}%</td>
                              <td className="px-2 py-2">{row.fallbackRatePct}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-[11px]">
                        <thead>
                          <tr className="text-muted-foreground">
                            <th className="px-2 py-2 font-medium">Workspace</th>
                            <th className="px-2 py-2 font-medium">Sessões</th>
                            <th className="px-2 py-2 font-medium">Contrato %</th>
                            <th className="px-2 py-2 font-medium">Fallback %</th>
                            <th className="px-2 py-2 font-medium">Unknown source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {helpdeskContractCoverage.byWorkspace.map((row) => (
                            <tr key={row.workspaceId} className="border-t border-white/10">
                              <td className="px-2 py-2">{row.workspaceName ?? row.workspaceId}</td>
                              <td className="px-2 py-2">{row.totalSessions}</td>
                              <td className="px-2 py-2">{row.contractCoveragePct}%</td>
                              <td className="px-2 py-2">{row.fallbackRatePct}%</td>
                              <td className="px-2 py-2">{row.unknownSourceSessions}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
                <ExpandableList itemCount={helpdeskExport.groups.length} initialCount={3}>
                  {(expanded) => (
                    <div className="grid gap-3">
                      {helpdeskExport.groups.slice(0, expanded ? helpdeskExport.groups.length : 3).map((group) => {
                        const latest = group.interactions[0];
                        return (
                          <div
                            key={`${group.runId}-${group.lastInteractionAt ?? "na"}`}
                            className="rounded-xl border border-white/10 bg-[#0a1527] p-4 text-xs text-muted-foreground"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-foreground">
                                  {group.runId === "DEFAULT" ? "Sem run vinculada" : `Run ${group.runId}`}
                                </p>
                                <p className="mt-1">
                                  Agente: {group.agent ?? "—"} • Categoria UX: {group.uxIssueLabel}
                                </p>
                              </div>
                              <span className="pill bg-white/10 text-foreground">
                                {group.entries} registro(s)
                              </span>
                            </div>
                            <p className="mt-3 text-[11px] text-muted-foreground">
                              Última interação: {formatDateTime(group.lastInteractionAt)}
                            </p>
                            {latest ? (
                              <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                  <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Pergunta</p>
                                  <p className="mt-2 text-sm text-foreground">{latest.message}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                  <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Resposta</p>
                                  <p className="mt-2 text-sm text-foreground whitespace-pre-wrap">{latest.response}</p>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ExpandableList>
              </div>
            )}
          </CollapsiblePanel>
          <CollapsiblePanel
            title="Diagnostico operacional"
            description="Resolver, friccao, shadow executions, efficiency e rollout em um painel tecnico recolhivel."
            badge={diagnosticSnapshot?.alignment.rate !== null ? `${diagnosticSnapshot?.alignment.rate}% aligned` : null}
          >
            <CollapsiblePanel
              title="Diagnóstico do Experience Resolver"
              description="Convergência entre landing resolvida e ação primária sugerida, com base na auditoria operacional recente."
              defaultOpen
              headerActions={
                <div className="flex items-center rounded-full border border-white/10 bg-white/5 p-1">
                  {(["7d", "30d"] as const).map((window) => (
                    <button
                      key={window}
                      type="button"
                      onClick={() => setDiagnosticsWindow(window)}
                      className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.25em] transition ${
                        diagnosticsWindow === window
                          ? "bg-accent/20 text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {window}
                    </button>
                  ))}
                </div>
              }
              headerExtras={
                <span className="text-xs text-muted-foreground">
                  {diagnosticSnapshot?.latestEventAt
                    ? `Último evento: ${formatDateTime(diagnosticSnapshot.latestEventAt)}`
                    : "Sem eventos"}
                </span>
              }
            >
              {!diagnosticSnapshot || (diagnosticSnapshot.totals.aligned === 0 && diagnosticSnapshot.totals.diverged === 0) ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma evidência recente de alinhamento/divergência entre landing e ação primária neste workspace na janela {diagnosticsWindow}.
                </p>
              ) : (
                <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-[#0a1527] p-4 text-sm text-foreground">
                  {diagnosticSnapshot.alignment.summary}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Origem dominante: {diagnosticSnapshot.alignment.dominantSource}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Origem aligned dominante: {diagnosticSnapshot.alignment.dominantAlignedSource}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Origem diverged dominante: {diagnosticSnapshot.alignment.dominantDivergedSource}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Surface aligned dominante: {diagnosticSnapshot.alignment.dominantAlignedSurface}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Surface diverged dominante: {diagnosticSnapshot.alignment.dominantDivergedSurface}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {diagnosticSnapshot.alignment.convergenceSummary}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {diagnosticSnapshot.alignment.divergenceSummary}
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-[#0a1527] p-4 text-xs text-muted-foreground">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-accent/80">Aligned</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{diagnosticSnapshot.totals.aligned}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#0a1527] p-4 text-xs text-muted-foreground">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-accent/80">Diverged</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{diagnosticSnapshot.totals.diverged}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#0a1527] p-4 text-xs text-muted-foreground">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-accent/80">Alignment rate</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {diagnosticSnapshot.alignment.rate !== null ? `${diagnosticSnapshot.alignment.rate}%` : "—"}
                    </p>
                    <p
                      className={`mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                        diagnosticSnapshot.alignment.status === "healthy"
                          ? "text-emerald-300"
                          : diagnosticSnapshot.alignment.status === "watch"
                            ? "text-amber-300"
                            : diagnosticSnapshot.alignment.status === "poor"
                              ? "text-rose-300"
                              : "text-muted-foreground"
                      }`}
                    >
                      {diagnosticSnapshot.alignment.status}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#0a1527] p-4 text-sm text-foreground">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-accent/80">Operational insight</p>
                  {!operationalInsightSnapshot ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Sem leitura cruzada entre fricção e eficiência para a janela {diagnosticsWindow}.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-4">
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <p className="text-sm text-foreground">{operationalInsightSnapshot.summary}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {operationalInsightSnapshot.recommendedFocus}
                        </p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Priority</p>
                          <p className="mt-2 text-sm text-foreground">{operationalInsightSnapshot.priority}</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Friction total</p>
                          <p className="mt-2 text-sm text-foreground">{operationalInsightSnapshot.frictionTotal}</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Optimization total</p>
                          <p className="mt-2 text-sm text-foreground">{operationalInsightSnapshot.optimizationTotal}</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Top pair</p>
                          <p className="mt-2 text-xs text-foreground">
                            {operationalInsightSnapshot.topFrictionKind ?? "—"} /{" "}
                            {operationalInsightSnapshot.topOptimizationType ?? "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-white/10 bg-[#0a1527] p-4 text-sm text-foreground">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-accent/80">Shadow executions</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Inspeção leve dos previews e promoções persistidos do workspace ativo, usando a trilha durável do backend.
                  </p>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <label className="text-xs text-muted-foreground">
                      <span className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Current stage</span>
                      <select
                        value={shadowCurrentStageFilter}
                        onChange={(event) =>
                          setShadowCurrentStageFilter(
                            event.target.value as ShadowExecutionContract["currentStage"] | "all"
                          )
                        }
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[#0a1527] px-3 py-2 text-sm text-foreground"
                      >
                        <option value="all">Todos</option>
                        <option value="sandbox">sandbox</option>
                        <option value="preview">preview</option>
                        <option value="approval">approval</option>
                        <option value="promotion">promotion</option>
                        <option value="production">production</option>
                      </select>
                    </label>
                    <label className="text-xs text-muted-foreground">
                      <span className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Approval status</span>
                      <select
                        value={shadowApprovalStatusFilter}
                        onChange={(event) =>
                          setShadowApprovalStatusFilter(
                            event.target.value as ShadowExecutionContract["approvalStatus"] | "all"
                          )
                        }
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[#0a1527] px-3 py-2 text-sm text-foreground"
                      >
                        <option value="all">Todos</option>
                        <option value="not_required">not_required</option>
                        <option value="pending">pending</option>
                        <option value="approved">approved</option>
                        <option value="rejected">rejected</option>
                      </select>
                    </label>
                    <label className="text-xs text-muted-foreground">
                      <span className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Agent</span>
                      <input
                        value={shadowAgentFilter}
                        onChange={(event) => setShadowAgentFilter(event.target.value)}
                        placeholder="Filtrar por agentId"
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[#0a1527] px-3 py-2 text-sm text-foreground"
                      />
                    </label>
                  </div>
                  {shadowExecutions.length > 0 ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-5">
                      {(["sandbox", "preview", "approval", "promotion", "production"] as const).map((stage) => (
                        <div key={stage} className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-muted-foreground">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">{stage}</p>
                          <p className="mt-2 text-lg font-semibold text-foreground">{shadowExecutionsByStage[stage]}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {shadowExecutionsStatus === "loading" ? (
                    <p className="mt-3 text-sm text-muted-foreground">Carregando snapshots persistidos...</p>
                  ) : shadowExecutionsStatus === "error" ? (
                    <p className="mt-3 text-sm text-rose-300">{shadowExecutionsError ?? "Falha ao carregar snapshots persistidos."}</p>
                  ) : shadowExecutions.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">Nenhuma shadow execution persistida para o workspace ativo.</p>
                  ) : (
                    <ExpandableList itemCount={shadowExecutions.length} initialCount={3}>
                      {(expanded) => (
                        <div className="mt-4 grid gap-3">
                          {shadowExecutions.slice(0, expanded ? shadowExecutions.length : 3).map((item) => (
                            <div
                              key={item.shadowExecutionId}
                              className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-muted-foreground"
                            >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{item.agentId}</p>
                              <p className="mt-1 break-all">{item.shadowExecutionId}</p>
                            </div>
                            <span className="pill bg-white/10 text-foreground">{item.currentStage}</span>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-4">
                            <div className="rounded-lg border border-white/10 bg-[#0a1527] p-3">
                              <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Approval</p>
                              <p className="mt-2 text-sm text-foreground">{item.approvalStatus}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-[#0a1527] p-3">
                              <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Side effect</p>
                              <p className="mt-2 text-xs text-foreground">{item.sideEffectMode}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-[#0a1527] p-3">
                              <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Custo estimado</p>
                              <p className="mt-2 text-sm text-foreground">{formatBRL(item.preview.estimatedCostCents)}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-[#0a1527] p-3">
                              <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Produção</p>
                              <p className="mt-2 break-all text-xs text-foreground">{item.promotion.productionRunId ?? "—"}</p>
                            </div>
                          </div>
                          <p className="mt-3 text-xs text-foreground">{item.preview.summary}</p>
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => void handleInspectShadowExecution(item.shadowExecutionId)}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-foreground transition hover:border-accent/40 hover:text-accent"
                            >
                              {expandedShadowExecutionId === item.shadowExecutionId ? "Ocultar snapshot" : "Ver snapshot completo"}
                            </button>
                          </div>
                          {expandedShadowExecutionId === item.shadowExecutionId ? (
                            <div className="mt-4 rounded-lg border border-white/10 bg-[#0a1527] p-3">
                              {shadowExecutionDetailStatus === "loading" ? (
                                <p className="text-xs text-muted-foreground">Carregando snapshot completo...</p>
                              ) : shadowExecutionDetailStatus === "error" ? (
                                <p className="text-xs text-rose-300">{shadowExecutionDetailError ?? "Falha ao carregar snapshot completo."}</p>
                              ) : shadowExecutionDetail ? (
                                <div className="space-y-3 text-xs text-muted-foreground">
                                  <div className="grid gap-3 md:grid-cols-3">
                                    <div>
                                      <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Input ref</p>
                                      <p className="mt-1 break-all text-foreground">{shadowExecutionDetail.inputRef}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Target</p>
                                      <p className="mt-1 text-foreground">{shadowExecutionDetail.promotion.target}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Promoted at</p>
                                      <p className="mt-1 text-foreground">
                                        {shadowExecutionDetail.promotion.promotedAt
                                          ? formatDateTime(shadowExecutionDetail.promotion.promotedAt)
                                          : "—"}
                                      </p>
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Warnings</p>
                                    {shadowExecutionDetail.preview.warnings.length > 0 ? (
                                      <ul className="mt-2 space-y-1">
                                        {shadowExecutionDetail.preview.warnings.map((warning) => (
                                          <li key={warning}>- {warning}</li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <p className="mt-1 text-foreground">—</p>
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Next actions</p>
                                    {shadowExecutionDetail.preview.nextActions.length > 0 ? (
                                      <ul className="mt-2 space-y-1">
                                        {shadowExecutionDetail.preview.nextActions.map((step) => (
                                          <li key={step}>- {step}</li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <p className="mt-1 text-foreground">—</p>
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Evidence refs</p>
                                    <div className="mt-2 space-y-2">
                                      {shadowExecutionDetail.evidenceRefs.map((evidence) => (
                                        <div key={`${evidence.source}-${evidence.refId}`} className="rounded-md border border-white/10 bg-black/20 p-2">
                                          <p className="text-foreground">{evidence.label}</p>
                                          <p className="mt-1 break-all">{evidence.source} · {evidence.refId}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                          ))}
                        </div>
                      )}
                    </ExpandableList>
                  )}
                </div>
                <div className="rounded-xl border border-white/10 bg-[#0a1527] p-4 text-sm text-foreground">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-accent/80">Friction summary</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Leitura agregada do contrato normalizado de fricção no backend para alimentar PX-109 sem parsing ad hoc.
                  </p>
                  {!frictionSummary || frictionSummary.total === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Nenhum evento normalizado de fricção na janela {diagnosticsWindow}.
                    </p>
                  ) : (
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Total</p>
                        <p className="mt-2 text-lg font-semibold text-foreground">{frictionSummary.total}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Top kind</p>
                        <p className="mt-2 text-sm text-foreground">
                          {getTopEntry(frictionSummary.byKind)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Top source</p>
                        <p className="mt-2 text-sm text-foreground">
                          {getTopEntry(frictionSummary.bySource)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Top domain</p>
                        <p className="mt-2 text-sm text-foreground">
                          {getTopEntry(frictionSummary.byDomain)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Top surface</p>
                        <p className="mt-2 text-sm text-foreground">
                          {getTopEntry(frictionSummary.bySurface)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Top reason code</p>
                        <p className="mt-2 text-sm text-foreground">
                          {getTopEntry(frictionSummary.byReasonCode)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-white/10 bg-[#0a1527] p-4 text-sm text-foreground">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-accent/80">Efficiency Intelligence</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Snapshot agregado das recomendações heurísticas de custo/eficiência do tenant, separado do payload bruto de billing.
                  </p>
                  {!optimizationSnapshot || optimizationSnapshot.total === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Nenhuma recomendação heurística agregada para o ciclo atual.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-4">
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <p className="text-sm text-foreground">{optimizationSnapshot.summary}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Janela do ciclo: {formatDateTime(optimizationSnapshot.scope.cycleStart)} até{" "}
                          {formatDateTime(optimizationSnapshot.scope.cycleEnd)}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Fonte oficial: {optimizationSnapshot.sourceOfTruth.cost} / {optimizationSnapshot.sourceOfTruth.usage} /{" "}
                          {optimizationSnapshot.sourceOfTruth.agents}
                        </p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Total</p>
                          <p className="mt-2 text-lg font-semibold text-foreground">{optimizationSnapshot.total}</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Economia potencial</p>
                          <p className="mt-2 text-lg font-semibold text-foreground">
                            {formatBRL(optimizationSnapshot.totalEstimatedSavingsCents)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Top type</p>
                          <p className="mt-2 text-sm text-foreground">{optimizationSnapshot.topType ?? "—"}</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Top workspace</p>
                          <p className="mt-2 text-sm text-foreground">{optimizationSnapshot.topWorkspace ?? "—"}</p>
                        </div>
                      </div>
                      {optimizationSnapshot.topRecommendation ? (
                        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Top recommendation</p>
                          <p className="mt-2 text-sm font-semibold text-foreground">
                            {optimizationSnapshot.topRecommendation.title}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {optimizationSnapshot.topRecommendation.recommendationType} ·{" "}
                            {formatBRL(optimizationSnapshot.topRecommendation.estimatedSavingsCents)} · confiança{" "}
                            {Math.round(optimizationSnapshot.topRecommendation.confidence * 100)}%
                          </p>
                        </div>
                      ) : null}
                      {optimizationSnapshot.fleetPolicyCandidates.length > 0 ? (
                        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Fleet policy candidates</p>
                          <div className="mt-3 grid gap-3 md:grid-cols-3">
                            {optimizationSnapshot.fleetPolicyCandidates.map((item) => (
                              <div key={`profile-fleet-${item.subjectId}`} className="rounded-lg border border-white/10 bg-white/5 p-3">
                                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {item.priority} · {item.recommendationType} · {formatBRL(item.estimatedSavingsCents)} · confiança{" "}
                                  {Math.round(item.confidence * 100)}%
                                </p>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Ação sugerida: {item.suggestedAction.label}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="grid gap-3">
                  {session.verticals?.length ? (
                    <CollapsiblePanel
                      title="Vertical rollout registry"
                      description="Leitura resumida do estágio canônico de rollout das verticais no contexto atual."
                      defaultOpen
                    >
                      <div className="grid gap-3 md:grid-cols-2">
                        {session.verticals.map((item) => (
                          <div key={`profile-vertical-${item.verticalId}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-foreground">{item.label}</p>
                              <span className="pill">{item.rolloutStage}</span>
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                              Domínio: {item.activeDomain} • Enabled: {item.enabled ? "sim" : "não"}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Front door: {item.frontDoorSurface ?? "—"} • Hub: {item.operationalHubSurface ?? "—"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </CollapsiblePanel>
                  ) : null}
                  {economyOpportunitySnapshot ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-accent/80">Economy Opportunity</p>
                      <p className="mt-2 text-xs text-muted-foreground">{economyOpportunitySnapshot.summary}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{economyOpportunitySnapshot.consolidatedSummary}</p>
                      <p className="mt-2 text-xs text-foreground">
                        Recomendação: {economyOpportunitySnapshot.tenantRecommendation}
                      </p>
                      <p className="mt-2 text-xs">
                        <Link to="/app/economy" className="text-accent underline">
                          Abrir diagnóstico econômico
                        </Link>
                      </p>
                      <div className="mt-4 grid gap-3 md:grid-cols-4">
                        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Total</p>
                          <p className="mt-2 text-lg font-semibold text-foreground">{economyOpportunitySnapshot.total}</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Top status</p>
                          <p className="mt-2 text-sm text-foreground">{economyOpportunitySnapshot.topStatus}</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Top priority</p>
                          <p className="mt-2 text-sm text-foreground">{economyOpportunitySnapshot.topPriority ?? "—"}</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Economy status</p>
                          <p className="mt-2 text-sm text-foreground">{economyOpportunitySnapshot.consolidatedClassification}</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Audit attention</p>
                          <p className="mt-2 text-sm text-foreground">
                            {economyOpportunitySnapshot.auditableCostAttention.classification}
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 p-3 md:col-span-2">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Fonte oficial</p>
                          <p className="mt-2 text-xs text-foreground">
                            {economyOpportunitySnapshot.sourceOfTruth.cost} / {economyOpportunitySnapshot.sourceOfTruth.audit}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <ExpandableList itemCount={diagnosticSnapshot.recentEvents.length} initialCount={3}>
                    {(expanded) => (
                      <>
                        {diagnosticSnapshot.recentEvents.slice(0, expanded ? diagnosticSnapshot.recentEvents.length : 3).map((item, index) => (
                          <div key={`${item.eventType}-${item.createdAt}-${index}`} className="rounded-xl border border-white/10 bg-[#0a1527] p-4 text-xs text-muted-foreground">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-foreground">
                                  {item.eventType === "experience.recommended_action.aligned" ? "Landing alinhada" : "Landing divergente"}
                                </p>
                                <p className="mt-1">
                                  Surface: {item.surfaceId ?? "—"} • Origem: {item.source ?? "—"}
                                </p>
                              </div>
                              <span className="pill bg-white/10 text-foreground">{formatDateTime(item.createdAt)}</span>
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Landing</p>
                                <p className="mt-2 text-sm text-foreground">{item.landingPath ?? "—"}</p>
                              </div>
                              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Ação primária</p>
                                <p className="mt-2 text-sm text-foreground">{item.primaryActionPath ?? "—"}</p>
                                <p className="mt-1 text-[11px] text-muted-foreground">{item.primaryActionId ?? "—"}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </ExpandableList>
                </div>
              </div>
            )}
          </CollapsiblePanel>
          </CollapsiblePanel>
          <CollapsiblePanel
            title="Delegacoes expiradas"
            description="Itens vencidos ficam compactados, com renovacao ainda disponivel no mesmo lugar."
            badge={`${expiredDelegations.length} expirados`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">
                  Delegacoes expiradas
                </p>
                <span className="text-xs text-muted-foreground">
                  {expiredDelegations.length} expirado(s)
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleAutoRenewDelegations()}
                disabled={delegationBulkRenewalState === "loading"}
                className="rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-accent transition hover:border-accent/70 hover:bg-accent/25 disabled:opacity-50"
              >
                {delegationBulkRenewalState === "loading" ? "Aplicando..." : "Auto-renew elegíveis"}
              </button>
            </div>
            {delegationRenewalNotice ? (
              <p className="mt-3 text-xs text-emerald-200">{delegationRenewalNotice}</p>
            ) : null}
            {delegationsStatus === "loading" ? (
              <p className="mt-3 text-sm text-muted-foreground">Carregando delegacoes...</p>
            ) : delegationsStatus === "error" ? (
              <p className="mt-3 text-sm text-rose-300">{delegationsError ?? "Falha ao carregar delegacoes."}</p>
            ) : expiredDelegations.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Nenhuma delegacao expirada encontrada.</p>
            ) : (
              <ExpandableList itemCount={expiredDelegations.length}>
                {(expanded) => (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {expiredDelegations.slice(0, expanded ? expiredDelegations.length : 4).map((delegation) => (
                      <div
                        key={delegation.id}
                        className="rounded-xl border border-white/10 bg-[#0a1527] p-4 text-xs text-muted-foreground"
                      >
                        <p className="text-sm font-semibold text-foreground">{delegation.itemName}</p>
                        <p className="mt-2">Publisher: {delegation.publisherLabel}</p>
                        <p>Scope: {delegation.scope}</p>
                        <p>Trust minimo: {delegation.trustMin}</p>
                        <p>Valido ate: {formatDate(delegation.validUntil)}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handlePreviewDelegationRenewal(delegation.id)}
                            disabled={delegationRenewalStatus[delegation.id] === "loading"}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-foreground transition hover:bg-white/10 disabled:opacity-50"
                          >
                            Sugerir renewal
                          </button>
                          {delegationRenewalPreviews[delegation.id]?.canApplyRenewal ? (
                            <button
                              type="button"
                              onClick={() => void handleApplyDelegationRenewal(delegation)}
                              disabled={delegationRenewalStatus[delegation.id] === "loading"}
                              className="rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-accent transition hover:border-accent/70 hover:bg-accent/25 disabled:opacity-50"
                            >
                              Aplicar renewal
                            </button>
                          ) : null}
                        </div>
                        {delegationRenewalError[delegation.id] ? (
                          <p className="mt-3 text-xs text-rose-300">{delegationRenewalError[delegation.id]}</p>
                        ) : null}
                        {delegationRenewalPreviews[delegation.id] ? (
                          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                            <p className="text-[10px] uppercase tracking-[0.25em] text-accent">
                              {delegationRenewalPreviews[delegation.id].evaluation}
                            </p>
                            <p className="mt-2">{delegationRenewalPreviews[delegation.id].summary}</p>
                            <p className="mt-2">
                              Próxima validade sugerida:{" "}
                              {formatDate(delegationRenewalPreviews[delegation.id].recommendedValidUntil)}
                            </p>
                            <p className="mt-2">
                              Auto-elegível: {delegationRenewalPreviews[delegation.id].autoEligible ? "sim" : "não"}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </ExpandableList>
            )}
          </CollapsiblePanel>
              </div>
            </CollapsiblePanel>
          </div>
        </div>
      </form>
    </div>
  );
}
