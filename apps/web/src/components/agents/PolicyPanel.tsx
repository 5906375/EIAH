import type { ConversationPolicy, ConversationStatus } from "@/hooks/useConversation";

type PolicyPanelProps = {
  intent?: string | null;
  policy?: ConversationPolicy | null;
  status?: ConversationStatus;
};

const STATUS_LABELS: Record<ConversationStatus, string> = {
  idle: "Aguardando intenção.",
  policy_ready: "Política pronta para execução.",
  awaiting_confirmation: "Aguardando confirmação humana.",
  executing: "Executando com governança ativa.",
};

export default function PolicyPanel({ intent, policy, status = "idle" }: PolicyPanelProps) {
  return (
    <div className="glass-subtle p-5">
      <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
        Políticas de acesso
      </h3>
      <div className="mt-3 space-y-2 text-xs text-muted-foreground">
        <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
          Status: {STATUS_LABELS[status]}
        </div>
        <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
          Intent: {intent ?? "não detectada"}
        </div>
        <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
          Scope: {policy?.scope ?? "não definido"}
        </div>
        <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
          Trust min: {typeof policy?.trustMin === "number" ? policy.trustMin : "—"}
        </div>
        <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
          Aprovação: {policy?.requiresConfirmation ? "necessária" : "não exigida"}
        </div>
        <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
          Ledger: {policy?.ledger ?? "guardrail_audit_ledger"}
        </div>
      </div>
    </div>
  );
}
