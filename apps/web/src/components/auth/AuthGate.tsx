import React from "react";
import {
  apiAuthLogin,
  apiAuthLogout,
  apiAuthSelectProfile,
  apiAuthSiweNonce,
  apiAuthSiweVerify,
  apiGetAuthMe,
} from "@/lib/api";
import { resolveErrorMessage } from "@/lib/errorMessage";
import { clearSession, updateSession, useSession } from "@/state/sessionStore";
import { Link } from "react-router-dom";
import { SiweMessage } from "siwe";
import { createWalletClient, custom } from "viem";
import { mainnet } from "viem/chains";

type AuthProfile = {
  id: string;
  fullName?: string | null;
  role?: string | null;
  tenantId?: string | null;
  workspaceId?: string | null;
};

type AuthState =
  | { status: "checking" }
  | { status: "unauthenticated"; error?: string }
  | { status: "select_profile"; profiles: AuthProfile[]; error?: string }
  | { status: "authenticated"; role: string; permissions: string[] };

type LoginPayload = {
  email: string;
  password: string;
};

const DEFAULT_LOGIN: LoginPayload = {
  email: "",
  password: "",
};

function normalizeInput(value: string) {
  return value.trim();
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const [state, setState] = React.useState<AuthState>({ status: "checking" });
  const [login, setLogin] = React.useState<LoginPayload>(DEFAULT_LOGIN);
  const [submitting, setSubmitting] = React.useState(false);
  const [walletSubmitting, setWalletSubmitting] = React.useState(false);
  const [selectedProfileId, setSelectedProfileId] = React.useState("");

  const checkAuth = React.useCallback(async () => {
    setState({ status: "checking" });
    try {
      const response = await apiGetAuthMe();
      if (!response.ok) {
        setState({ status: "unauthenticated", error: "Sessão inválida." });
        return;
      }
      const profiles = response.data.profiles ?? [];
      if (!response.data.activeProfileId && profiles.length > 1) {
        setSelectedProfileId(profiles[0]?.id ?? "");
        setState({ status: "select_profile", profiles });
        return;
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem("eiah_profile_active_role", response.data.role ?? "");
      }
      setState({
        status: "authenticated",
        role: response.data.role,
        permissions: response.data.permissions ?? [],
      });
    } catch (error) {
      setState({
        status: "unauthenticated",
        error: resolveErrorMessage(error, "Falha ao autenticar."),
      });
    }
  }, []);

  React.useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const email = normalizeInput(login.email);
    const password = normalizeInput(login.password);
    if (!email || !password) {
      setState({ status: "unauthenticated", error: "Informe e-mail e senha." });
      return;
    }

    setSubmitting(true);
    setState({ status: "checking" });
    try {
      // Ensure previous cookie/session does not bleed into account switch.
      await apiAuthLogout().catch(() => undefined);
      clearSession();
      await apiAuthLogin({ email, password });
      const response = await apiGetAuthMe();
      if (!response.ok) {
        setState({ status: "unauthenticated", error: "Sessão inválida." });
        return;
      }
      const profiles = response.data.profiles ?? [];
      if (!response.data.activeProfileId && profiles.length > 1) {
        setSelectedProfileId(profiles[0]?.id ?? "");
        setState({ status: "select_profile", profiles });
        return;
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem("eiah_profile_active_role", response.data.role ?? "");
      }
      updateSession({
        tenantId: response.data.tenantId ?? session.tenantId,
        workspaceId: response.data.workspaceId ?? session.workspaceId,
        userId: response.data.userId ?? undefined,
      });
      setState({
        status: "authenticated",
        role: response.data.role,
        permissions: response.data.permissions ?? [],
      });
    } catch (error) {
      clearSession();
      setState({
        status: "unauthenticated",
        error: resolveErrorMessage(error, "Falha ao autenticar."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    void apiAuthLogout().catch(() => undefined);
    clearSession();
    setLogin(DEFAULT_LOGIN);
    setState({ status: "unauthenticated" });
  };

  const handleWalletLogin = async () => {
    if (walletSubmitting) return;
    if (typeof window === "undefined" || !(window as any).ethereum) {
      setState({ status: "unauthenticated", error: "MetaMask não encontrada no navegador." });
      return;
    }

    setWalletSubmitting(true);
    setState({ status: "checking" });
    try {
      // Ensure previous cookie/session does not bleed into account switch.
      await apiAuthLogout().catch(() => undefined);
      clearSession();
      const walletClient = createWalletClient({
        chain: mainnet,
        transport: custom((window as any).ethereum),
      });
      const [address] = await walletClient.requestAddresses();
      if (!address) {
        setState({ status: "unauthenticated", error: "Carteira não selecionada." });
        return;
      }
      const chainId = await walletClient.getChainId();
      const nonceResponse = await apiAuthSiweNonce(address);
      const nonce = nonceResponse.data?.nonce;
      if (!nonce) {
        setState({ status: "unauthenticated", error: "Falha ao gerar nonce." });
        return;
      }

      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to EIAH.",
        uri: window.location.origin,
        version: "1",
        chainId,
        nonce,
      });
      const preparedMessage = message.prepareMessage();
      const signature = await walletClient.signMessage({
        account: address,
        message: preparedMessage,
      });

      await apiAuthSiweVerify({ message: preparedMessage, signature });
      const response = await apiGetAuthMe();
      if (!response.ok) {
        setState({ status: "unauthenticated", error: "Sessão inválida." });
        return;
      }
      const profiles = response.data.profiles ?? [];
      if (!response.data.activeProfileId && profiles.length > 1) {
        setSelectedProfileId(profiles[0]?.id ?? "");
        setState({ status: "select_profile", profiles });
        return;
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem("eiah_profile_active_role", response.data.role ?? "");
      }
      updateSession({
        tenantId: response.data.tenantId ?? session.tenantId,
        workspaceId: response.data.workspaceId ?? session.workspaceId,
        userId: response.data.userId ?? undefined,
      });
      setState({
        status: "authenticated",
        role: response.data.role,
        permissions: response.data.permissions ?? [],
      });
    } catch (error) {
      clearSession();
      setState({
        status: "unauthenticated",
        error: resolveErrorMessage(error, "Falha ao autenticar."),
      });
    } finally {
      setWalletSubmitting(false);
    }
  };

  const handleSelectProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProfileId) {
      setState((prev) =>
        prev.status === "select_profile"
          ? { ...prev, error: "Selecione um perfil." }
          : prev
      );
      return;
    }
    setSubmitting(true);
    setState({ status: "checking" });
    try {
      await apiAuthSelectProfile(selectedProfileId);
      const response = await apiGetAuthMe();
      if (!response.ok) {
        setState({ status: "unauthenticated", error: "Sessão inválida." });
        return;
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem("eiah_profile_active_role", response.data.role ?? "");
      }
      updateSession({
        tenantId: response.data.tenantId ?? session.tenantId,
        workspaceId: response.data.workspaceId ?? session.workspaceId,
        userId: response.data.userId ?? undefined,
      });
      setState({
        status: "authenticated",
        role: response.data.role,
        permissions: response.data.permissions ?? [],
      });
    } catch (error) {
      setState({
        status: "unauthenticated",
        error: resolveErrorMessage(error, "Falha ao autenticar."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (state.status === "authenticated") {
    return (
      <div className="relative">
        <div className="pointer-events-none absolute right-6 top-6 z-10 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground">
          {state.role}
        </div>
        <button
          onClick={handleLogout}
          className="absolute right-6 top-14 z-10 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground transition hover:border-accent/60 hover:text-foreground"
        >
          Sair
        </button>
        {children}
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-hero-grid" />
      <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-60 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-16">
        <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-surface/80 p-8 shadow-[0_40px_120px_rgba(3,10,30,0.45)] backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">
                EIAH ACCESS
              </p>
              <h1 className="mt-3 text-2xl font-semibold text-foreground">
                Autenticação necessária
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Entre com seu e-mail e senha.
              </p>
            </div>
          </div>

          {state.status === "select_profile" ? (
            <form className="mt-6 space-y-4" onSubmit={handleSelectProfile}>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Selecione o perfil
                </label>
                <select
                  value={selectedProfileId}
                  onChange={(event) => setSelectedProfileId(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent/60"
                >
                  {state.profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.fullName || profile.role || profile.id}
                    </option>
                  ))}
                </select>
              </div>

              {state.error ? (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
                  {state.error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent transition hover:border-accent/70 hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? "Aplicando perfil..." : "Continuar"}
              </button>
            </form>
          ) : (
            <>
              <form className="mt-6 space-y-4" onSubmit={handleLogin}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-muted-foreground">
                      E-mail
                    </label>
                    <input
                      value={login.email}
                      onChange={(event) =>
                        setLogin((prev) => ({ ...prev, email: event.target.value }))
                      }
                      placeholder="voce@empresa.com"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent/60"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Senha
                    </label>
                    <input
                      type="password"
                      value={login.password}
                      onChange={(event) =>
                        setLogin((prev) => ({ ...prev, password: event.target.value }))
                      }
                      placeholder="********"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent/60"
                    />
                  </div>
                </div>

                {state.status === "unauthenticated" && state.error ? (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
                    {state.error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent transition hover:border-accent/70 hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? "Validando acesso..." : "Entrar"}
                </button>
                <Link
                  to="/signup"
                  className="mt-2 inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-foreground transition hover:border-accent/60 hover:bg-white/10"
                >
                  Cadastrar
                </Link>
              </form>

              <div className="mt-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
                  ou
                </span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <button
                type="button"
                onClick={handleWalletLogin}
                disabled={walletSubmitting}
                className="mt-5 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-foreground transition hover:border-accent/60 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {walletSubmitting ? "Conectando carteira..." : "Conectar Carteira"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
