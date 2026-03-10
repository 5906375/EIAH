import React from "react";
import { useNavigate } from "react-router-dom";
import {
  apiCreateWorkspace,
  apiGetProfile,
  apiDeleteSession,
  apiListAgents,
  apiListDelegations,
  apiSwitchWorkspaceSession,
  apiUpdateProfile,
} from "@/lib/api";
import { clearSession, updateSession, useSession } from "@/state/sessionStore";

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

export default function ProfilePage() {
  const navigate = useNavigate();
  const [form, setForm] = React.useState<ProfileState>(DEFAULT_STATE);
  const [status, setStatus] = React.useState<"idle" | "saved" | "error">("idle");
  const session = useSession();
  const [profileLoading, setProfileLoading] = React.useState(true);
  const [tenantName, setTenantName] = React.useState("—");
  const [workspaceName, setWorkspaceName] = React.useState("—");
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

  const handleChange =
    (field: keyof ProfileState) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

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
    })
      .then((response) => {
        if (!response.ok || !response.data) {
          setStatus("error");
          return;
        }
        setForm({
          fullName: response.data.fullName,
          email: response.data.email,
          phone: response.data.phone,
          cep: response.data.cep,
          role: response.data.role,
          website: response.data.website,
          city: response.data.city,
          country: response.data.country,
        });
        setTenantName(response.data.tenant.name);
        setWorkspaceName(response.data.workspace.name);
        setLinkedWorkspaces(response.data.workspaces);
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 2500);
      })
      .catch(() => {
        setStatus("error");
        setSaveErrorMessage("Falha ao salvar perfil no backend. Tente novamente.");
      });
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
        setTenantName(refreshed.data.tenant.name);
        setWorkspaceName(refreshed.data.workspace.name);
        setLinkedWorkspaces(refreshed.data.workspaces);
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
        setTenantName(refreshed.data.tenant.name);
        const selectedFromResponse = refreshed.data.workspaces.find((item) => item.id === workspace.id);
        setWorkspaceName(selectedFromResponse?.name ?? workspace.name);
        setLinkedWorkspaces(refreshed.data.workspaces);
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
        setForm({
          fullName: response.data.fullName,
          email: response.data.email,
          phone: response.data.phone,
          cep: response.data.cep,
          role: response.data.role,
          website: response.data.website,
          city: response.data.city,
          country: response.data.country,
        });
        setTenantName(response.data.tenant.name);
        setWorkspaceName(response.data.workspace.name);
        setLinkedWorkspaces(response.data.workspaces);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setProfileLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session.token]);

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

  const formatDate = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("pt-BR");
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
              Cargo
              <input
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                placeholder="Seu cargo"
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
