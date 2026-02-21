import React from "react";
import { useNavigate } from "react-router-dom";
import {
  apiCreateProfile,
  apiCreateWorkspace,
  apiDeleteProfile,
  apiGetAuthMe,
  apiListTenantMembers,
  apiInviteTenantMember,
  apiApproveTenantMember,
  apiRejectTenantMember,
  apiSuspendTenantMember,
  apiActivateTenantMember,
  apiUpdateTenantMember,
  apiListCustomRoles,
  apiCreateCustomRole,
  apiUpdateCustomRole,
  apiDeleteCustomRole,
  apiListDelegations,
  apiListMarketplace,
  apiListProfiles,
  apiListWorkspaces,
  apiUpdateProfile,
  ApiError,
  type CustomRole,
  type DelegationPolicy,
  type MarketplaceItem,
  type TenantMember,
  type UserProfile,
  type WorkspaceListItem,
} from "@/lib/api";
import { updateSession, useSession } from "@/state/sessionStore";
import {
  allowedRolesForMembership,
  canAdminTenant,
  resolveTenantRole,
  type TenantRole,
} from "@/lib/tenantRole";

type ProfileState = {
  fullName: string;
  email: string;
  phone: string;
  cep: string;
  company: string;
  tenantRole: TenantRole;
  website: string;
  city: string;
  country: string;
  tenantId: string;
  workspaceId: string;
  token: string;
};

type RolePermissionSuggestion = {
  key: string;
  label: string;
  hint: string;
  keywords: string[];
  permissions: string[];
};

type RoleHierarchyView = {
  roleLabel: string;
  permissionSummary: string;
};

const ACTIVE_PROFILE_KEY = "eiah_profile_active_id";
const ACTIVE_PROFILE_NAME_KEY = "eiah_profile_active_name";
const ACTIVE_PROFILE_ROLE_KEY = "eiah_profile_active_role";

const DEFAULT_STATE: ProfileState = {
  fullName: "",
  email: "",
  phone: "",
  cep: "",
  company: "",
  tenantRole: "tenant_admin",
  website: "",
  city: "",
  country: "",
  tenantId: "",
  workspaceId: "",
  token: "",
};

const ROLE_PERMISSION_SUGGESTIONS: RolePermissionSuggestion[] = [
  {
    key: "admin",
    label: "Administração",
    hint: "Gestão completa do tenant, membros e políticas.",
    keywords: ["admin", "administrador", "gestao", "manager", "gerente", "owner", "coord"],
    permissions: [
      "tenant.manage",
      "members.manage",
      "workspace.manage",
      "iam.permission.manage",
      "approvals.manage",
      "delegation.manage",
      "governance.manage",
      "reports.view",
      "reports.export",
    ],
  },
  {
    key: "juridico",
    label: "Jurídico / Compliance",
    hint: "Aprovação, governança e trilha de auditoria.",
    keywords: ["juridico", "juridica", "compliance", "risco", "legal", "auditoria", "audit"],
    permissions: [
      "approvals.view",
      "approvals.approve",
      "governance.view",
      "governance.judge.view",
      "governance.trust.view",
      "delegation.view",
      "ledger.view",
      "reports.view",
      "reports.export",
    ],
  },
  {
    key: "operacao",
    label: "Operação",
    hint: "Execução operacional e resposta a incidentes.",
    keywords: ["operacao", "operator", "operador", "suporte", "sre", "noc", "oncall", "ops"],
    permissions: [
      "runs.read",
      "runs.execute",
      "alerts.view",
      "alerts.ack",
      "ops.view",
      "dlq.view",
      "dlq.redrive",
      "governance.view",
      "reports.view",
    ],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    hint: "Visibilidade de custos, relatórios e controles.",
    keywords: ["financeiro", "financeira", "billing", "faturamento", "custos", "contabil"],
    permissions: [
      "dashboard.overview.view",
      "runs.view",
      "runs.export",
      "ledger.view",
      "ledger.export",
      "reports.view",
      "reports.export",
      "approvals.view",
    ],
  },
  {
    key: "viewer",
    label: "Leitura",
    hint: "Somente leitura para acompanhamento e reporting.",
    keywords: ["viewer", "leitura", "analista", "consulta", "readonly", "read only"],
    permissions: [
      "dashboard.overview.view",
      "runs.view",
      "governance.view",
      "approvals.view",
      "delegation.view",
      "ledger.view",
      "reports.view",
      "reports.export",
    ],
  },
];

const PERMISSION_EXPLANATIONS_PT: Record<string, string> = {
  "approvals.view": "Visualizar fila de aprovações",
  "approvals.approve": "Aprovar solicitações e decisões pendentes",
  "approvals.manage": "Gerenciar regras e fluxo de aprovações",
  "governance.view": "Visualizar painel de governança",
  "governance.manage": "Gerenciar políticas de governança",
  "governance.judge.view": "Visualizar decisões do módulo Judge",
  "governance.judge.toggle": "Ativar/desativar comportamento do Judge",
  "governance.trust.view": "Visualizar indicadores de confiança",
  "governance.trust.manage": "Gerenciar parâmetros de confiança",
  "governance.policy.publish": "Publicar políticas de governança",
  "delegation.view": "Visualizar delegações e responsáveis",
  "delegation.manage": "Gerenciar delegações e alçadas",
  "ledger.view": "Consultar trilha de auditoria (ledger)",
  "ledger.export": "Exportar trilha de auditoria (ledger)",
  "reports.view": "Visualizar relatórios",
  "reports.read": "Consultar relatórios",
  "reports.export": "Exportar relatórios",
  "dashboard.overview.view": "Visualizar visão geral executiva",
  "runs.view": "Visualizar execuções",
  "runs.read": "Consultar execuções",
  "runs.execute": "Executar rotinas e automações",
  "runs.export": "Exportar dados de execuções",
  "alerts.view": "Visualizar alertas",
  "alerts.ack": "Reconhecer alertas",
  "alerts.manage": "Gerenciar regras e tratamento de alertas",
  "ops.view": "Visualizar operações técnicas",
  "dlq.view": "Visualizar fila de falhas (DLQ)",
  "dlq.redrive": "Reprocessar itens da fila de falhas (DLQ)",
  "dlq.policy.manage": "Gerenciar políticas da fila de falhas (DLQ)",
  "tenant.manage": "Gerenciar configurações do tenant",
  "members.manage": "Gerenciar membros do tenant",
  "workspace.manage": "Gerenciar workspaces do tenant",
  "iam.permission.manage": "Gerenciar permissões e papéis",
  "connectors.read": "Consultar conectores",
  "connectors.manage": "Gerenciar conectores",
  "agents.read": "Consultar agentes",
  "agents.manage": "Gerenciar agentes",
  "integrity.view": "Visualizar verificações de integridade",
  "integrity.reconcile": "Executar reconciliação de integridade",
  "audit.read": "Consultar eventos de auditoria",
  approve_low: "Aprovar itens de criticidade baixa",
  approve_medium: "Aprovar itens de criticidade média",
  approve_high: "Aprovar itens de criticidade alta",
  approve_critical: "Aprovar itens de criticidade crítica",
  approve_unknown: "Aprovar itens sem criticidade definida",
};

const ROLE_HIERARCHY_VIEW: Record<TenantRole, RoleHierarchyView> = {
  tenant_admin: {
    roleLabel: "Tenant Admin",
    permissionSummary: "Gerencia tenant, membros, workspaces e politicas.",
  },
  tenant_operator: {
    roleLabel: "Tenant Operator",
    permissionSummary: "Opera runs e rotinas com controle operacional.",
  },
  tenant_viewer: {
    roleLabel: "Tenant Viewer",
    permissionSummary: "Acesso de leitura para acompanhamento e relatorios.",
  },
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function parsePermissionList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveRoleSuggestion(name: string, description: string): RolePermissionSuggestion | null {
  const text = normalizeText(`${name} ${description}`);
  if (!text) return null;

  let best: { suggestion: RolePermissionSuggestion; score: number } | null = null;
  for (const suggestion of ROLE_PERMISSION_SUGGESTIONS) {
    const score = suggestion.keywords.reduce((count, keyword) => {
      return text.includes(normalizeText(keyword)) ? count + 1 : count;
    }, 0);
    if (score === 0) continue;
    if (!best || score > best.score) {
      best = { suggestion, score };
    }
  }

  return best?.suggestion ?? null;
}

function formatPermissionForB2B(permission: string) {
  const description = PERMISSION_EXPLANATIONS_PT[permission] ?? "Permissão técnica do sistema";
  return `${description} (${permission})`;
}

function getRoleHierarchyView(rawRole?: string | null): RoleHierarchyView {
  return ROLE_HIERARCHY_VIEW[resolveTenantRole(rawRole)];
}

function isDelegationActive(delegation?: DelegationPolicy | null) {
  if (!delegation?.validUntil) return false;
  const expiry = new Date(delegation.validUntil).getTime();
  return Number.isFinite(expiry) && expiry > Date.now();
}

function normalizeAgentKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function buildFormFromProfile(
  profile: UserProfile | null | undefined,
  session: ReturnType<typeof useSession>
) {
  return {
    fullName: profile?.fullName ?? "",
    email: profile?.email ?? "",
    phone: profile?.phone ?? "",
    cep: profile?.cep ?? "",
    company: profile?.company ?? "",
    tenantRole: resolveTenantRole(profile?.role ?? ""),
    website: profile?.website ?? "",
    city: profile?.city ?? "",
    country: profile?.country ?? "",
    tenantId: profile?.tenantId ?? session.tenantId ?? "",
    workspaceId: profile?.workspaceId ?? session.workspaceId ?? "",
    token: profile?.token ?? "",
  };
}

export default function ProfilePage() {
  const [form, setForm] = React.useState<ProfileState>(() => ({ ...DEFAULT_STATE }));
  const [status, setStatus] = React.useState<"idle" | "saved" | "error">("idle");
  const session = useSession();
  const navigate = useNavigate();
  const [signedAgents, setSignedAgents] = React.useState<string[]>([]);
  const [signedAgentsLoading, setSignedAgentsLoading] = React.useState(false);
  const [signedAgentsError, setSignedAgentsError] = React.useState<string | null>(null);
  const [newWorkspaceName, setNewWorkspaceName] = React.useState("");
  const [workspaceCreateState, setWorkspaceCreateState] = React.useState<
    "idle" | "creating" | "success" | "error"
  >("idle");
  const [workspaceCreateMessage, setWorkspaceCreateMessage] = React.useState<string | null>(null);
  const [workspaceCreated, setWorkspaceCreated] = React.useState<{
    workspaceId: string;
    name: string;
  } | null>(null);
  const [profiles, setProfiles] = React.useState<UserProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = React.useState(false);
  const [profilesError, setProfilesError] = React.useState<string | null>(null);
  const [activeProfileId, setActiveProfileId] = React.useState<string | null>(null);
  const [editingProfileId, setEditingProfileId] = React.useState<string | null>(null);
  const [reportFormat, setReportFormat] = React.useState<"csv" | "json">("csv");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<UserProfile | null>(null);
  const [profileActionError] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const isTenantAdmin = canAdminTenant(form.tenantRole);
  const [authSyncError, setAuthSyncError] = React.useState<string | null>(null);
  const [availableWorkspaces, setAvailableWorkspaces] = React.useState<WorkspaceListItem[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = React.useState(false);
  const [workspacesError, setWorkspacesError] = React.useState<string | null>(null);
  const [tenantMemberships, setTenantMemberships] = React.useState<
    Array<{ tenantId: string; role: string; status: string }>
  >([]);
  const [authRole, setAuthRole] = React.useState<string | null>(null);
  const [membersLoading, setMembersLoading] = React.useState(false);
  const [membersError, setMembersError] = React.useState<string | null>(null);
  const [members, setMembers] = React.useState<TenantMember[]>([]);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] =
    React.useState<TenantMember["role"]>("TENANT_VIEWER");
  const [inviteError, setInviteError] = React.useState<string | null>(null);
  const [inviteStatus, setInviteStatus] = React.useState<"idle" | "sending">("idle");
  const [memberActionLoading, setMemberActionLoading] = React.useState<Record<string, string>>({});
  const [memberActionError, setMemberActionError] = React.useState<Record<string, string>>({});
  const [roles, setRoles] = React.useState<CustomRole[]>([]);
  const [rolesLoading, setRolesLoading] = React.useState(false);
  const [rolesError, setRolesError] = React.useState<string | null>(null);
  const [roleForm, setRoleForm] = React.useState<{ name: string; description: string; permissions: string }>(
    { name: "", description: "", permissions: "" }
  );
  const [roleCreateStatus, setRoleCreateStatus] = React.useState<"idle" | "saving">("idle");
  const [roleCreateError, setRoleCreateError] = React.useState<string | null>(null);
  const [editingRoleId, setEditingRoleId] = React.useState<string | null>(null);
  const [roleSuggestionPopoverKey, setRoleSuggestionPopoverKey] = React.useState<string | null>(null);
  const suggestedRole = React.useMemo(
    () => resolveRoleSuggestion(roleForm.name, roleForm.description),
    [roleForm.name, roleForm.description]
  );
  const suggestedRolePermissions = React.useMemo(
    () => (suggestedRole ? suggestedRole.permissions.map(formatPermissionForB2B).join(" | ") : ""),
    [suggestedRole]
  );
  const toggleRoleSuggestionPopover = (key: string) => {
    setRoleSuggestionPopoverKey((prev) => (prev === key ? null : key));
  };

  const handleChange =
    (field: keyof ProfileState) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };
  const handleRoleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = resolveTenantRole(event.target.value);
    setForm((prev) => ({ ...prev, tenantRole: value }));
  };

  const formatReason = (error: unknown) => {
    if (error instanceof ApiError) {
      const body = error.body as { error?: { code?: string; reason?: string; message?: string } } | undefined;
      const reason = body?.error?.reason;
      const message = body?.error?.message ?? error.message;
      return reason ? `${message} (${reason})` : message;
    }
    if (error instanceof Error) return error.message;
    return "Falha inesperada.";
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveError(null);
    try {
      const normalizedTenantId =
        !form.tenantId.trim() || form.tenantId.trim().toLowerCase() === "admin"
          ? session.tenantId
          : form.tenantId.trim();
      const normalizedWorkspaceId = form.workspaceId.trim();
      const payload: Partial<UserProfile> = {
        fullName: form.fullName.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        cep: form.cep.trim() || null,
        company: form.company.trim() || null,
        role: form.tenantRole,
        website: form.website.trim() || null,
        city: form.city.trim() || null,
        country: form.country.trim() || null,
        tenantId: normalizedTenantId || null,
        workspaceId: normalizedWorkspaceId || null,
        token: form.token.trim() || null,
      };

      const response = editingProfileId
        ? await apiUpdateProfile(editingProfileId, payload)
        : await apiCreateProfile(payload);

      if (!response.ok || !response.item) {
        setStatus("error");
        const message =
          (response.error as { message?: string } | undefined)?.message ??
          (response.error as { code?: string } | undefined)?.code ??
          null;
        if (message) {
          setSaveError(message);
        }
        return;
      }

      const saved = response.item;
      setEditingProfileId(saved.id);
      setProfiles((prev) => {
        const exists = prev.find((p) => p.id === saved.id);
        if (exists) {
          return prev.map((p) => (p.id === saved.id ? saved : p));
        }
        return [saved, ...prev];
      });

      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2500);
      navigate("/self-service");
    } catch (err) {
      setStatus("error");
      if (err instanceof ApiError) {
        const body = err.body as { error?: { code?: string; message?: string } } | undefined;
        const code = body?.error?.code ?? "";
        const message = body?.error?.message ?? err.message;
        if (code === "TENANT_MEMBERSHIP_REQUIRED") {
          setSaveError("Seu usuário ainda não está vinculado ao tenant. Solicite ao admin.");
        } else if (code === "TENANT_MEMBERSHIP_DISABLED" || code === "TENANT_MEMBERSHIP_INACTIVE") {
          setSaveError("Sua associação ao tenant está inativa. Solicite ao admin.");
        } else {
          setSaveError(message);
        }
      } else if (err instanceof Error) {
        setSaveError(err.message);
      }
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
      setWorkspaceCreateMessage("Workspace criado com sucesso.");
      setNewWorkspaceName("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao criar workspace. Tente novamente.";
      setWorkspaceCreateState("error");
      setWorkspaceCreateMessage(message);
    }
  };

  React.useEffect(() => {
    if (!session.tenantId) return;
    setForm((prev) =>
      prev.company ? prev : { ...prev, company: session.tenantId }
    );
  }, [session.tenantId]);

  const workspaceTooltip = React.useMemo(() => {
    if (workspacesLoading) return "Carregando workspaces...";
    if (workspacesError) return workspacesError;
    if (availableWorkspaces.length === 0) {
      return "Nenhum workspace encontrado. Ex.: workspace-demo.";
    }
    return [
      "Workspaces disponiveis:",
      ...availableWorkspaces.map((w) => w.name),
    ].join(" | ");
  }, [workspacesLoading, workspacesError, availableWorkspaces]);

  const workspaceNameById = React.useMemo(() => {
    const next = new Map<string, string>();
    availableWorkspaces.forEach((workspace) => {
      if (workspace.id) {
        next.set(workspace.id, workspace.name || "Workspace");
      }
    });
    return next;
  }, [availableWorkspaces]);

  const formatWorkspaceLabel = React.useCallback(
    (workspaceId?: string | null) => {
      const normalized = workspaceId?.trim();
      if (!normalized) return "Não fixado";
      return workspaceNameById.get(normalized) ?? "Workspace configurado";
    },
    [workspaceNameById]
  );

  const loadProfileForEdit = React.useCallback(
    (profile: UserProfile | null) => {
      setEditingProfileId(profile?.id ?? null);
      const next = buildFormFromProfile(profile, session);
      setForm({ ...next, workspaceId: next.workspaceId ?? "" });
    },
    [session]
  );

  React.useEffect(() => {
    let active = true;
    setProfilesLoading(true);
    setProfilesError(null);

    apiListProfiles()
      .then((response) => {
        if (!active) return;
        const items = response.items ?? [];
        setProfiles(items);
        const storedId =
          typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_PROFILE_KEY) : null;
        const selected =
          items.find((p) => p.id === activeProfileId) ??
          items.find((p) => p.id === storedId) ??
          items[0] ??
          null;
        if (selected) {
          loadProfileForEdit(selected);
        } else {
          setEditingProfileId(null);
          setForm(buildFormFromProfile(null, session));
        }
      })
      .catch((error) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Falha ao carregar perfis.";
        setProfilesError(message);
      })
      .finally(() => {
        if (active) setProfilesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeProfileId, loadProfileForEdit, session]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const current = profiles.find((profile) => profile.id === activeProfileId);
    if (!current) return;
    window.localStorage.setItem(ACTIVE_PROFILE_KEY, current.id);
    window.localStorage.setItem(ACTIVE_PROFILE_NAME_KEY, current.fullName ?? "");
    window.localStorage.setItem(ACTIVE_PROFILE_ROLE_KEY, current.role ?? "");
  }, [activeProfileId, profiles]);

  React.useEffect(() => {
    if (editingProfileId) return;
    setForm((prev) => ({
      ...prev,
      tenantId: session.tenantId ?? "",
      workspaceId: "",
      token: "",
    }));
  }, [editingProfileId, session.tenantId, session.workspaceId]);

  const handleNewProfile = () => {
    setEditingProfileId(null);
    setForm(buildFormFromProfile(null, session));
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ACTIVE_PROFILE_KEY);
      window.localStorage.setItem(ACTIVE_PROFILE_NAME_KEY, "");
      window.localStorage.setItem(ACTIVE_PROFILE_ROLE_KEY, "");
    }
  };

  const handleDeleteProfile = async () => {
    if (!deleteTarget?.id) return;
    try {
      await apiDeleteProfile(deleteTarget.id);
      setProfiles((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      if (activeProfileId === deleteTarget.id) {
        setActiveProfileId(null);
      }
      if (editingProfileId === deleteTarget.id) {
        setEditingProfileId(null);
        setForm(buildFormFromProfile(null, session));
      }
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(ACTIVE_PROFILE_KEY);
        window.localStorage.setItem(ACTIVE_PROFILE_NAME_KEY, "");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao excluir perfil.";
      setProfilesError(message);
    } finally {
      setConfirmDelete(false);
      setDeleteTarget(null);
    }
  };

  const handleDownloadReport = () => {
    const items = profiles;
    if (items.length === 0 || typeof window === "undefined") return;

    const filename = `eiah-profiles-${new Date().toISOString().slice(0, 10)}.${reportFormat}`;
    let content = "";
    let mime = "text/plain";

    if (reportFormat === "json") {
      content = JSON.stringify(items, null, 2);
      mime = "application/json";
    } else {
      const header = [
        "id",
        "fullName",
        "email",
        "phone",
        "company",
        "role",
        "website",
        "city",
        "country",
        "tenantId",
        "workspaceId",
        "token",
        "createdAt",
        "updatedAt",
      ];
      const rows = items.map((p) =>
        header
          .map((key) => {
            const value = (p as Record<string, unknown>)[key];
            const raw = value === null || value === undefined ? "" : String(value);
            const escaped = raw.replace(/"/g, "\"\"");
            return `"${escaped}"`;
          })
          .join(",")
      );
      content = [header.join(","), ...rows].join("\n");
      mime = "text/csv";
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  React.useEffect(() => {
    if (!session.userId) {
      setSignedAgents([]);
      setSignedAgentsLoading(false);
      setSignedAgentsError(null);
      return;
    }
    let active = true;
    setSignedAgentsLoading(true);
    setSignedAgentsError(null);
    Promise.all([apiListMarketplace(), apiListDelegations({ role: "delegatee" })])
      .then(([marketplaceResponse, delegationsResponse]) => {
        if (!active) return;
        const items = marketplaceResponse.items ?? [];
        const delegations = (delegationsResponse.items ?? []).filter((entry) => isDelegationActive(entry));
        const byId = new Map(items.map((item) => [item.id, item]));
        const unique = new Set<string>();
        delegations.forEach((delegation) => {
          if (delegation.marketplaceId && byId.has(delegation.marketplaceId)) {
            const item = byId.get(delegation.marketplaceId) as MarketplaceItem;
            unique.add(item.name || item.id);
            return;
          }
          if (delegation.marketplaceId) {
            const normalized = normalizeAgentKey(delegation.marketplaceId);
            const match =
              items.find((item) => normalizeAgentKey(item.name || "") === normalized) ||
              items.find((item) => normalizeAgentKey(item.id) === normalized);
            if (match) {
              unique.add(match.name || match.id);
              return;
            }
          }
          if (delegation.scope) unique.add(delegation.scope);
        });
        setSignedAgents([...unique]);
      })
      .catch((error) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Falha ao carregar agentes assinados.";
        if (message.toLowerCase().includes("tenant membership required")) {
          setSignedAgentsError(null);
        } else {
          setSignedAgentsError(message);
        }
        setSignedAgents([]);
      })
      .finally(() => {
        if (active) setSignedAgentsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session.userId, session.tenantId, session.workspaceId]);

  React.useEffect(() => {
    let active = true;
    setAuthSyncError(null);
    apiGetAuthMe()
      .then((response) => {
        if (!active || !response?.data) return;
        const {
          tenantId,
          workspaceId,
          tenantRole,
          activeProfileId: activeId,
          memberships,
          role,
        } = response.data as {
          tenantId?: string;
          workspaceId?: string;
          tenantRole?: string | null;
          activeProfileId?: string | null;
          memberships?: Array<{ tenantId: string; role: string; status: string }>;
          role?: string;
        };
        if (tenantId && (!form.tenantId.trim() || form.tenantId.trim().toLowerCase() === "admin")) {
          setForm((prev) => ({ ...prev, tenantId }));
        }
        if (workspaceId && !form.workspaceId.trim()) {
          setForm((prev) => ({ ...prev, workspaceId }));
        }
        if (tenantRole) {
          setForm((prev) => ({ ...prev, tenantRole: resolveTenantRole(tenantRole) }));
        }
        setTenantMemberships(memberships ?? []);
        setAuthRole(role ?? null);
        updateSession({
          tenantId: tenantId ?? session.tenantId,
          workspaceId: workspaceId ?? session.workspaceId,
        });
        if (activeId) {
          setActiveProfileId(activeId);
        }
      })
      .catch((error) => {
        if (!active) return;
        const message =
          error instanceof Error ? error.message : "Falha ao sincronizar tenant.";
        setAuthSyncError(message);
      });
    return () => {
      active = false;
    };
  }, [session.userId]);

  const allowedRoles = React.useMemo<TenantRole[]>(() => {
    const normalizedTenantId = form.tenantId.trim();
    const normalizedRole = (authRole ?? "").toLowerCase();
    if (normalizedRole.includes("global") || normalizedRole.includes("eiah")) {
      return ["tenant_admin", "tenant_operator", "tenant_viewer"];
    }
    if (!normalizedTenantId) {
      return ["tenant_admin", "tenant_operator", "tenant_viewer"];
    }
    const membership = tenantMemberships.find(
      (entry) => entry.tenantId === normalizedTenantId
    );
    if (!membership) {
      return ["tenant_admin", "tenant_operator", "tenant_viewer"];
    }
    return allowedRolesForMembership(resolveTenantRole(membership.role));
  }, [authRole, form.tenantId, tenantMemberships]);

  React.useEffect(() => {
    let active = true;
    const tenantForWorkspaces = form.tenantId.trim() || session.tenantId;
    if (!tenantForWorkspaces) {
      setAvailableWorkspaces([]);
      return () => {
        active = false;
      };
    }
    setWorkspacesLoading(true);
    setWorkspacesError(null);
    apiListWorkspaces({ tenantId: tenantForWorkspaces, limit: 200 })
      .then((response) => {
        if (!active) return;
        const items = response.items ?? [];
        setAvailableWorkspaces(items);
        if (form.workspaceId.trim()) {
          const exists = items.some((workspace) => workspace.id === form.workspaceId.trim());
          if (!exists) {
            setForm((prev) => ({ ...prev, workspaceId: "" }));
            setWorkspacesError(
              `Workspace não pertence ao tenant ${tenantForWorkspaces}. Selecione um workspace válido.`
            );
          }
        }
      })
      .catch((error) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Falha ao carregar workspaces.";
        setWorkspacesError(message);
        setAvailableWorkspaces([]);
      })
      .finally(() => {
        if (active) setWorkspacesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [form.tenantId, form.workspaceId, session.tenantId]);

  React.useEffect(() => {
    if (!session.tenantId || !isTenantAdmin) {
      setMembers([]);
      return;
    }
    let active = true;
    setMembersLoading(true);
    setMembersError(null);
    apiListTenantMembers(session.tenantId)
      .then((response) => {
        if (!active) return;
        setMembers(response.items ?? []);
      })
      .catch((error) => {
        if (!active) return;
        setMembersError(formatReason(error));
        setMembers([]);
      })
      .finally(() => {
        if (active) setMembersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session.tenantId, isTenantAdmin]);

  React.useEffect(() => {
    if (!session.tenantId || !isTenantAdmin) {
      setRoles([]);
      return;
    }
    let active = true;
    setRolesLoading(true);
    setRolesError(null);
    apiListCustomRoles(session.tenantId)
      .then((response) => {
        if (!active) return;
        setRoles(response.items ?? []);
      })
      .catch((error) => {
        if (!active) return;
        setRolesError(formatReason(error));
        setRoles([]);
      })
      .finally(() => {
        if (active) setRolesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session.tenantId, isTenantAdmin]);

  const handleInviteMember = async () => {
    if (!session.tenantId || inviteStatus === "sending") return;
    setInviteError(null);
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setInviteError("Informe o e-mail do usuário.");
      return;
    }
    setInviteStatus("sending");
    try {
      const response = await apiInviteTenantMember(session.tenantId, { email, role: inviteRole });
      if (!response.ok || !response.data) {
        throw new Error("Falha ao convidar membro.");
      }
      setInviteEmail("");
      setMembers((prev) => [response.data!, ...prev]);
    } catch (error) {
      setInviteError(formatReason(error));
    } finally {
      setInviteStatus("idle");
    }
  };

  const handleMemberAction = async (
    member: TenantMember,
    action: "approve" | "reject" | "suspend" | "activate"
  ) => {
    if (!session.tenantId) return;
    setMemberActionError((prev) => ({ ...prev, [member.id]: "" }));
    setMemberActionLoading((prev) => ({ ...prev, [member.id]: action }));
    try {
      if (action === "approve") await apiApproveTenantMember(session.tenantId, member.id);
      if (action === "reject") await apiRejectTenantMember(session.tenantId, member.id);
      if (action === "suspend") await apiSuspendTenantMember(session.tenantId, member.id);
      if (action === "activate") await apiActivateTenantMember(session.tenantId, member.id);
      const refreshed = await apiListTenantMembers(session.tenantId);
      setMembers(refreshed.items ?? []);
    } catch (error) {
      setMemberActionError((prev) => ({ ...prev, [member.id]: formatReason(error) }));
    } finally {
      setMemberActionLoading((prev) => {
        const next = { ...prev };
        delete next[member.id];
        return next;
      });
    }
  };

  const handleMemberRoleChange = async (member: TenantMember, role: TenantMember["role"]) => {
    if (!session.tenantId) return;
    setMemberActionError((prev) => ({ ...prev, [member.id]: "" }));
    setMemberActionLoading((prev) => ({ ...prev, [member.id]: "update-role" }));
    try {
      await apiUpdateTenantMember(session.tenantId, member.id, { role });
      setMembers((prev) =>
        prev.map((item) => (item.id === member.id ? { ...item, role } : item))
      );
    } catch (error) {
      setMemberActionError((prev) => ({ ...prev, [member.id]: formatReason(error) }));
    } finally {
      setMemberActionLoading((prev) => {
        const next = { ...prev };
        delete next[member.id];
        return next;
      });
    }
  };

  const handleMemberCustomRoleChange = async (member: TenantMember, customRoleId: string) => {
    if (!session.tenantId) return;
    const nextId = customRoleId === "system" ? null : customRoleId;
    setMemberActionError((prev) => ({ ...prev, [member.id]: "" }));
    setMemberActionLoading((prev) => ({ ...prev, [member.id]: "update-custom-role" }));
    try {
      await apiUpdateTenantMember(session.tenantId, member.id, { customRoleId: nextId });
      setMembers((prev) =>
        prev.map((item) =>
          item.id === member.id
            ? { ...item, customRoleId: nextId, customRoleName: roles.find((r) => r.id === nextId)?.name ?? null }
            : item
        )
      );
    } catch (error) {
      setMemberActionError((prev) => ({ ...prev, [member.id]: formatReason(error) }));
    } finally {
      setMemberActionLoading((prev) => {
        const next = { ...prev };
        delete next[member.id];
        return next;
      });
    }
  };

  const handleCreateRole = async () => {
    if (!session.tenantId || roleCreateStatus === "saving") return;
    setRoleCreateError(null);
    if (!roleForm.name.trim()) {
      setRoleCreateError("Informe um nome para a role.");
      return;
    }
    setRoleCreateStatus("saving");
    try {
      const typedPermissions = parsePermissionList(roleForm.permissions);
      const permissions = typedPermissions.length > 0 ? typedPermissions : suggestedRole?.permissions ?? [];
      if (permissions.length === 0) {
        setRoleCreateError("Informe permissões ou use um nome/descrição que gere sugestão.");
        setRoleCreateStatus("idle");
        return;
      }
      const response = await apiCreateCustomRole(session.tenantId, {
        name: roleForm.name.trim(),
        description: roleForm.description.trim() || null,
        permissions,
      });
      if (!response.ok || !response.data) {
        throw new Error("Falha ao criar funções.");
      }
      setRoles((prev) => [...prev, { ...response.data!, permissions }]);
      setRoleForm({ name: "", description: "", permissions: "" });
      setEditingRoleId(null);
    } catch (error) {
      setRoleCreateError(formatReason(error));
    } finally {
      setRoleCreateStatus("idle");
    }
  };

  const handleUpdateRole = async (role: CustomRole, permissions: string) => {
    if (!session.tenantId) return;
    setRoleCreateError(null);
    setRoleCreateStatus("saving");
    try {
      const nextPermissions = permissions
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      await apiUpdateCustomRole(session.tenantId, role.id, {
        name: role.name,
        description: role.description ?? null,
        permissions: nextPermissions,
      });
      setRoles((prev) =>
        prev.map((item) =>
          item.id === role.id ? { ...item, permissions: nextPermissions } : item
        )
      );
      setEditingRoleId(null);
    } catch (error) {
      setRoleCreateError(formatReason(error));
    } finally {
      setRoleCreateStatus("idle");
    }
  };

  const handleDeleteRole = async (role: CustomRole) => {
    if (!session.tenantId) return;
    setRoleCreateError(null);
    setRoleCreateStatus("saving");
    try {
      await apiDeleteCustomRole(session.tenantId, role.id);
      setRoles((prev) => prev.filter((item) => item.id !== role.id));
    } catch (error) {
      setRoleCreateError(formatReason(error));
    } finally {
      setRoleCreateStatus("idle");
    }
  };

  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? null;
  const masterDevEmails = React.useMemo(() => {
    const raw =
      import.meta.env.VITE_MASTER_DEV_EMAILS ??
      "mmerlon.adv@gmail.com,mmerlon.adv@gamail.com";
    return new Set(
      raw
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    );
  }, []);
  const isMasterByAuthRole = React.useMemo(() => {
    const normalized = (authRole ?? "").toLowerCase();
    return normalized.includes("global") || normalized.includes("eiah");
  }, [authRole]);
  const isMasterByEmail = React.useMemo(() => {
    const email = activeProfile?.email?.trim().toLowerCase();
    return Boolean(email && masterDevEmails.has(email));
  }, [activeProfile?.email, masterDevEmails]);
  const isMasterDevSession = isMasterByAuthRole || isMasterByEmail;
  const orderedProfiles = React.useMemo(() => {
    return [...profiles].sort((a, b) => {
      if (a.id === activeProfileId) return -1;
      if (b.id === activeProfileId) return 1;
      const rank = (role?: string | null) => {
        const normalized = resolveTenantRole(role);
        if (normalized === "tenant_admin") return 0;
        if (normalized === "tenant_operator") return 1;
        return 2;
      };
      const diff = rank(a.role) - rank(b.role);
      if (diff !== 0) return diff;
      const aName = (a.fullName || a.email || a.id).toLowerCase();
      const bName = (b.fullName || b.email || b.id).toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [activeProfileId, profiles]);
  const subordinateCount = Math.max(orderedProfiles.length - (activeProfile ? 1 : 0), 0);

  return (
    <div className="space-y-8">
      <header className="rounded-3xl border border-white/10 bg-gradient-to-r from-accent/10 via-surface/80 to-transparent p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-accent">Perfil</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          Cadastro completo do ambiente privado
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Preencha seus dados para personalizar o uso e facilitar suporte e faturamento.
        </p>
      </header>

      <form
        className="rounded-3xl border border-white/10 bg-surface/70 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.35)]"
        onSubmit={handleSubmit}
      >
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent/80">
                Perfil ativo
              </p>
              <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-4">
                {activeProfile ? (
                  <div className="space-y-2 text-sm text-foreground">
                    <p className="font-semibold">
                      {activeProfile.fullName || activeProfile.email || activeProfile.id}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-accent">
                        {isMasterDevSession ? "Dev Master EIAH" : "Perfil padrão"}
                      </span>
                      <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        {getRoleHierarchyView(activeProfile.role).roleLabel}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Tenant: {activeProfile.tenantId || session.tenantId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Workspace: {formatWorkspaceLabel(activeProfile.workspaceId)}
                    </p>
                    {isMasterDevSession ? (
                      <p className="text-xs text-accent/90">
                        Hierarquia: {subordinateCount} subperfil(is) vinculado(s) neste tenant.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum perfil ativo.</p>
                )}
              </div>
              {authSyncError ? (
                <p className="mt-2 text-xs text-amber-200">{authSyncError}</p>
              ) : null}
              {profileActionError ? (
                <p className="mt-2 text-xs text-rose-300">{profileActionError}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="rounded-full border border-accent/40 bg-accent/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent transition hover:border-accent/70 hover:bg-accent/25"
                onClick={handleNewProfile}
              >
                Novo perfil
              </button>
              <div className="flex items-center gap-2">
                <select
                  className="w-full rounded-full border border-white/10 bg-black/30 px-3 py-2 text-xs text-foreground"
                  value={reportFormat}
                  onChange={(event) => setReportFormat(event.target.value as "csv" | "json")}
                >
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </select>
                <button
                  type="button"
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-foreground transition hover:bg-white/10"
                  onClick={handleDownloadReport}
                  disabled={profiles.length === 0}
                >
                  Gerar relatório
                </button>
              </div>
              <button
                type="button"
                className="rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60"
                disabled={!editingProfileId}
                onClick={() => {
                  const target = profiles.find((profile) => profile.id === editingProfileId) ?? null;
                  if (!target) return;
                  setDeleteTarget(target);
                  setConfirmDelete(true);
                }}
              >
                Excluir perfil
              </button>
              {profilesLoading ? (
                <span className="text-xs text-muted-foreground">Carregando perfis...</span>
              ) : profilesError ? (
                <span className="text-xs text-rose-300">{profilesError}</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent/80">
                Perfis cadastrados
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Selecione um perfil para ativar ou editar.
              </p>
            </div>
            <button
              type="button"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-foreground transition hover:bg-white/10 disabled:opacity-60"
              disabled={!editingProfileId}
              onClick={() => {
                const target = profiles.find((profile) => profile.id === editingProfileId) ?? null;
                if (!target) return;
                loadProfileForEdit(target);
              }}
            >
              Editar selecionado
            </button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm text-foreground">
              <thead className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Perfil</th>
                  <th className="py-2 pr-4">Hierarquia e permissões</th>
                  <th className="py-2 pr-4">Workspace</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {profiles.length === 0 ? (
                  <tr>
                    <td className="py-3 text-muted-foreground" colSpan={5}>
                      Nenhum perfil cadastrado.
                    </td>
                  </tr>
                ) : (
                  orderedProfiles.map((profile) => {
                    const isActive = profile.id === activeProfileId;
                    const isEditing = profile.id === editingProfileId;
                    const roleView = getRoleHierarchyView(profile.role);
                    const hierarchyLabel = isMasterDevSession
                      ? isActive
                        ? "Perfil mestre"
                        : "Subperfil corporativo"
                      : "Perfil";
                    return (
                      <tr
                        key={profile.id}
                        className="cursor-pointer border-t border-white/5 transition hover:bg-white/5"
                        onClick={() => {
                          setEditingProfileId(profile.id);
                        }}
                      >
                        <td className="py-3 pr-4">
                          <div className="font-semibold">
                            {profile.fullName || profile.email || profile.id}
                          </div>
                          <div className="text-xs text-muted-foreground">{profile.tenantId || session.tenantId}</div>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-semibold">{hierarchyLabel}</div>
                          <div className="text-xs text-muted-foreground">{roleView.roleLabel}</div>
                          <div className="text-xs text-muted-foreground">{roleView.permissionSummary}</div>
                        </td>
                        <td className="py-3 pr-4">{formatWorkspaceLabel(profile.workspaceId)}</td>
                        <td className="py-3 pr-4">
                          {isActive ? "Ativo" : "Disponível"}
                          {isEditing ? " · Editando" : ""}
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              className="rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-rose-200 transition hover:bg-rose-500/20"
                              onClick={(event) => {
                                event.stopPropagation();
                                setDeleteTarget(profile);
                                setConfirmDelete(true);
                              }}
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-6">
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
                value={form.company}
                onChange={handleChange("company")}
              />
            </label>
            <label className="block text-sm text-muted-foreground">
              Tenant ID
              <input
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                placeholder="tenant-demo"
                value={form.tenantId}
                onChange={handleChange("tenantId")}
              />
            </label>
            <label className="block text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                Tenant Role
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] text-muted-foreground"
                  title="Admin: gerencia permissoes, workspaces, conectores e instalacao de agentes. Operator: executa runs, sem administrar. Viewer: apenas visualiza."
                >
                  i
                </span>
              </span>
              <select
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                value={form.tenantRole}
                onChange={handleRoleChange}
              >
                {allowedRoles.includes("tenant_admin") ? (
                  <option value="tenant_admin">Tenant Admin</option>
                ) : null}
                {allowedRoles.includes("tenant_operator") ? (
                  <option value="tenant_operator">Tenant Operator</option>
                ) : null}
                {allowedRoles.includes("tenant_viewer") ? (
                  <option value="tenant_viewer">Tenant Viewer</option>
                ) : null}
              </select>
            </label>
            <label className="block text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                Workspace
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] text-muted-foreground"
                  title={workspaceTooltip}
                >
                  i
                </span>
              </span>
              <select
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                value={form.workspaceId}
                onChange={handleChange("workspaceId")}
              >
                <option value="">Selecione um workspace (opcional)</option>
                {availableWorkspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-muted-foreground">
              Opcional: preencha apenas se quiser fixar um workspace. Clique no (i) para ver a lista.
              {workspacesLoading ? " Carregando lista..." : null}
            </p>
            {workspacesError ? (
              <p className="text-xs text-rose-300">{workspacesError}</p>
            ) : null}
            <label className="block text-sm text-muted-foreground">
              Token (opcional)
              <input
                type="password"
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                placeholder="Bearer token"
                value={form.token}
                onChange={handleChange("token")}
              />
            </label>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-muted-foreground">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">
                Novo workspace
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Crie um novo espaço de trabalho dentro do tenant atual. O identificador técnico é
                interno ao sistema.
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
                    disabled={workspaceCreateState === "creating" || !isTenantAdmin}
                    title={
                      isTenantAdmin
                        ? undefined
                        : "Apenas Tenant Admin pode criar workspace."
                    }
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
                      {workspaceCreated.name}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      O workspace atual não foi alterado. Para usar o novo, selecione-o no perfil
                      ativo.
                    </p>
                  </div>
                )}
              </div>
            </div>
            <label className="block text-sm text-muted-foreground">
              Website
              <input
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                placeholder="https://empresa.com"
                value={form.website}
                onChange={handleChange("website")}
              />
            </label>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-muted-foreground">
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
                <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                  <p>Nenhuma assinatura ativa encontrada.</p>
                  <button
                    type="button"
                    onClick={() => navigate("/self-service")}
                    className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-white/10"
                  >
                    Assinar agentes
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
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

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            type="submit"
            className="rounded-full border border-white/10 bg-accent/20 px-6 py-2 text-sm font-semibold text-foreground transition hover:bg-accent/30"
          >
            Salvar perfil
          </button>
          {status === "saved" ? (
            <span className="text-sm text-emerald-300">Perfil atualizado.</span>
          ) : null}
          {status === "error" ? (
            <span className="text-sm text-red-300">
              {saveError ?? "Falha ao salvar. Tente novamente."}
            </span>
          ) : null}
        </div>
      </form>

      {isTenantAdmin ? (
        <div className="grid gap-6">
          <section className="rounded-3xl border border-white/10 bg-surface/70 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.35)]">
            <header className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent/80">
                Membros
              </p>
              <h2 className="text-xl font-semibold text-foreground">Convites e aprovações</h2>
              <p className="text-sm text-muted-foreground">
                Gerencie membros e acompanhe status.
              </p>
            </header>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                Convidar membro
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1.4fr,0.8fr,auto]">
                <input
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
                  placeholder="email@empresa.com"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
                <select
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
                  value={inviteRole}
                  onChange={(event) =>
                    setInviteRole(event.target.value as TenantMember["role"])
                  }
                >
                  <option value="TENANT_ADMIN">Admin</option>
                  <option value="TENANT_OPERATOR">Operador</option>
                  <option value="TENANT_VIEWER">Visualizador</option>
                </select>
                <button
                  type="button"
                  className="rounded-full border border-accent/40 bg-accent/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent transition hover:border-accent/70 hover:bg-accent/25 disabled:opacity-60"
                  onClick={handleInviteMember}
                  disabled={inviteStatus === "sending"}
                >
                  {inviteStatus === "sending" ? "Enviando..." : "Convidar"}
                </button>
              </div>
              {inviteError ? (
                <p className="mt-2 text-xs text-rose-300">{inviteError}</p>
              ) : null}
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-sm text-foreground">
                <thead className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Membro</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">funções</th>
                    <th className="py-2 pr-3">funções customizadas</th>
                    <th className="py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {membersLoading ? (
                    <tr>
                      <td className="py-3 text-muted-foreground" colSpan={5}>
                        Carregando membros...
                      </td>
                    </tr>
                  ) : membersError ? (
                    <tr>
                      <td className="py-3 text-rose-300" colSpan={5}>
                        {membersError}
                      </td>
                    </tr>
                  ) : members.length === 0 ? (
                    <tr>
                      <td className="py-3 text-muted-foreground" colSpan={5}>
                        Nenhum membro encontrado.
                      </td>
                    </tr>
                  ) : (
                    members.map((member) => {
                      const actionLoading = memberActionLoading[member.id];
                      return (
                        <tr key={member.id} className="border-t border-white/5">
                          <td className="py-3 pr-3">
                            <div className="font-semibold">
                              {member.displayName || member.email || member.userId}
                            </div>
                            <div className="text-xs text-muted-foreground">{member.email}</div>
                          </td>
                          <td className="py-3 pr-3">
                            <span className="pill bg-white/10 text-foreground">
                              {member.status}
                            </span>
                          </td>
                          <td className="py-3 pr-3">
                            <select
                              className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-foreground"
                              value={member.role}
                              onChange={(event) =>
                                handleMemberRoleChange(
                                  member,
                                  event.target.value as TenantMember["role"]
                                )
                              }
                              disabled={!!actionLoading}
                            >
                              <option value="TENANT_ADMIN"> Admin</option>
                              <option value="TENANT_OPERATOR">Operador</option>
                              <option value="TENANT_VIEWER">Visualizador</option>
                            </select>
                          </td>
                          <td className="py-3 pr-3">
                            <select
                              className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-foreground"
                              value={member.customRoleId ?? "system"}
                              onChange={(event) =>
                                handleMemberCustomRoleChange(member, event.target.value)
                              }
                              disabled={!!actionLoading}
                            >
                              <option value="system">Função do sistema</option>
                              {roles.map((role) => (
                                <option key={role.id} value={role.id}>
                                  {role.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              {member.status === "INVITED" || member.status === "PENDING" ? (
                                <>
                                  <button
                                    type="button"
                                    className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-60"
                                    onClick={() => handleMemberAction(member, "approve")}
                                    disabled={!!actionLoading}
                                  >
                                    Aprovar
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60"
                                    onClick={() => handleMemberAction(member, "reject")}
                                    disabled={!!actionLoading}
                                  >
                                    Rejeitar
                                  </button>
                                </>
                              ) : null}
                              {member.status === "ACTIVE" ? (
                                <button
                                  type="button"
                                  className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-60"
                                  onClick={() => handleMemberAction(member, "suspend")}
                                  disabled={!!actionLoading}
                                >
                                  Suspender
                                </button>
                              ) : null}
                              {member.status === "SUSPENDED" || member.status === "DISABLED" ? (
                                <button
                                  type="button"
                                  className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-accent transition hover:bg-accent/20 disabled:opacity-60"
                                  onClick={() => handleMemberAction(member, "activate")}
                                  disabled={!!actionLoading}
                                >
                                  Reativar
                                </button>
                              ) : null}
                            </div>
                            {memberActionError[member.id] ? (
                              <p className="mt-2 text-xs text-rose-300">
                                {memberActionError[member.id]}
                              </p>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-surface/70 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.35)]">
            <header className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent/80">
                funções
              </p>
              <h2 className="text-xl font-semibold text-foreground">funções customizadas</h2>
              <p className="text-sm text-muted-foreground">
                Crie funções específicas para o tenant e controle permissões granularmente.
              </p>
            </header>

            <div className="mt-6 space-y-3">
              <input
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
                placeholder="Nome da função"
                value={roleForm.name}
                onChange={(event) => setRoleForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <input
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
                placeholder="Descrição (opcional)"
                value={roleForm.description}
                onChange={(event) =>
                  setRoleForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <div className="relative inline-flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-1">
                      Sugestão: {suggestedRole?.label ?? "—"}
                    </span>
                    <button
                      type="button"
                      aria-label="Ver detalhes da sugestão"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-white/5 text-[10px] font-semibold text-muted-foreground transition hover:bg-white/10"
                      onClick={() => toggleRoleSuggestionPopover("create")}
                    >
                      i
                    </button>
                    {roleSuggestionPopoverKey === "create" ? (
                      <div className="absolute left-0 top-full z-20 mt-2 w-[min(28rem,90vw)] rounded-xl border border-white/15 bg-slate-950/95 p-3 text-xs text-foreground shadow-[0_16px_40px_rgba(2,6,23,0.55)]">
                        {suggestedRole ? (
                          <>
                            <p className="font-semibold">{suggestedRole.label}</p>
                            <p className="mt-1 text-muted-foreground">{suggestedRole.hint}</p>
                            <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                              {suggestedRole.permissions.map((permission) => (
                                <p key={permission}>{formatPermissionForB2B(permission)}</p>
                              ))}
                            </div>
                          </>
                        ) : (
                          <p className="text-muted-foreground">
                            Digite nome e descrição para receber sugestão automática de permissões.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                  {suggestedRole ? (
                    <button
                      type="button"
                      className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-white/10"
                      onClick={() =>
                        setRoleForm((prev) => ({ ...prev, permissions: suggestedRole.permissions.join(", ") }))
                      }
                    >
                      Usar sugestão
                    </button>
                  ) : null}
                </div>
                <input
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
                  placeholder="Permissões (separadas por vírgula) - opcional com sugestão automática"
                  value={roleForm.permissions}
                  onChange={(event) =>
                    setRoleForm((prev) => ({ ...prev, permissions: event.target.value }))
                  }
                />
                {suggestedRolePermissions ? (
                  <p className="text-[11px] text-muted-foreground">
                    Sugestão automática: {suggestedRolePermissions}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="rounded-full border border-accent/40 bg-accent/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent transition hover:border-accent/70 hover:bg-accent/25 disabled:opacity-60"
                  onClick={handleCreateRole}
                  disabled={roleCreateStatus === "saving"}
                >
                  {roleCreateStatus === "saving" ? "Salvando..." : "Criar funções"}
                </button>
              </div>
              {roleCreateError ? (
                <p className="text-xs text-rose-300">{roleCreateError}</p>
              ) : null}
            </div>

            <div className="mt-6 space-y-3">
              {rolesLoading ? (
                <p className="text-sm text-muted-foreground">Carregando funções...</p>
              ) : rolesError ? (
                <p className="text-sm text-rose-300">{rolesError}</p>
              ) : roles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma função customizada.</p>
              ) : (
                roles.map((role) => {
                  const isEditing = editingRoleId === role.id;
                  const permissions = (role.permissions ?? []).join(", ");
                  const roleSuggestion = resolveRoleSuggestion(role.name, role.description ?? "");
                  const roleSuggestionPopover = `role-${role.id}`;
                  return (
                    <div
                      key={role.id}
                      className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-foreground"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">{role.name}</p>
                            {roleSuggestion ? (
                              <div className="relative inline-flex items-center gap-2">
                                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                                  {roleSuggestion.label}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Ver detalhes da sugestão de ${role.name}`}
                                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-white/5 text-[10px] font-semibold text-muted-foreground transition hover:bg-white/10"
                                  onClick={() => toggleRoleSuggestionPopover(roleSuggestionPopover)}
                                >
                                  i
                                </button>
                                {roleSuggestionPopoverKey === roleSuggestionPopover ? (
                                  <div className="absolute left-0 top-full z-20 mt-2 w-[min(28rem,90vw)] rounded-xl border border-white/15 bg-slate-950/95 p-3 text-xs text-foreground shadow-[0_16px_40px_rgba(2,6,23,0.55)]">
                                    <p className="font-semibold">{roleSuggestion.label}</p>
                                    <p className="mt-1 text-muted-foreground">{roleSuggestion.hint}</p>
                                    <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                                      {roleSuggestion.permissions.map((permission) => (
                                        <p key={permission}>{formatPermissionForB2B(permission)}</p>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                          {role.description ? (
                            <p className="text-xs text-muted-foreground">{role.description}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-foreground transition hover:bg-white/10"
                            onClick={() => setEditingRoleId(isEditing ? null : role.id)}
                          >
                            {isEditing ? "Fechar" : "Editar"}
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-rose-200 transition hover:bg-rose-500/20"
                            onClick={() => handleDeleteRole(role)}
                            disabled={roleCreateStatus === "saving"}
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                      {isEditing ? (
                        <div className="mt-3 space-y-2">
                          <input
                            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-foreground"
                            defaultValue={permissions}
                            onBlur={(event) => handleUpdateRole(role, event.target.value)}
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Pressione fora do campo para salvar permissões.
                          </p>
                        </div>
                      ) : (
                        <div className="mt-3 text-xs text-muted-foreground">
                          Permissões: {permissions || "—"}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      ) : null}

      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-surface/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.5)]">
            <h3 className="text-lg font-semibold text-foreground">Excluir perfil</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Tem certeza? Esta ação remove o perfil salvo (não afeta o backend principal).
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-foreground transition hover:bg-white/10"
                onClick={() => setConfirmDelete(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-full border border-rose-400/40 bg-rose-500/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-rose-200 transition hover:bg-rose-500/25"
                onClick={handleDeleteProfile}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
