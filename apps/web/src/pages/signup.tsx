import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiOnboarding } from "@/lib/api";
import { updateSession } from "@/state/sessionStore";

type FormState = {
  orgName: string;
  name: string;
  email: string;
};

export default function SignupPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = React.useState<FormState>({
    orgName: "",
    name: "",
    email: "",
  });
  const [status, setStatus] = React.useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const marketplaceId = searchParams.get("marketplaceId") ?? undefined;
  const nextParam = searchParams.get("next") ?? "/self-service";
  const nextPath = nextParam.startsWith("/") ? nextParam : "/self-service";

  const handleChange = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const submitOnboarding = async (mode: "provision" | "register_only") => {
    if (!form.orgName || !form.name || !form.email) {
      setStatus("error");
      setError("Preencha todos os campos.");
      return;
    }

    setStatus("loading");
    setError(null);
    setSuccess(null);
    try {
      const response = await apiOnboarding({
        orgName: form.orgName,
        name: form.name,
        email: form.email,
        marketplaceId,
        mode,
      });
      if (!response.ok || !response.data) {
        throw new Error(response.error?.message ?? "Falha ao criar conta.");
      }

      if (mode === "provision" && response.data.token) {
        updateSession({
          tenantId: response.data.tenantId,
          workspaceId: response.data.workspaceId,
          userId: response.data.userId,
          token: response.data.token,
        });
        navigate(nextPath);
      } else {
        setSuccess("Cadastro recebido. Você podera assinar agentes quando desejar.");
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Falha ao criar conta.");
    } finally {
      setStatus("idle");
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitOnboarding("provision");
  };

  return (
    <div className="mx-auto w-full max-w-xl rounded-3xl border border-white/10 bg-surface/70 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.35)]">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <p className="text-xs uppercase tracking-[0.35em] text-accent">Onboarding EIAH</p>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-sm text-muted-foreground"
          >
            &lt; voltar
          </button>
        </div>
        <h1 className="text-2xl font-semibold text-foreground">
          Criar conta e provisionar equipes internas
        </h1>
        <p className="text-sm text-muted-foreground">
          Em segundos você tera um ambiente privado com times, filiais, projetos e agentes.
          
        </p>
      </header>

      {marketplaceId ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-muted-foreground">
          Esta assinatura sera vinculada ao item do marketplace selecionado.
        </div>
      ) : null}

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm text-muted-foreground">
          Empresa
          <input
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
            placeholder="Nome da organização"
            value={form.orgName}
            onChange={handleChange("orgName")}
            required
          />
        </label>

        <label className="block text-sm text-muted-foreground">
          Nome
          <input
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-base text-foreground"
            placeholder="Seu nome"
            value={form.name}
            onChange={handleChange("name")}
            required
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
            required
          />
        </label>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-300">{success}</p> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-full border border-white/10 bg-accent/20 px-5 py-2 text-sm font-semibold text-foreground transition hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "loading" ? "Provisionando..." : "Criar conta"}
          </button>
          <button
            type="button"
            disabled={status === "loading"}
            onClick={() => submitOnboarding("register_only")}
            className="w-full rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-semibold text-foreground transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Registrar apenas
          </button>
        </div>
      </form>
    </div>
  );
}
