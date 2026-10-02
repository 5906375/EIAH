import React from "react";
import {
  ApiError,
  apiDecideVerticalApproval,
  apiErrorMessage,
  apiListVerticalApprovals,
  type VerticalApprovalAdminItem,
} from "@/lib/api";
import {
  APPROVAL_TABS,
  decidedByLabel,
  isAwaitingDecision,
  itemsForTab,
  noteRequired,
  recommendationLabel,
  STATUS_LABEL,
  type ApprovalTab,
} from "./verticalApprovalsView";

/**
 * ADR-011 §2.3: tela do administrador da plataforma EIAH. Mostra só os dados do pedido e os
 * sinais do score (nunca dados de negócio do cliente). A decisão é humana e o servidor valida
 * tudo de novo; para quem não é administrador a API responde 404 e a tela também.
 */

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR") : "—";
}

const RECOMMENDATION_TONE: Record<string, string> = {
  Recomendado: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  Revisar: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  "Não recomendado": "border-rose-400/40 bg-rose-400/10 text-rose-200",
  "Sem score": "border-white/15 bg-white/5 text-muted-foreground",
};

const ApprovalCard: React.FC<{
  item: VerticalApprovalAdminItem;
  onDecided: (message: string) => void;
}> = ({ item, onDecided }) => {
  const [note, setNote] = React.useState("");
  const [deciding, setDeciding] = React.useState<"aprovar" | "recusar" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const open = isAwaitingDecision(item);
  const recommendation = recommendationLabel(item);

  const decide = async (decision: "aprovar" | "recusar") => {
    setError(null);
    if (noteRequired(decision, item) && !note.trim()) {
      setError(
        decision === "recusar"
          ? "Escreva uma observação para recusar."
          : "Escreva uma observação: você está aprovando contra a recomendação do agente.",
      );
      return;
    }
    setDeciding(decision);
    try {
      await apiDecideVerticalApproval(item.id, { decision, note: note.trim() || undefined });
      onDecided(`${item.vertical} ${decision === "aprovar" ? "aprovado" : "recusado"} para ${item.tenantName} · ${item.workspaceName}.`);
    } catch (err) {
      setError(apiErrorMessage(err) ?? "Não foi possível registrar a decisão.");
    } finally {
      setDeciding(null);
    }
  };

  return (
    <article className="rounded-2xl border border-white/10 bg-surface/70 p-5" data-approval-id={item.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{item.vertical}</p>
          <h3 className="mt-1 text-base font-semibold text-foreground">
            {item.tenantName} · {item.workspaceName}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.source === "migration"
              ? "Já usava antes da liberação pela EIAH"
              : `Pedido por ${item.requestedBy ?? "—"} em ${formatDate(item.requestedAt)}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="rounded-full border border-white/15 bg-black/20 px-3 py-1 text-xs text-foreground">
            {STATUS_LABEL[item.status]}
          </span>
          <span className={`rounded-full border px-3 py-1 text-xs ${RECOMMENDATION_TONE[recommendation] ?? ""}`}>
            {item.score === null ? recommendation : `Score ${item.score} · ${recommendation}`}
          </span>
        </div>
      </div>

      {item.scoreReasons?.length ? (
        <ul className="mt-4 space-y-1 text-sm">
          {item.scoreReasons.map((reason) => (
            <li key={reason.rule} className="flex items-start gap-2">
              <span className={reason.maxPoints === 0 ? "text-muted-foreground" : reason.ok ? "text-emerald-300" : "text-rose-300"}>
                {reason.maxPoints === 0 ? "•" : reason.ok ? "✓" : "✗"}
              </span>
              <span className="text-foreground/90">
                {reason.message}
                {reason.maxPoints > 0 ? (
                  <span className="text-muted-foreground"> ({reason.points}/{reason.maxPoints})</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          {item.source === "migration" ? "Sem score: aprovado na migração." : "Sem score: os sinais de billing não puderam ser lidos."}
        </p>
      )}
      {item.scoreRuleVersion ? <p className="mt-2 text-[11px] text-muted-foreground">Regra: {item.scoreRuleVersion}</p> : null}

      {!open ? (
        <div className="mt-4 space-y-1 text-xs text-muted-foreground">
          <p>Decidido por {decidedByLabel(item.decidedBy) ?? "—"} em {formatDate(item.decidedAt)}</p>
          {item.note ? <p className="text-foreground/80">Observação: {item.note}</p> : null}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block text-xs text-muted-foreground">
            Observação {item.recommendation === "nao_recomendado" ? "(obrigatória para aprovar e para recusar)" : "(obrigatória para recusar)"}
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              maxLength={1000}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
              placeholder="Ex.: plano anual pago em 02/10"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={deciding !== null}
              onClick={() => void decide("aprovar")}
              className="rounded-full border border-emerald-400/60 bg-emerald-400/15 px-5 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/25 disabled:opacity-60"
            >
              {deciding === "aprovar" ? "Aprovando..." : "Aprovar"}
            </button>
            <button
              type="button"
              disabled={deciding !== null}
              onClick={() => void decide("recusar")}
              className="rounded-full border border-rose-400/60 bg-rose-400/10 px-5 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:opacity-60"
            >
              {deciding === "recusar" ? "Recusando..." : "Recusar"}
            </button>
          </div>
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        </div>
      )}
    </article>
  );
};

const VerticalApprovalsPage: React.FC = () => {
  const [items, setItems] = React.useState<VerticalApprovalAdminItem[]>([]);
  const [awaiting, setAwaiting] = React.useState(0);
  const [tab, setTab] = React.useState<ApprovalTab>("aguardando");
  const [state, setState] = React.useState<"loading" | "ready" | "not_found" | "error">("loading");
  const [notice, setNotice] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const response = await apiListVerticalApprovals();
      setItems(response.data.items);
      setAwaiting(response.data.awaiting);
      setState("ready");
    } catch (err) {
      setState(err instanceof ApiError && err.status === 404 ? "not_found" : "error");
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (state === "not_found") {
    return (
      <div className="rounded-3xl border border-white/10 bg-surface/70 p-8 text-sm text-muted-foreground">
        Página não encontrada.
      </div>
    );
  }

  const visible = itemsForTab(items, tab);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-white/10 bg-gradient-to-r from-accent/10 via-surface/80 to-transparent p-6">
        <p className="text-xs uppercase tracking-[0.35em] text-accent">Administração EIAH</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Liberação de verticais</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O agente verificador calcula o score e explica cada ponto; a decisão é sua. Nada é liberado sem aprovação humana.
        </p>
        <p className="mt-3 text-sm text-foreground">
          Aguardando decisão: <span className="font-semibold">{awaiting}</span>
        </p>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Filtros">
        {APPROVAL_TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${
              tab === entry.key ? "border-accent/60 bg-accent/20 text-accent" : "border-white/15 bg-white/5 text-foreground"
            }`}
          >
            {entry.label} ({itemsForTab(items, entry.key).length})
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm text-foreground transition hover:border-accent/40"
        >
          Atualizar
        </button>
      </nav>

      {notice ? <p className="text-sm text-emerald-300">{notice}</p> : null}
      {state === "loading" ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
      {state === "error" ? <p className="text-sm text-rose-300">Não foi possível carregar a fila de aprovações.</p> : null}
      {state === "ready" && visible.length === 0 ? <p className="text-sm text-muted-foreground">Nada aqui por enquanto.</p> : null}

      <section className="space-y-4">
        {visible.map((item) => (
          <ApprovalCard
            key={item.id}
            item={item}
            onDecided={(message) => {
              setNotice(message);
              void load();
            }}
          />
        ))}
      </section>
    </div>
  );
};

export default VerticalApprovalsPage;
