function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : null;
}

function asNonEmptyString(input: unknown): string | null {
  return typeof input === "string" && input.trim().length > 0 ? input.trim() : null;
}

function normalizeKey(input: string) {
  return input.trim().toLowerCase();
}

const IMOB_RUN_ACTION_ALIASES = new Map<string, string>([
  ["owner.create", "owner.create"],
  ["realestate.owner.create", "owner.create"],
  ["property.create", "property.create"],
  ["realestate.register_property", "property.create"],
  ["property.market_scan", "property.market_scan"],
  ["property_market_scan", "property.market_scan"],
  ["realestate.market_scan", "property.market_scan"],
  ["crm.market_scan.offer", "property.market_scan"],
  ["listing.activate", "listing.activate"],
  ["realestate.activate_listing", "listing.activate"],
  ["lead.qualify", "lead.qualify"],
  ["realestate.lead.qualify", "lead.qualify"],
  ["lead.qualify.discovery", "lead.qualify"],
  ["visit.schedule", "visit.schedule"],
  ["documents.collect", "documents.collect"],
  ["realestate.collect_documents", "documents.collect"],
  ["proposal.create", "proposal.create"],
  ["deal.review", "deal.review"],
  ["realestate.review_deal", "deal.review"],
  ["contract.prepare", "contract.prepare"],
  ["realestate.create_contract", "contract.prepare"],
  ["commission.settle", "commission.settle"],
  ["realestate.release_commission", "commission.settle"],
  ["rules.configure", "rules.configure"],
  ["realestate.configure_property_rules", "rules.configure"],
  ["adjustment.apply", "adjustment.apply"],
  ["realestate.apply_adjustment", "adjustment.apply"],
  ["property.link_owner", "property.link_owner"],
  ["case.review", "case.review"],
]);

const IMOB_ACTION_OPTIONAL_KINDS = new Set([
  "conversation_audit",
]);

export class RunActionValidationError extends Error {
  readonly reasonCode = "INVALID_ACTION_TYPE";

  constructor(
    message: string,
    readonly context: {
      attemptedAction: string | null;
      domain: string | null;
      kind: string | null;
    },
  ) {
    super(message);
    this.name = "RunActionValidationError";
  }
}

export function normalizeImobRunAction(input: string | null | undefined) {
  if (!input) return null;
  return IMOB_RUN_ACTION_ALIASES.get(normalizeKey(input)) ?? null;
}

export function prepareRunRequestAction(params: {
  request: unknown;
  requireCanonicalImobAction?: boolean;
}) {
  const root = asRecord(params.request);
  if (!root) {
    if (params.requireCanonicalImobAction) {
      throw new RunActionValidationError("IMOB run requires a valid request.action payload.", {
        attemptedAction: null,
        domain: null,
        kind: null,
      });
    }
    return {
      request: params.request,
      action: null,
      domain: null,
      kind: null,
    };
  }

  const metadata = asRecord(root.metadata);
  const domain = normalizeKey(asNonEmptyString(root.domain) ?? asNonEmptyString(metadata?.domain) ?? "");
  const kind = asNonEmptyString(root.kind) ?? asNonEmptyString(metadata?.kind);
  const rawAction = asNonEmptyString(root.action) ?? asNonEmptyString(metadata?.action);
  const canonicalAction = normalizeImobRunAction(rawAction);
  const isImobDomain = domain === "imob";
  const actionOptional = kind ? IMOB_ACTION_OPTIONAL_KINDS.has(kind) : false;

  if (canonicalAction) {
    return {
      request: {
        ...root,
        action: canonicalAction,
      },
      action: canonicalAction,
      domain: domain || null,
      kind,
    };
  }

  if (params.requireCanonicalImobAction && isImobDomain && !actionOptional) {
    throw new RunActionValidationError("IMOB run requires a valid canonical request.action.", {
      attemptedAction: rawAction,
      domain: domain || null,
      kind,
    });
  }

  return {
    request: params.request,
    action: null,
    domain: domain || null,
    kind,
  };
}
