import { z } from "zod";
import { registerAction } from "@eiah/core";

// Phase 4.0 — Fail-closed stubs for all realestate.* action handlers.
// These handlers are explicit placeholders pending Phase 4.3 ImobPostRunMutationWorker.
// They return status="error" with retryable=false so the run-worker logs the gap
// clearly instead of throwing "Action not registered" at runtime.
//
// reasonCode: HANDLER_PENDING_PHASE_4_3
// Mutation: none. ImobCase.status is NOT changed by any of these stubs.
// Invariant: status decisions remain exclusively in the backend post-run worker.

const PENDING_PHASE = "HANDLER_PENDING_PHASE_4_3";

function pendingStub(actionName: string) {
  return async (): Promise<{ status: "error"; error: string; retryable: false; reasonCode: string }> => ({
    status: "error",
    error: `${actionName} handler not implemented (${PENDING_PHASE}) — pending Phase 4.3 ImobPostRunMutationWorker`,
    retryable: false,
    reasonCode: PENDING_PHASE,
  });
}

const caseIdBase = z.object({ caseId: z.string().min(1) });

export function registerRealestateActions() {
  registerAction({
    name: "realestate.register_property",
    description: "Register a property and its owner into an IMOB case. Governed capture action.",
    version: "1.0.0",
    criticality: "high",
    contract: {
      input: caseIdBase.extend({
        propertyId: z.string().min(1),
        address: z.string().min(5),
        ownerDocument: z.string().min(5),
        actionId: z.string().optional(),
        reasonCode: z.string().nullable().optional(),
      }),
      output: z.object({
        status: z.enum(["error"]),
        error: z.string(),
        retryable: z.literal(false),
        reasonCode: z.string(),
      }),
    },
    handler: pendingStub("realestate.register_property"),
  });

  registerAction({
    name: "realestate.activate_listing",
    description: "Activate a property listing on the configured channel. Operational (non-financial) action.",
    version: "1.0.0",
    criticality: "medium",
    contract: {
      input: caseIdBase.extend({
        propertyId: z.string().min(1),
        listingChannel: z.string().optional(),
        activateAt: z.string().datetime({ offset: true }).optional(),
        actionId: z.string().optional(),
        reasonCode: z.string().nullable().optional(),
      }),
      output: z.object({
        status: z.enum(["error"]),
        error: z.string(),
        retryable: z.literal(false),
        reasonCode: z.string(),
      }),
    },
    handler: pendingStub("realestate.activate_listing"),
  });

  registerAction({
    name: "realestate.qualify_lead",
    description: "Record lead qualification result for an IMOB case. Updates lead stage and pendingItems.",
    version: "1.0.0",
    criticality: "medium",
    contract: {
      input: caseIdBase.extend({
        leadId: z.string().min(1),
        qualificationNote: z.string().optional(),
        budgetCents: z.number().int().nonnegative().optional(),
        timeline: z.string().optional(),
        actionId: z.string().optional(),
        reasonCode: z.string().nullable().optional(),
      }),
      output: z.object({
        status: z.enum(["error"]),
        error: z.string(),
        retryable: z.literal(false),
        reasonCode: z.string(),
      }),
    },
    handler: pendingStub("realestate.qualify_lead"),
  });

  registerAction({
    name: "realestate.schedule_visit",
    description: "Schedule a property visit for a lead. Creates visit record linked to the IMOB case.",
    version: "1.0.0",
    criticality: "low",
    contract: {
      input: caseIdBase.extend({
        propertyId: z.string().min(1),
        scheduledAt: z.string().datetime({ offset: true }),
        leadId: z.string().optional(),
        visitNote: z.string().optional(),
        actionId: z.string().optional(),
        reasonCode: z.string().nullable().optional(),
      }),
      output: z.object({
        status: z.enum(["error"]),
        error: z.string(),
        retryable: z.literal(false),
        reasonCode: z.string(),
      }),
    },
    handler: pendingStub("realestate.schedule_visit"),
  });

  registerAction({
    name: "realestate.collect_documents",
    description: "Initiate document collection workflow for an IMOB case party.",
    version: "1.0.0",
    criticality: "medium",
    contract: {
      input: caseIdBase.extend({
        documentTypes: z.array(z.string()).optional(),
        partyId: z.string().optional(),
        deadline: z.string().datetime({ offset: true }).optional(),
        actionId: z.string().optional(),
        reasonCode: z.string().nullable().optional(),
      }),
      output: z.object({
        status: z.enum(["error"]),
        error: z.string(),
        retryable: z.literal(false),
        reasonCode: z.string(),
      }),
    },
    handler: pendingStub("realestate.collect_documents"),
  });

  registerAction({
    name: "realestate.review_deal",
    description: "Record deal review outcome for a proposal in an IMOB case. Governed action with txId.",
    version: "1.0.0",
    criticality: "high",
    contract: {
      input: caseIdBase.extend({
        dealId: z.string().min(1),
        proposalId: z.string().optional(),
        reviewNote: z.string().optional(),
        actionId: z.string().optional(),
        reasonCode: z.string().nullable().optional(),
      }),
      output: z.object({
        status: z.enum(["error"]),
        error: z.string(),
        retryable: z.literal(false),
        reasonCode: z.string(),
      }),
    },
    handler: pendingStub("realestate.review_deal"),
  });

  registerAction({
    name: "realestate.create_contract",
    description: "Prepare a real estate contract between parties. HIGH tier governed action.",
    version: "1.0.0",
    criticality: "high",
    contract: {
      input: caseIdBase.extend({
        propertyId: z.string().min(1),
        partyA: z.string().min(2),
        partyB: z.string().min(2),
        contractType: z.enum(["rent", "sale", "management"]),
        actionId: z.string().optional(),
        reasonCode: z.string().nullable().optional(),
      }),
      output: z.object({
        status: z.enum(["error"]),
        error: z.string(),
        retryable: z.literal(false),
        reasonCode: z.string(),
      }),
    },
    handler: pendingStub("realestate.create_contract"),
  });

  registerAction({
    name: "realestate.release_commission",
    description: "Release broker commission for a closed deal. HIGH tier financial action.",
    version: "1.0.0",
    criticality: "high",
    contract: {
      input: caseIdBase.extend({
        dealId: z.string().min(1),
        brokerId: z.string().min(1),
        amountCents: z.number().int().positive(),
        actionId: z.string().optional(),
        reasonCode: z.string().nullable().optional(),
      }),
      output: z.object({
        status: z.enum(["error"]),
        error: z.string(),
        retryable: z.literal(false),
        reasonCode: z.string(),
      }),
    },
    handler: pendingStub("realestate.release_commission"),
  });

  registerAction({
    name: "realestate.apply_adjustment",
    description: "Apply a financial adjustment (discount, fine, correction) to a property transaction. HIGH tier financial action. NOT for listing activation.",
    version: "1.2.0",
    criticality: "high",
    contract: {
      input: z.object({
        propertyId: z.string().min(1),
        adjustmentType: z.enum(["discount", "fine", "correction"]),
        amountCents: z.number().int().positive(),
        reason: z.string().min(3),
        actionId: z.string().optional(),
      }),
      output: z.object({
        status: z.enum(["error"]),
        error: z.string(),
        retryable: z.literal(false),
        reasonCode: z.string(),
      }),
    },
    handler: pendingStub("realestate.apply_adjustment"),
  });
}
