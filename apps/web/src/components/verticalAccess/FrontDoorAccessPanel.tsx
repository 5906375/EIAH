import React from "react";
import {
  apiCreateFrontDoorAccess,
  apiErrorMessage,
  apiGetFrontDoorAccessOptions,
  type FrontDoorAccessCreated,
  type FrontDoorAccessOptions,
} from "@/lib/api";
import { FRONT_DOOR_ACCESS_PANEL_ID } from "@/components/agents/frontDoorAccessEngine";

/**
 * ADR-011 §2.7: cartão "Criar acesso" dentro da conversa do front door. Só funciona para quem pode
 * (Founder, Gestor, Admin) em workspace com vertical liberada pela EIAH; o servidor valida tudo de
 * novo. O e-mail vai direto à API (nunca para o histórico) e o link aparece uma única vez, aqui.
 */
export const FrontDoorAccessPanel: React.FC = () => {
  const [options, setOptions] = React.useState<FrontDoorAccessOptions | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [open, setOpen] = React.useState(true);
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [roleKey, setRoleKey] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<FrontDoorAccessCreated | null>(null);
  const [copied, setCopied] = React.useState(false);
  const sectionRef = React.useRef<HTMLElement | null>(null);

  // O cartão carrega depois da mensagem: rola a conversa até ele (e até o link, quando aparece).
  React.useEffect(() => {
    if (!loaded) return;
    sectionRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [loaded, created]);

  React.useEffect(() => {
    let active = true;
    apiGetFrontDoorAccessOptions()
      .then((response) => {
        if (!active) return;
        setOptions(response.data);
        setRoleKey(response.data.roles.find((role) => role.key === "corretor")?.key ?? response.data.roles[0]?.key ?? "");
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!loaded) return <p className="text-xs text-muted-foreground">Carregando o cartão de acesso...</p>;
  if (!options?.allowed) {
    return (
      <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100" data-access-blocked>
        {options?.message ?? "Não foi possível abrir o cartão de acesso agora."}
      </p>
    );
  }

  const link = created && typeof window !== "undefined" ? `${window.location.origin}/access?invite=${encodeURIComponent(created.token)}` : "";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !roleKey) {
      setError("Informe o e-mail e a função.");
      return;
    }
    setBusy(true);
    try {
      const response = await apiCreateFrontDoorAccess({ email: email.trim(), fullName: fullName.trim() || undefined, roleKey });
      setCreated(response.data);
      setCopied(false);
      setEmail("");
      setFullName("");
    } catch (err) {
      setError(apiErrorMessage(err) ?? "Não foi possível criar o acesso.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const close = () => {
    setOpen(false);
    setCreated(null);
    setError(null);
  };

  return (
    <section ref={sectionRef} id={FRONT_DOOR_ACCESS_PANEL_ID} aria-label="Criar acesso">
      {!open ? (
        <p className="text-xs text-muted-foreground">Cartão fechado. Para criar outro acesso, peça "criar acesso" na conversa.</p>
      ) : (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-accent">Criar acesso</p>
            <p className="mt-1 text-xs text-muted-foreground">
              A pessoa recebe um link de uso único, válido por {options.expiresInHours} horas, e cria a própria senha. Quem já tem
              conta só entra no workspace.
            </p>
          </div>
          {created ? (
            <div className="space-y-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3" data-access-created>
              <p className="text-foreground">
                Acesso criado para {created.maskedEmail} ({created.roleLabel}).{" "}
                {created.accountExists ? "Esta pessoa já tem conta: o link só a adiciona ao workspace." : ""}
              </p>
              <p className="text-xs text-amber-200">Copie o link agora: ele aparece só esta vez. Um link novo para o mesmo e-mail invalida este.</p>
              <p className="break-all rounded-lg bg-black/30 px-3 py-2 font-mono text-xs text-foreground" data-access-link>
                {link}
              </p>
              <p className="text-xs text-muted-foreground">Válido até {new Date(created.expiresAt).toLocaleString("pt-BR")}.</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="rounded-full border border-emerald-400/60 bg-emerald-400/15 px-4 py-1.5 text-xs font-semibold text-emerald-200"
                >
                  {copied ? "Link copiado" : "Copiar link"}
                </button>
                <button type="button" onClick={() => setCreated(null)} className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs">
                  Criar outro
                </button>
                <button type="button" onClick={close} className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs">
                  Fechar
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs text-muted-foreground">
                Nome (opcional)
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  maxLength={160}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="block text-xs text-muted-foreground">
                E-mail
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="off"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="block text-xs text-muted-foreground">
                Função
                <select
                  value={roleKey}
                  onChange={(event) => setRoleKey(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
                >
                  {options.roles.map((role) => (
                    <option key={role.key} value={role.key}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-full border border-accent/60 bg-accent/20 px-5 py-2 text-sm font-semibold text-accent disabled:opacity-60"
                >
                  {busy ? "Criando..." : "Criar acesso e gerar link"}
                </button>
                <button type="button" onClick={close} className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm">
                  Cancelar
                </button>
                {error ? <p className="text-sm text-rose-300">{error}</p> : null}
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
};

export default FrontDoorAccessPanel;
