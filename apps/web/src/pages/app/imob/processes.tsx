import React from "react";
import { Link } from "react-router-dom";
import { apiListRuns, type Run } from "@/lib/api";
import { useSession } from "@/state/sessionStore";

type ProcessRow = {
  runId: string;
  client: string;
  partner: string;
  action: string;
  status: string;
  risk: "low" | "medium" | "high";
  txId: string | null;
};

function humanActionLabel(action: string) {
  if (action.includes("realestate.schedule_visit_partner")) return "Agendar visita com parceiro";
  if (action.includes("realestate.create_contract")) return "Criar contrato";
  if (action.includes("realestate.release_commission")) return "Liberar comissão";
  if (action.includes("realestate.apply_adjustment")) return "Aplicar ajuste";
  if (action.includes("realestate.register_property")) return "Cadastrar imóvel";
  return "Operação imobiliária";
}

function humanStatusLabel(status: string) {
  if (status === "running") return "Em andamento";
  if (status === "pending") return "Em preparação";
  if (status === "success") return "Concluído";
  if (status === "blocked") return "Precisa de atenção";
  if (status === "error") return "Com problema";
  return "Atualizando";
}

function humanRiskLabel(risk: ProcessRow["risk"]) {
  if (risk === "high") return "Alto";
  if (risk === "medium") return "Médio";
  return "Baixo";
}

function humanProofLabel(process: ProcessRow) {
  if (process.txId) return "Comprovante";
  return "Comprovante pendente";
}

const syntheticProcesses: ProcessRow[] = [
  {
    runId: "run-imob-8421",
    client: "João Martins",
    partner: "Prime Imóveis",
    action: "realestate.schedule_visit_partner",
    status: "running",
    risk: "low",
    txId: null,
  },
  {
    runId: "run-imob-8422",
    client: "Marina Costa",
    partner: "Litoral Brokers",
    action: "realestate.create_contract",
    status: "blocked",
    risk: "high",
    txId: null,
  },
  {
    runId: "run-imob-8423",
    client: "Ricardo Nunes",
    partner: "Atlântica Realty",
    action: "realestate.release_commission",
    status: "success",
    risk: "medium",
    txId: "0x9fa2f2ab781",
  },
];

function mapRunToProcess(run: Run): ProcessRow {
  const request = (run.request && typeof run.request === "object" ? run.request : null) as Record<string, unknown> | null;
  const metadata = (run.meta && typeof run.meta === "object" ? run.meta : null) as Record<string, unknown> | null;
  const action = typeof request?.action === "string" ? request.action : run.agent;
  const partner = typeof request?.partnerName === "string" ? request.partnerName : "Rede EIAH";
  const client = typeof request?.clientName === "string" ? request.clientName : "Cliente da carteira";
  const risk: ProcessRow["risk"] = run.status === "blocked" || run.status === "error" ? "high" : run.status === "pending" ? "medium" : "low";

  return {
    runId: run.id,
    client,
    partner,
    action,
    status: run.status,
    risk,
    txId: run.txId ?? (typeof metadata?.txId === "string" ? metadata.txId : null),
  };
}

function statusTone(status: string) {
  if (status === "success") return "text-emerald-300 border-emerald-400/40";
  if (status === "blocked") return "text-rose-300 border-rose-400/40";
  if (status === "running") return "text-amber-200 border-amber-300/30";
  return "text-muted-foreground border-white/15";
}

const ImobProcessesPage: React.FC = () => {
  const session = useSession();
  const brandName = session.branding?.brandName?.trim() || "Tenant";
  const workspaceLabel = session.branding?.workspaceLabel?.trim() || session.workspaceId;
  const [processes, setProcesses] = React.useState<ProcessRow[]>(syntheticProcesses);
  const [source, setSource] = React.useState<"real" | "fallback">("fallback");
  const [loading, setLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    setLoading(true);
    setFetchError(null);

    void apiListRuns({ page: 1, size: 20, workspaceId: session.workspaceId })
      .then((response) => {
        if (!mounted) return;
        const mapped = (response.items ?? []).map(mapRunToProcess).filter((item) => {
          return item.action.includes("realestate.") || item.action.toLowerCase().includes("imob");
        });

        if (mapped.length > 0) {
          setProcesses(mapped);
          setSource("real");
        } else {
          setProcesses(syntheticProcesses);
          setSource("fallback");
        }
      })
      .catch((error) => {
        if (!mounted) return;
        setProcesses(syntheticProcesses);
        setSource("fallback");
        setFetchError(error instanceof Error ? error.message : "Falha ao buscar processos");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [session.workspaceId]);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-white/10 bg-gradient-to-r from-accent/10 via-surface/80 to-transparent p-8">
        <div className="mb-3">
          <Link
            to="/app/imob/chat"
            className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-foreground transition hover:border-accent/40"
          >
            Voltar
          </Link>
        </div>
        <p className="text-xs uppercase tracking-[0.35em] text-accent">IMOB</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Processos</h1>
        <p className="mt-2 text-sm text-muted-foreground">Acompanhe os casos em andamento, atenção necessária e comprovantes.</p>
        <p className="mt-3 text-xs uppercase tracking-[0.22em] text-muted-foreground/80">
          {brandName} • {workspaceLabel}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Processos ativos</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {processes.filter((item) => item.status === "running").length}
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Bloqueados</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {processes.filter((item) => item.status === "blocked").length}
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Com txId</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {processes.filter((item) => Boolean(item.txId)).length}
          </p>
        </article>
      </section>

      <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Fila de processos</h2>
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {loading ? "atualizando" : source === "real" ? "dados ao vivo" : "modo demonstração"}
          </span>
        </div>
        {fetchError ? <p className="mt-2 text-xs text-rose-200">Serviço temporariamente indisponível: {fetchError}</p> : null}

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <th className="px-3 py-2">Processo</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Parceiro</th>
                <th className="px-3 py-2">Etapa</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Risco</th>
                <th className="px-3 py-2">Comprovante</th>
              </tr>
            </thead>
            <tbody>
              {processes.map((item) => (
                <tr key={item.runId} className="border-b border-white/5 text-muted-foreground">
                  <td className="px-3 py-3 text-foreground">{item.runId}</td>
                  <td className="px-3 py-3">{item.client}</td>
                  <td className="px-3 py-3">{item.partner}</td>
                  <td className="px-3 py-3">{humanActionLabel(item.action)}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${statusTone(item.status)}`}>
                      {humanStatusLabel(item.status)}
                    </span>
                  </td>
                  <td className="px-3 py-3">{humanRiskLabel(item.risk)}</td>
                  <td className="px-3 py-3 text-xs">{humanProofLabel(item)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default ImobProcessesPage;
