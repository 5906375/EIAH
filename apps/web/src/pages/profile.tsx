import React from "react";
import {
  apiCreateWorkspace,
  apiListDelegations,
  apiListMarketplace,
  type DelegationPolicy,
  type MarketplaceItem,
} from "@/lib/api";
import { useSession } from "@/state/sessionStore";

type ProfileState = {
  fullName: string;
  email: string;
  phone: string;
  cep: string;
  company: string;
  role: string;
  website: string;
  city: string;
  country: string;
};

const STORAGE_KEY = "eiah_profile";

const DEFAULT_STATE: ProfileState = {
  fullName: "",
  email: "",
  phone: "",
  cep: "",
  company: "",
  role: "",
  website: "",
  city: "",
  country: "",
};

function isDelegationActive(delegation?: DelegationPolicy | null) {
  if (!delegation?.validUntil) return false;
  const expiry = new Date(delegation.validUntil).getTime();
  return Number.isFinite(expiry) && expiry > Date.now();
}

function normalizeAgentKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function loadProfile(): ProfileState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<ProfileState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

export default function ProfilePage() {
  const [form, setForm] = React.useState<ProfileState>(() => loadProfile());
  const [status, setStatus] = React.useState<"idle" | "saved" | "error">("idle");
  const session = useSession();
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

  const handleChange =
    (field: keyof ProfileState) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
      }
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("error");
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
      prev.company === session.tenantId ? prev : { ...prev, company: session.tenantId }
    );
  }, [session.tenantId]);

  React.useEffect(() => {
    if (!session.token) {
      setSignedAgents([]);
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
                value={form.company}
                onChange={handleChange("company")}
              />
            </label>
            <label className="block text-sm text-muted-foreground">
              Workspace
              <input
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                placeholder="Workspace"
                value={session.workspaceId ?? "—"}
                readOnly
              />
            </label>
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
                      O workspace atual não foi alterado. Para usar o novo, atualize o workspaceId
                      na sessão.
                    </p>
                  </div>
                )}
              </div>
            </div>
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
            <span className="text-sm text-red-300">Falha ao salvar. Tente novamente.</span>
          ) : null}
        </div>
      </form>
    </div>
  );
}
