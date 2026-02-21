import React, { useEffect, useMemo, useState } from "react";
import {
  apiApproveRun,
  apiGetCockpitQueues,
  apiGetRunGovernance,
  apiListRunEvents,
  apiRealEstateDryRun,
  type CockpitQueueSnapshot,
  type Run,
} from "@/lib/api";

type CockpitPanelProps = {
  queuesEnabled: boolean;
  tenantId?: string | null;
  workspaceId?: string | null;
  selectedRun?: Run | null;
  className?: string;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function toYYYYMM(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function DryRunCard({
  tenantId,
  workspaceId,
}: {
  tenantId?: string | null;
  workspaceId?: string | null;
}) {
  const [period, setPeriod] = useState(toYYYYMM(new Date()));
  const [leaseId, setLeaseId] = useState("lease_demo");
  const [rentAmount, setRentAmount] = useState("2500");
  const [condoBaseAmount, setCondoBaseAmount] = useState("450");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    policyDecision?: { decision?: string; reason?: string | null; mode?: string };
    preview?: unknown;
    planHash?: string;
    diffHash?: string;
  } | null>(null);

  const canRun = Boolean(tenantId && workspaceId);

  const runDryRun = async () => {
    if (!canRun) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiRealEstateDryRun({
        period,
        nth: 6,
        reminderOffset: 2,
        leases: [
          {
            tenantId: String(tenantId),
            workspaceId: String(workspaceId),
            leaseId,
            period,
            dueRule: "BUSINESS_DAY_NTH=6",
            reminderOffsetBusinessDays: 2,
            rentAmount: Number(rentAmount || 0),
            condoBaseAmount: Number(condoBaseAmount || 0),
          },
        ],
      });
      setResult({
        policyDecision: response.policyDecision,
        preview: response.preview,
        planHash: response.planHash,
        diffHash: response.diffHash,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no dry-run.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">DryRun</h4>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          placeholder="YYYY-MM"
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-foreground"
        />
        <input
          value={leaseId}
          onChange={(e) => setLeaseId(e.target.value)}
          placeholder="leaseId"
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-foreground"
        />
        <input
          value={rentAmount}
          onChange={(e) => setRentAmount(e.target.value)}
          placeholder="Aluguel"
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-foreground"
        />
        <input
          value={condoBaseAmount}
          onChange={(e) => setCondoBaseAmount(e.target.value)}
          placeholder="Condomínio base"
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-foreground"
        />
      </div>
      <button
        type="button"
        onClick={runDryRun}
        disabled={!canRun || loading}
        className="mt-2 rounded-full border border-accent/50 bg-accent/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-accent disabled:opacity-60"
      >
        {loading ? "Executando..." : "Executar dry-run"}
      </button>
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
      {result ? (
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          <p>policyDecision: {result.policyDecision?.decision ?? "—"}</p>
          <p>planHash: {result.planHash ?? "—"}</p>
          <p>diffHash: {result.diffHash ?? "—"}</p>
          <pre className="max-h-28 overflow-auto rounded-lg bg-black/40 p-2 text-[11px] text-foreground/80">
            {JSON.stringify(result.preview ?? {}, null, 2)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}

function ApprovalsCard({ runId }: { runId?: string | null }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState<null | "approve" | "reject">(null);
  const [message, setMessage] = useState<string | null>(null);

  const submitDecision = async (decision: "APPROVED" | "REJECTED") => {
    if (!runId || loading) return;
    setLoading(decision === "APPROVED" ? "approve" : "reject");
    setMessage(null);
    try {
      const response = await apiApproveRun(runId, {
        decision,
        reason: reason.trim() || undefined,
        idempotency_key: `cockpit_${runId}_${decision.toLowerCase()}_${Date.now()}`,
      });
      setMessage(
        `${decision === "APPROVED" ? "Aprovado" : "Rejeitado"} · ${response.runState?.targetStatus ?? "ok"}`
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao decidir aprovação.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">Approvals</h4>
      <p className="mt-1 text-xs text-muted-foreground">Run: {runId ?? "—"}</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="reason (opcional)"
        className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-foreground"
        rows={2}
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={!runId || !!loading}
          onClick={() => submitDecision("APPROVED")}
          className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-300 disabled:opacity-60"
        >
          {loading === "approve" ? "Aprovando..." : "Approve"}
        </button>
        <button
          type="button"
          disabled={!runId || !!loading}
          onClick={() => submitDecision("REJECTED")}
          className="rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-rose-300 disabled:opacity-60"
        >
          {loading === "reject" ? "Rejeitando..." : "Reject"}
        </button>
      </div>
      {message ? <p className="mt-2 text-xs text-muted-foreground">{message}</p> : null}
    </section>
  );
}

function ReceiptsCard({ runId }: { runId?: string | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proofs, setProofs] = useState<Array<{ id: string; status: string; actionId: string }>>([]);
  const [auditIds, setAuditIds] = useState<string[]>([]);
  const [whatsappEvents, setWhatsappEvents] = useState<
    Array<{ id: string; type: string; messageId?: string | null; status?: string | null }>
  >([]);

  useEffect(() => {
    if (!runId) {
      setProofs([]);
      setAuditIds([]);
      setWhatsappEvents([]);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([apiGetRunGovernance(runId), apiListRunEvents(runId)])
      .then(([governance, events]) => {
        if (!active) return;
        const gov = governance as any;
        const nextProofs = Array.isArray(gov?.proofs)
          ? gov.proofs.map((item: any) => ({
              id: String(item.id),
              status: String(item.status ?? "unknown"),
              actionId: String(item.actionId ?? "—"),
            }))
          : [];
        const nextAudit = Array.isArray(gov?.evidence?.auditEventIds)
          ? gov.evidence.auditEventIds.map((id: unknown) => String(id))
          : [];
        const nextWhatsapp = (events.items ?? [])
          .filter((event: any) => String(event?.type ?? "").toLowerCase().includes("whatsapp"))
          .map((event: any) => ({
            id: String(event.id),
            type: String(event.type ?? "event"),
            messageId:
              typeof event?.payload?.messageId === "string" ? event.payload.messageId : null,
            status: typeof event?.payload?.status === "string" ? event.payload.status : null,
          }));
        setProofs(nextProofs);
        setAuditIds(nextAudit);
        setWhatsappEvents(nextWhatsapp);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Falha ao carregar receipts.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [runId]);

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">Receipts</h4>
      <p className="mt-1 text-xs text-muted-foreground">PoU + Ledger evidence + WhatsApp logs</p>
      {loading ? <p className="mt-2 text-xs text-muted-foreground">Carregando receipts...</p> : null}
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
      {!loading && !error ? (
        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
          <p>PoU: {proofs.length}</p>
          <p>Ledger evidence IDs: {auditIds.length}</p>
          <p>WhatsApp logs (run): {whatsappEvents.length}</p>
        </div>
      ) : null}
    </section>
  );
}

export default function CockpitPanel({
  queuesEnabled,
  tenantId,
  workspaceId,
  selectedRun,
  className,
}: CockpitPanelProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queues, setQueues] = useState<CockpitQueueSnapshot | null>(null);

  useEffect(() => {
    if (!queuesEnabled) return;
    let active = true;
    setLoading(true);
    setError(null);
    apiGetCockpitQueues({ limit: 20 })
      .then((response) => {
        if (!active) return;
        setQueues(response.data);
      })
      .catch((err) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Falha ao carregar filas do cockpit.";
        setError(message);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [queuesEnabled]);

  const summaryItems = useMemo(() => {
    return [
      { label: "Approvals pendentes", value: queues?.approvals.total ?? 0 },
      { label: "Reconcile pendente", value: queues?.reconcile.pending ?? 0 },
      { label: "Delegações expirando", value: queues?.expiringDelegations.total ?? 0 },
      { label: "WhatsApp failures", value: queues?.whatsappFailures.total ?? 0 },
    ];
  }, [queues]);

  return (
    <aside className={cn("glass-subtle p-4 sm:p-5", className)} data-testid="cockpit-panel">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent">Cockpit</p>
          <h3 className="text-sm font-semibold text-foreground">Queues</h3>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground transition hover:border-accent/40 hover:text-accent"
        >
          {collapsed ? "Expandir" : "Recolher"}
        </button>
      </div>

      {!collapsed ? (
        <div className="mt-4 space-y-3">
          {!queuesEnabled ? (
            <p className="text-xs text-muted-foreground">
              Filas desabilitadas (`COCKPIT_QUEUES_ENABLED=false`).
            </p>
          ) : null}
          {queuesEnabled && loading ? (
            <p className="text-xs text-muted-foreground">Carregando filas do cockpit...</p>
          ) : null}
          {queuesEnabled && error ? (
            <p className="text-xs text-red-300">{error}</p>
          ) : null}
          {queuesEnabled && !loading && !error ? (
            <ul className="space-y-2">
              {summaryItems.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                >
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <span className="text-sm font-semibold text-foreground">{item.value}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <DryRunCard tenantId={tenantId} workspaceId={workspaceId} />
          <ApprovalsCard runId={selectedRun?.id ?? null} />
          <ReceiptsCard runId={selectedRun?.id ?? null} />
        </div>
      ) : null}
    </aside>
  );
}
