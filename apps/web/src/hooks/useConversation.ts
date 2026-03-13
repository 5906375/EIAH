import { useCallback, useMemo, useState } from "react";
import { useAgentExecution } from "@/hooks/useAgentExecution";

export type ConversationPolicy = {
  scope: string;
  trustMin: number;
  requiresConfirmation: boolean;
  ledger: string;
};

export type ConversationStatus = "idle" | "policy_ready" | "awaiting_confirmation" | "executing";

export type IntentResult = {
  intent: "help" | "proposal" | "product_explain" | "unknown";
  confidence: number;
  fallbackReason?: string;
};

type PolicyState = {
  intent: string | null;
  intentResult: IntentResult;
  policy: ConversationPolicy | null;
  status: ConversationStatus;
};

function detectIntent(message: string): IntentResult {
  const msg = message.toLowerCase();
  if (msg.includes("plano") || msg.includes("preco") || msg.includes("preço") || msg.includes("proposta")) {
    return { intent: "proposal", confidence: 0.8 };
  }
  if (msg.includes("o que e") || msg.includes("o que é") || msg.includes("como funciona")) {
    return { intent: "product_explain", confidence: 0.7 };
  }
  if (msg.includes("como") || msg.includes("ajuda") || msg.includes("suporte")) {
    return { intent: "help", confidence: 0.75 };
  }
  return {
    intent: "unknown",
    confidence: 0.4,
    fallbackReason: "low_confidence",
  };
}

function normalizePolicyIntent(text: string) {
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
  const [intentResult, setIntentResult] = useState<IntentResult>({
    intent: "unknown",
    confidence: 0,
  });
  const [status, setStatus] = useState<ConversationStatus>("idle");
  const [approved, setApproved] = useState(false);

  const policy = useMemo(() => resolvePolicy(intent), [intent]);

  const analyze = useCallback((message: string) => {
    const detected = detectIntent(message);
    const constrained: IntentResult =
      detected.confidence < 0.6
        ? {
            intent: "unknown",
            confidence: detected.confidence,
            fallbackReason: detected.fallbackReason ?? "low_confidence",
          }
        : detected;
    const nextPolicyIntent = normalizePolicyIntent(message);
    setIntent(nextPolicyIntent);
    setIntentResult(constrained);
    const nextPolicy = resolvePolicy(nextPolicyIntent);
    setApproved(false);
    if (nextPolicy?.requiresConfirmation) {
      setStatus("awaiting_confirmation");
    } else {
      setStatus(nextPolicyIntent ? "policy_ready" : "idle");
    }
    return constrained;
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
      intentResult,
      policy,
      status,
    }),
    [intent, intentResult, policy, status]
  );

  return {
    ...state,
    analyze,
    requestConfirmation,
    markApproved,
    executeWithPolicy,
  };
}
