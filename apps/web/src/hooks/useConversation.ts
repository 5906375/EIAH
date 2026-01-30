import { useCallback, useMemo, useState } from "react";
import { useAgentExecution } from "@/hooks/useAgentExecution";

export type ConversationPolicy = {
  scope: string;
  trustMin: number;
  requiresConfirmation: boolean;
  ledger: string;
};

export type ConversationStatus = "idle" | "policy_ready" | "awaiting_confirmation" | "executing";

type PolicyState = {
  intent: string | null;
  policy: ConversationPolicy | null;
  status: ConversationStatus;
};

function normalizeIntent(text: string) {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.includes("marketplace") || trimmed.includes("plano")) {
    return "atualizar plano";
  }
  if (trimmed.includes("aprovar") || trimmed.includes("aprovacao")) {
    return "aprovar execucao";
  }
  return "consulta";
}

function resolvePolicy(intent: string | null): ConversationPolicy | null {
  if (!intent) return null;
  if (intent === "atualizar plano") {
    return {
      scope: "market:plan.write",
      trustMin: 85,
      requiresConfirmation: true,
      ledger: "guardrail_audit_ledger",
    };
  }
  return {
    scope: "market:read",
    trustMin: 0,
    requiresConfirmation: false,
    ledger: "guardrail_audit_ledger",
  };
}

export function useConversation() {
  const { executeAgent } = useAgentExecution();
  const [intent, setIntent] = useState<string | null>(null);
  const [status, setStatus] = useState<ConversationStatus>("idle");
  const [approved, setApproved] = useState(false);

  const policy = useMemo(() => resolvePolicy(intent), [intent]);

  const analyze = useCallback((message: string) => {
    const nextIntent = normalizeIntent(message);
    setIntent(nextIntent);
    const nextPolicy = resolvePolicy(nextIntent);
    setApproved(false);
    if (nextPolicy?.requiresConfirmation) {
      setStatus("awaiting_confirmation");
    } else {
      setStatus(nextIntent ? "policy_ready" : "idle");
    }
    return nextIntent;
  }, []);

  const requestConfirmation = useCallback(() => {
    setStatus("awaiting_confirmation");
  }, []);

  const markApproved = useCallback(() => {
    setApproved(true);
    setStatus("policy_ready");
  }, []);

  const executeWithPolicy = useCallback(
    async (agentId: string, payload: { agent?: string; prompt: string; workspaceId?: string; metadata?: Record<string, unknown> }) => {
      setStatus("executing");
      const response = await executeAgent(agentId, payload);
      if (policy?.requiresConfirmation && !approved) {
        setStatus("awaiting_confirmation");
      } else {
        setStatus("policy_ready");
      }
      return response;
    },
    [executeAgent, policy, approved]
  );

  const state: PolicyState = useMemo(
    () => ({
      intent,
      policy,
      status,
    }),
    [intent, policy, status]
  );

  return {
    ...state,
    analyze,
    requestConfirmation,
    markApproved,
    executeWithPolicy,
  };
}
