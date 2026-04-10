function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function createEmptyImobCrmThreadState() {
  return {
    mode: "consult",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {
      goal: null,
      city: null,
      region: null,
      neighborhood: null,
      budgetMax: null,
      bedrooms: null,
      bathrooms: null,
      propertyType: null,
    },
    operational: null,
  } as any;
}

export function parseImobCrmThreadState(body: Record<string, unknown>) {
  const threadStateRaw = asObject(body.threadState);
  const threadSlotsRaw = asObject(threadStateRaw?.slots);
  const threadOperationalRaw = asObject(threadStateRaw?.operational);
  return threadStateRaw
    ? {
        mode: asString(threadStateRaw.mode) ?? "consult",
        pendingSlot: asString(threadStateRaw.pendingSlot) ?? "none",
        resultOffset: Number.isFinite(Number(threadStateRaw.resultOffset)) ? Number(threadStateRaw.resultOffset) : 0,
        slots: {
          goal: asString(threadSlotsRaw?.goal) === "locacao" || asString(threadSlotsRaw?.goal) === "venda" ? asString(threadSlotsRaw?.goal) : null,
          city: asString(threadSlotsRaw?.city),
          region: asString(threadSlotsRaw?.region),
          neighborhood: asString(threadSlotsRaw?.neighborhood),
          budgetMax: Number.isFinite(Number(threadSlotsRaw?.budgetMax)) ? Number(threadSlotsRaw?.budgetMax) : null,
          bedrooms: Number.isFinite(Number(threadSlotsRaw?.bedrooms)) ? Number(threadSlotsRaw?.bedrooms) : null,
          bathrooms: Number.isFinite(Number(threadSlotsRaw?.bathrooms)) ? Number(threadSlotsRaw?.bathrooms) : null,
          propertyType: asString(threadSlotsRaw?.propertyType),
        },
        operational: threadOperationalRaw ? (threadOperationalRaw as any) : null,
      }
    : null;
}
