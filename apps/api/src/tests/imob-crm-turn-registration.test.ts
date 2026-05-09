import test from "node:test";
import assert from "node:assert/strict";
import { applyExistingRegistrationResolution } from "../services/imob/crm/imobCrmTurnRegistration";

function createHelpers() {
  return {
    asObject: (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null),
    asString: (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null),
    normalizeImobRouteText: (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(),
    cloneImobResolvedTurn: <T>(value: T) => structuredClone(value),
    setImobFormFieldValues: (form: any, values: Record<string, unknown>) => ({ ...(form ?? {}), values: { ...(form?.values ?? {}), ...values } }),
    createEmptyThreadState: () => ({ mode: "consult", pendingSlot: "none", resultOffset: 0, slots: {} }),
  };
}

function createPendingOwnerDedupeTurn() {
  return {
    mode: "execute",
    action: "crm.from-resolve-turn",
    conversationState: {
      mode: "consult",
      pendingSlot: "none",
      resultOffset: 0,
      slots: {},
      operational: {
        flow: "owner.create",
        status: "awaiting_dedupe_decision",
        pendingFields: ["ownerDocument"],
        ownerDraft: {
          ownerName: "Proprietario",
          ownerPhone: "47999990000",
          ownerEmail: "prop@example.com",
          ownerDocument: null,
        },
        dedupeDecision: {
          status: "pending",
          flow: "owner.create",
          entityType: "owner",
          entityId: "owner-1",
          entityLabel: "Proprietario",
        },
      },
    },
    presentation: {
      text: "seguir com novo cadastro",
    },
  } as any;
}

test("IMOB_CRM registration resolution bypasses owner dedupe after explicit create-new choice", async () => {
  const helpers = createHelpers();
  const resolved = await applyExistingRegistrationResolution({
    prisma: {},
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "criar novo proprietário Proprietario",
    resolved: createPendingOwnerDedupeTurn(),
    helpers,
  });

  assert.equal((resolved as any).conversationState?.operational?.status, "collecting");
  assert.equal((resolved as any).conversationState?.operational?.dedupeDecision?.status, "resolved");
  assert.equal((resolved as any).presentation?.text, "seguir com novo cadastro");
});

for (const message of [
  "criar um novo proprietário Proprietario",
  "novo cadastro Proprietario",
]) {
  test(`IMOB_CRM registration resolution bypasses owner dedupe for variant: ${message}`, async () => {
    const helpers = createHelpers();
    const resolved = await applyExistingRegistrationResolution({
      prisma: {},
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      message,
      resolved: createPendingOwnerDedupeTurn(),
      helpers,
    });

    assert.equal((resolved as any).conversationState?.operational?.status, "collecting");
    assert.equal((resolved as any).conversationState?.operational?.dedupeDecision?.status, "resolved");
  });
}
