import type { ImobCrmCanonicalCase, ImobCrmCaseContext } from "./imobCrmAgentContract";

type CaseContextRecord = {
  id: string;
  flow?: string | null;
  stage?: string | null;
  status?: string | null;
  ownerResponsible?: string | null;
  nextStep?: string | null;
  blockers?: unknown;
  pendingItems?: unknown;
  threadId?: string | null;
  updatedAt?: { toISOString?: () => string } | null;
  lead?: unknown;
  property?: unknown;
  owner?: unknown;
};

export function buildImobCrmCaseContextFromRecord(
  item: CaseContextRecord,
  buildCanonicalCase: (item: any) => ImobCrmCanonicalCase,
): ImobCrmCaseContext {
  return {
    caseId: item.id,
    flow: item.flow,
    stage: item.stage,
    status: item.status,
    ownerResponsible: item.ownerResponsible ?? null,
    nextStep: item.nextStep ?? null,
    blocker: Array.isArray(item.blockers) && item.blockers.length > 0 ? item.blockers[0] : null,
    pendingItems: Array.isArray(item.pendingItems) ? item.pendingItems : [],
    threadId: item.threadId ?? null,
    updatedAt: item.updatedAt?.toISOString?.() ?? null,
    lead: item.lead ?? null,
    property: item.property ?? null,
    owner: item.owner ?? null,
    canonical: buildCanonicalCase(item),
  };
}
