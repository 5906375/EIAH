function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

const INTERNAL_BROKER_LABELS = new Set([
  "corretor",
  "corretor não atribuído",
  "corretor nao atribuido",
  "jurídico",
  "juridico",
  "financeiro",
  "cliente",
  "imob ops",
  "imob-ops",
  "diretoria",
  "comercial",
  "captacao",
  "captação",
]);

export type ImobBrokerAssignmentSource =
  | "broker_canonical"
  | "owner_responsible_fallback"
  | "unassigned_internal";

export type ImobBrokerAssignmentResolution = {
  broker: string | null;
  assignmentSource: ImobBrokerAssignmentSource;
};

export function resolveImobBrokerAssignment(value: string | null | undefined): ImobBrokerAssignmentResolution {
  const raw = asString(value);
  if (!raw) {
    return {
      broker: null,
      assignmentSource: "unassigned_internal",
    };
  }
  if (INTERNAL_BROKER_LABELS.has(normalize(raw))) {
    return {
      broker: null,
      assignmentSource: "unassigned_internal",
    };
  }
  return {
    broker: raw,
    assignmentSource: "owner_responsible_fallback",
  };
}
