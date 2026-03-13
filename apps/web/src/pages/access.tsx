import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  apiCreateSession,
  apiGetSessionContext,
  apiCreateWalletChallenge,
  apiLegacyLogin,
  apiOnboarding,
  apiSetLegacyPassword,
  apiWalletLogin,
} from "@/lib/api";
import { updateSession } from "@/state/sessionStore";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type PasswordForm = {
  email: string;
  password: string;
};

type NewPasswordForm = {
  email: string;
  newPassword: string;
  confirmPassword: string;
  token: string;
};

type SignupForm = {
  orgName: string;
  name: string;
  email: string;
};

export default function AccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextParam = searchParams.get("next") ?? "/app/runs";
  const nextPath = nextParam.startsWith("/") ? nextParam : "/app/runs";

  const [passwordForm, setPasswordForm] = React.useState<PasswordForm>({
    email: "",
    password: "",
  });
  const [walletAddress, setWalletAddress] = React.useState("");
  const [newPasswordForm, setNewPasswordForm] = React.useState<NewPasswordForm>({
    email: "",
    newPassword: "",
    confirmPassword: "",
    token: "",
  });
  const [signupForm, setSignupForm] = React.useState<SignupForm>({
    orgName: "",
    name: "",
    email: "",
  });
  const [authMode, setAuthMode] = React.useState<"login" | "signup">("login");
  const [recoveryMode, setRecoveryMode] = React.useState(false);
  const [status, setStatus] = React.useState<"idle" | "loading">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!newPasswordForm.email && passwordForm.email) {
      setNewPasswordForm((prev) => ({ ...prev, email: passwordForm.email }));
    }
  }, [passwordForm.email, newPasswordForm.email]);

  React.useEffect(() => {
    if (!signupForm.email && passwordForm.email) {
      setSignupForm((prev) => ({ ...prev, email: passwordForm.email }));
    }
  }, [passwordForm.email, signupForm.email]);

  const getEthereumProvider = () =>
    (
      window as typeof window & {
        ethereum?: EthereumProvider;
      }
    ).ethereum;

  const loginWithPayload = async (payload: {
    email?: string;
    password?: string;
    token?: string;
  }) => {
    setStatus("loading");
    setError(null);
    setSuccess(null);
    try {
      const response = await apiLegacyLogin(payload);
      if (!response.ok || !response.data) {
        throw new Error(response.error?.message ?? "Falha de autenticação.");
      }
      updateSession({
        tenantId: response.data.tenantId,
        workspaceId: response.data.workspaceId,
        userId: response.data.userId ?? undefined,
        token: response.data.token,
      });
      await apiCreateSession().catch(() => undefined);
      const context = await apiGetSessionContext().catch(() => null);
      if (context?.ok && context.data) {
        updateSession({
          activeDomain: context.data.activeDomain,
          availableDomains: context.data.availableDomains,
          entitlements: context.data.entitlements,
          installedProducts: (context.data.productInstallations ?? []).map((entry) => entry.product),
          roles: context.data.roles,
          branding: {
            brandName: context.data.branding.brandName,
            logoUrl: context.data.branding.logoUrl,
            primaryColor: context.data.branding.primaryColor,
            workspaceLabel: context.data.branding.workspaceLabel,
          },
        });
      }
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha de autenticação.");
    } finally {
      setStatus("idle");
    }
  };

  const handlePasswordLogin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (authMode === "signup") {
      if (!signupForm.orgName.trim() || !signupForm.name.trim() || !signupForm.email.trim()) {
        setError("Preencha empresa, nome e e-mail para cadastrar.");
        return;
      }
      setStatus("loading");
      void apiOnboarding({
        orgName: signupForm.orgName.trim(),
        name: signupForm.name.trim(),
        email: signupForm.email.trim(),
        mode: "provision",
      })
        .then(async (response) => {
          if (!response.ok || !response.data) {
            throw new Error(response.error?.message ?? "Falha ao criar conta.");
          }
          if (response.data.token) {
            updateSession({
              tenantId: response.data.tenantId,
              workspaceId: response.data.workspaceId,
              userId: response.data.userId,
              token: response.data.token,
            });
            await apiCreateSession().catch(() => undefined);
            const context = await apiGetSessionContext().catch(() => null);
            if (context?.ok && context.data) {
              updateSession({
                activeDomain: context.data.activeDomain,
                availableDomains: context.data.availableDomains,
                entitlements: context.data.entitlements,
                installedProducts: (context.data.productInstallations ?? []).map((entry) => entry.product),
                roles: context.data.roles,
                branding: {
                  brandName: context.data.branding.brandName,
                  logoUrl: context.data.branding.logoUrl,
                  primaryColor: context.data.branding.primaryColor,
                  workspaceLabel: context.data.branding.workspaceLabel,
                },
              });
            }
            navigate(nextPath, { replace: true });
            return;
          }
          setSuccess("Cadastro concluído. Faça login para continuar.");
          setAuthMode("login");
          setPasswordForm((prev) => ({ ...prev, email: signupForm.email.trim() }));
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Falha ao criar conta.");
        })
        .finally(() => {
          setStatus("idle");
        });
      return;
    }

    if (recoveryMode) {
      if (!newPasswordForm.email.trim()) {
        setError("Informe seu e-mail.");
        return;
      }
      if (!newPasswordForm.newPassword.trim() || !newPasswordForm.confirmPassword.trim()) {
        setError("Informe e confirme a nova senha.");
        return;
      }
      if (newPasswordForm.newPassword !== newPasswordForm.confirmPassword) {
        setError("A confirmação da senha não confere.");
        return;
      }
      setStatus("loading");
      void apiSetLegacyPassword({
        email: newPasswordForm.email.trim(),
        newPassword: newPasswordForm.newPassword,
        confirmPassword: newPasswordForm.confirmPassword,
        token: newPasswordForm.token.trim() || undefined,
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(response.error?.message ?? "Não foi possível atualizar a senha.");
          }
          setSuccess("Senha atualizada com sucesso. Faça login com a nova senha.");
          setRecoveryMode(false);
          setPasswordForm((prev) => ({ ...prev, email: newPasswordForm.email.trim(), password: "" }));
          setNewPasswordForm((prev) => ({
            ...prev,
            newPassword: "",
            confirmPassword: "",
            token: "",
          }));
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Não foi possível atualizar a senha.");
        })
        .finally(() => {
          setStatus("idle");
        });
      return;
    }

    if (!passwordForm.email.trim() || !passwordForm.password.trim()) {
      setError("Informe e-mail e senha.");
      return;
    }
    void loginWithPayload({
      email: passwordForm.email.trim(),
      password: passwordForm.password,
    });
  };

  const handleConnectWallet = async () => {
    const provider = getEthereumProvider();
    if (!provider) {
      setError("Carteira não encontrada. Instale MetaMask ou wallet compatível.");
      return;
    }
    setStatus("loading");
    setError(null);
    setSuccess(null);
    try {
      // Solicita permissão explícita para contas; MetaMask abre seletor quando necessário.
      await provider.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      }).catch(() => undefined);

      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      const first = accounts?.[0];
      if (!first) {
        throw new Error("Nenhuma carteira conectada.");
      }
      const normalizedAddress = first.trim().toLowerCase();
      setWalletAddress(normalizedAddress);

      const challenge = await apiCreateWalletChallenge({ address: normalizedAddress });
      if (!challenge.ok || !challenge.data) {
        throw new Error(challenge.error?.message ?? "Falha ao iniciar login por wallet.");
      }

      const signature = (await provider.request({
        method: "personal_sign",
        params: [challenge.data.message, normalizedAddress],
      })) as string;

      const response = await apiWalletLogin({
        address: normalizedAddress,
        challengeId: challenge.data.challengeId,
        signature,
      });
      if (!response.ok || !response.data) {
        throw new Error(response.error?.message ?? "Falha ao autenticar com wallet.");
      }

      updateSession({
        tenantId: response.data.tenantId,
        workspaceId: response.data.workspaceId,
        userId: response.data.userId ?? undefined,
        token: response.data.token,
      });
      await apiCreateSession().catch(() => undefined);
      const context = await apiGetSessionContext().catch(() => null);
      if (context?.ok && context.data) {
        updateSession({
          activeDomain: context.data.activeDomain,
          availableDomains: context.data.availableDomains,
          entitlements: context.data.entitlements,
          installedProducts: (context.data.productInstallations ?? []).map((entry) => entry.product),
          roles: context.data.roles,
          branding: {
            brandName: context.data.branding.brandName,
            logoUrl: context.data.branding.logoUrl,
            primaryColor: context.data.branding.primaryColor,
            workspaceLabel: context.data.branding.workspaceLabel,
          },
        });
      }
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao conectar ou autenticar com wallet.");
    } finally {
      setStatus("idle");
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8">
      <div className="grid justify-items-center gap-6">
        <form
          onSubmit={handlePasswordLogin}
          className="w-full rounded-3xl border border-white/10 bg-surface/70 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.35)] lg:w-[40vw]"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">EIAH Access</p>
          <div className="mt-4 inline-flex flex-wrap rounded-full border border-white/10 bg-black/30 p-1 text-xs">
            <button
              type="button"
              onClick={() => {
                setAuthMode("login");
                setRecoveryMode(false);
                setError(null);
                setSuccess(null);
              }}
              className={`rounded-full px-3 py-1 font-semibold transition ${
                authMode === "login" ? "bg-accent/25 text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode("signup");
                setRecoveryMode(false);
                setError(null);
                setSuccess(null);
                setSignupForm((prev) => ({ ...prev, email: passwordForm.email || prev.email }));
              }}
              className={`rounded-full px-3 py-1 font-semibold transition ${
                authMode === "signup"
                  ? "bg-accent/25 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Cadastrar
            </button>
            <button
              type="button"
              onClick={handleConnectWallet}
              disabled={status === "loading"}
              className="rounded-full px-3 py-1 font-semibold text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "loading" ? "Conectando..." : walletAddress ? "Wallet conectada" : "Wallet"}
            </button>
          </div>
          {walletAddress ? (
            <p className="mt-2 text-xs text-muted-foreground">Carteira: {walletAddress}</p>
          ) : null}

          {authMode === "signup" ? (
            <>
              <label className="mt-4 block text-sm text-muted-foreground">
                Empresa
                <input
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                  type="text"
                  placeholder="Nome da organização"
                  value={signupForm.orgName}
                  onChange={(event) =>
                    setSignupForm((prev) => ({ ...prev, orgName: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="mt-4 block text-sm text-muted-foreground">
                Nome
                <input
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                  type="text"
                  placeholder="Seu nome"
                  value={signupForm.name}
                  onChange={(event) => setSignupForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </label>
              <label className="mt-4 block text-sm text-muted-foreground">
                Email
                <input
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                  type="email"
                  placeholder="voce@empresa.com"
                  value={signupForm.email}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSignupForm((prev) => ({ ...prev, email: value }));
                    setPasswordForm((prev) => ({ ...prev, email: value }));
                    setNewPasswordForm((prev) => ({ ...prev, email: value }));
                  }}
                  required
                />
              </label>
            </>
          ) : (
            <>
          <label className="mt-4 block text-sm text-muted-foreground">
            Email
            <input
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
              type="email"
              placeholder="voce@empresa.com"
              value={passwordForm.email}
              onChange={(event) => {
                const value = event.target.value;
                setPasswordForm((prev) => ({ ...prev, email: value }));
                setNewPasswordForm((prev) => ({ ...prev, email: value }));
              }}
              required
            />
          </label>

          {recoveryMode ? (
            <>
              <label className="mt-4 block text-sm text-muted-foreground">
                Nova senha
                <input
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  value={newPasswordForm.newPassword}
                  onChange={(event) =>
                    setNewPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="mt-4 block text-sm text-muted-foreground">
                Confirmar nova senha
                <input
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                  type="password"
                  placeholder="Repita a nova senha"
                  value={newPasswordForm.confirmPassword}
                  onChange={(event) =>
                    setNewPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="mt-4 block text-sm text-muted-foreground">
                Token (opcional)
                <input
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-foreground"
                  type="text"
                  placeholder="tok_..."
                  value={newPasswordForm.token}
                  onChange={(event) =>
                    setNewPasswordForm((prev) => ({ ...prev, token: event.target.value }))
                  }
                />
              </label>
            </>
          ) : (
            <label className="mt-4 block text-sm text-muted-foreground">
              Senha
              <input
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
                type="password"
                placeholder="••••••••"
                value={passwordForm.password}
                onChange={(event) =>
                  setPasswordForm((prev) => ({ ...prev, password: event.target.value }))
                }
                required
              />
            </label>
          )}
            </>
          )}

          {authMode === "login" ? (
            <button
              type="button"
              className="mt-4 text-sm text-accent hover:text-accent/80"
              onClick={() => {
                setError(null);
                setSuccess(null);
                setRecoveryMode((prev) => !prev);
                setNewPasswordForm((prev) => ({
                  ...prev,
                  email: passwordForm.email || prev.email,
                  newPassword: "",
                  confirmPassword: "",
                  token: "",
                }));
              }}
            >
              {recoveryMode ? "Voltar para login" : "Esqueci minha senha"}
            </button>
          ) : null}
          <button
            type="submit"
            disabled={status === "loading"}
            className="mt-6 w-full rounded-full border border-white/10 bg-accent/20 px-5 py-2 text-sm font-semibold text-foreground transition hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "loading"
              ? authMode === "signup"
                ? "Criando conta..."
                : recoveryMode
                ? "Atualizando..."
                : "Entrando..."
              : authMode === "signup"
                ? "Criar conta"
                : recoveryMode
                  ? "Criar nova senha"
                  : "Entrar"}
          </button>
        </form>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {success}
        </div>
      ) : null}
    </div>
  );
}
