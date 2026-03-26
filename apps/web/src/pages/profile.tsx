import React from "react";
import { useNavigate } from "react-router-dom";
import {
  apiCreateWorkspace,
  apiCreateWorkspaceInvitation,
  apiGetProfile,
  apiListHelpdeskSessions,
  apiDeleteSession,
  apiListAgents,
  apiListDelegations,
  apiSwitchWorkspaceSession,
  apiUpdateProfile,
  type HelpdeskSessionExport,
} from "@/lib/api";
import { clearSession, updateSession, useSession } from "@/state/sessionStore";

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
  const navigate = useNavigate();
  const [form, setForm] = React.useState<ProfileState>(DEFAULT_STATE);
  const [status, setStatus] = React.useState<"idle" | "saved" | "error">("idle");
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
  const [isSwitchingWorkspace, setIsSwitchingWorkspace] = React.useState(false);
  const [workspaceSwitchMessage, setWorkspaceSwitchMessage] = React.useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [signingOut, setSigningOut] = React.useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = React.useState<string | null>(null);
  const [delegationsStatus, setDelegationsStatus] = React.useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [delegationsError, setDelegationsError] = React.useState<string | null>(null);
  const [activeDelegations, setActiveDelegations] = React.useState<
    Array<{
      id: string;
      marketplaceId?: string | null;
      scope: string;
      trustMin: number;
      validUntil: string;
      publisherLabel: string;
      itemName: string;
    }>
  >([]);
  const [expiredDelegations, setExpiredDelegations] = React.useState<
    Array<{
      id: string;
      marketplaceId?: string | null;
      scope: string;
      trustMin: number;
      validUntil: string;
      publisherLabel: string;
      itemName: string;
    }>
  >([]);
  const [helpdeskExport, setHelpdeskExport] = React.useState<HelpdeskSessionExport | null>(null);
  const [helpdeskStatus, setHelpdeskStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [helpdeskError, setHelpdeskError] = React.useState<string | null>(null);

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
  }, []);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveErrorMessage(null);
    apiUpdateProfile({
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
    })
      .then((response) => {
        if (!response.ok || !response.data) {
          setStatus("error");
          return;
        }
        applyProfileData(response.data);
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 2500);
      })
      .catch(() => {
        setStatus("error");
        setSaveErrorMessage("Falha ao salvar perfil no backend. Tente novamente.");
      });
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
      setSaveErrorMessage("Falha ao salvar a nova função do workspace.");
      setStatus("error");
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
      const refreshed = await apiGetProfile();
      if (refreshed.ok && refreshed.data) {
        applyProfileData(refreshed.data);
      }
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

      const refreshed = await apiGetProfile();
      if (refreshed.ok && refreshed.data) {
        applyProfileData(refreshed.data);
        const selectedFromResponse = refreshed.data.workspaces.find((item) => item.id === workspace.id);
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
    apiGetProfile()
      .then((response) => {
        if (!active || !response.ok || !response.data) return;
        applyProfileData(response.data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setProfileLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applyProfileData, session.token]);

  React.useEffect(() => {
    if (!session.token) {
      setSignedAgents([]);
      return;
    }
    let active = true;
    setSignedAgentsLoading(true);
    setSignedAgentsError(null);
    apiListAgents()
      .then((response) => {
        if (!active) return;
        const unique = new Set<string>();
        (response.items ?? []).forEach((agent) => {
          const label = (agent.name ?? agent.id ?? "").trim();
          if (label) unique.add(label);
        });
        setSignedAgents([...unique]);
      })
      .catch((error) => {
        if (!active) return;
        const message =
          error instanceof Error
            ? error.message
            : "Falha ao carregar agentes do workspace ativo.";
        setSignedAgentsError(message);
        setSignedAgents([]);
      })
      .finally(() => {
        if (active) setSignedAgentsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session.token, session.tenantId, session.workspaceId]);

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
      setHelpdeskStatus("ready");
      setHelpdeskError(null);
      return;
    }

    let mounted = true;
    setHelpdeskStatus("loading");
    setHelpdeskError(null);

    apiListHelpdeskSessions({ workspaceId: session.workspaceId, limit: 200 })
      .then((response) => {
        if (!mounted) return;
        setHelpdeskExport(response.data);
        setHelpdeskStatus("ready");
      })
      .catch((error) => {
        if (!mounted) return;
        setHelpdeskStatus("error");
        setHelpdeskError(
          error instanceof Error ? error.message : "Falha ao carregar histórico UX do Chat Launcher."
        );
        setHelpdeskExport(null);
      });

    return () => {
      mounted = false;
    };
  }, [session.token, session.workspaceId]);

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
    const blob = new Blob([JSON.stringify(helpdeskExport, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chat-launcher-ux-${helpdeskExport.workspaceId}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handlePrintHelpdeskReport = () => {
    if (!helpdeskExport || typeof window === "undefined") return;
    const popup = window.open("", "_blank", "width=960,height=720");
    if (!popup) return;
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
      <header className="rounded-3xl border border-white/10 bg-gradient-to-r from-accent/10 via-surface/80 to-transparent p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-accent">Perfil</p>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">
              Cadastro completo do ambiente privado
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Preencha seus dados para personalizar o uso e facilitar suporte e faturamento.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground transition hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {signingOut ? "Saindo..." : "Sair da conta"}
          </button>
        </div>
      </header>

      <form
        className="rounded-3xl border border-white/10 bg-surface/70 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.35)]"
        onSubmit={handleSubmit}
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
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-muted-foreground">
            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">
              Workspaces vinculados
            </p>
            {linkedWorkspaces.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-foreground/85">
                {linkedWorkspaces.map((workspace) => (
                  <button
                    type="button"
                    key={workspace.id}
                    onClick={() => handleSelectWorkspace(workspace)}
                    disabled={isSwitchingWorkspace}
                    className={`pill ${workspace.isCurrent ? "bg-accent/20 text-accent" : "bg-white/10 text-foreground"}`}
                  >
                    {workspace.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Nenhum workspace vinculado encontrado.
              </p>
            )}
            {workspaceSwitchMessage ? (
              <p
                className={`mt-2 text-xs ${
                  workspaceSwitchMessage.type === "success" ? "text-emerald-300" : "text-rose-300"
                }`}
              >
                {workspaceSwitchMessage.text}
              </p>
            ) : null}
          </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-muted-foreground">
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
                      <div className="mt-3 space-y-2">
                        {workspaceMembers.map((member) => (
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
                    ) : (
                      <p className="mt-3 text-xs text-muted-foreground">Nenhum membro oficial encontrado neste workspace.</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#0a1527] p-3">
                    <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Convites pendentes</p>
                    {workspaceInvitations.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {workspaceInvitations.map((invitation) => {
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
                    ) : (
                      <p className="mt-3 text-xs text-muted-foreground">Nenhum convite pendente neste workspace.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-muted-foreground">
            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">
              Novo workspace
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
              <p className="mt-2 text-xs text-muted-foreground">Nenhuma assinatura ativa encontrada.</p>
            )}
          </div>
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
              {saveErrorMessage ?? "Falha ao salvar. Tente novamente."}
            </span>
          ) : null}
          {profileLoading ? (
            <span className="text-sm text-muted-foreground">Carregando perfil...</span>
          ) : null}
        </div>
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
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
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {activeDelegations.map((delegation) => (
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
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
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
                <div className="grid gap-3">
                  {helpdeskExport.groups.map((group) => {
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
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">
                Delegacoes expiradas
              </p>
              <span className="text-xs text-muted-foreground">
                {expiredDelegations.length} expirado(s)
              </span>
            </div>
            {delegationsStatus === "loading" ? (
              <p className="mt-3 text-sm text-muted-foreground">Carregando delegacoes...</p>
            ) : delegationsStatus === "error" ? (
              <p className="mt-3 text-sm text-rose-300">{delegationsError ?? "Falha ao carregar delegacoes."}</p>
            ) : expiredDelegations.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Nenhuma delegacao expirada encontrada.</p>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {expiredDelegations.map((delegation) => (
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
          </div>
        </div>
      </form>
    </div>
  );
}
