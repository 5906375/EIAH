import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { publishRun } from "@eiah/core";
import { enforceTenant } from "../middlewares/enforceTenant";
import type { TenantAwareRequest } from "../middlewares/enforceTenant";
import { getAgentProfile, listAgents, resolveAgentId } from "../services/agents";
import { prepareRunRequestAction, RunActionValidationError } from "../services/imob/control/imobRunActionCatalog";
import { createRunRecord } from "../services/runs";
import { emitRunEvent } from "../services/runEventEmitter";
import { WorkspaceAgentAssignmentError } from "../services/workspaceAgentAssignments";
import { evaluateTrustScore, trustScoreAllowsExecution } from "../services/trustScore";
import {
  buildPolicyNotFoundResponseBody,
  PolicyNotFoundError,
  resolveAllowedActionNames,
} from "./agentsPolicy";

export const agentsRouter = Router();
agentsRouter.use(enforceTenant);

const AGENT_PROTOCOL_VERSION = "agent-protocol.v1";
const DEFAULT_DOMAIN = "imob";

type ProtocolActionContract = {
  action: string;
  version: string;
  tier: "LOW" | "MEDIUM" | "HIGH";
  txIdRequired: boolean;
  inputSchema: Record<string, unknown>;
  receiptSchema: { specVersion: string };
  trustRequirements: {
    minTrustScore: number;
    requiresPoU: boolean;
  };
  defaultAgent: string;
};

const ACTION_CONTRACTS: Record<string, ProtocolActionContract> = {
  "realestate.apply_adjustment": {
    action: "realestate.apply_adjustment",
    version: "1.2.0",
    tier: "HIGH",
    txIdRequired: true,
    inputSchema: {
      type: "object",
      required: ["propertyId", "adjustmentType", "amountCents", "reason"],
      properties: {
        propertyId: { type: "string", minLength: 1 },
        adjustmentType: { type: "string", enum: ["discount", "fine", "correction"] },
        amountCents: { type: "integer", minimum: 1 },
        reason: { type: "string", minLength: 3 },
      },
      additionalProperties: true,
    },
    receiptSchema: { specVersion: "receipt.canon.v1" },
    trustRequirements: {
      minTrustScore: 60,
      requiresPoU: true,
    },
    defaultAgent: "fin-nexus",
  },
  "realestate.register_property": {
    action: "realestate.register_property",
    version: "1.0.0",
    tier: "HIGH",
    txIdRequired: true,
    inputSchema: {
      type: "object",
      required: ["propertyId", "address", "ownerDocument"],
      properties: {
        propertyId: { type: "string", minLength: 1 },
        address: { type: "string", minLength: 5 },
        ownerDocument: { type: "string", minLength: 5 },
      },
      additionalProperties: true,
    },
    receiptSchema: { specVersion: "receipt.canon.v1" },
    trustRequirements: {
      minTrustScore: 60,
      requiresPoU: true,
    },
    defaultAgent: "EIAH",
  },
  "realestate.create_contract": {
    action: "realestate.create_contract",
    version: "1.0.0",
    tier: "HIGH",
    txIdRequired: true,
    inputSchema: {
      type: "object",
      required: ["propertyId", "partyA", "partyB", "contractType"],
      properties: {
        propertyId: { type: "string", minLength: 1 },
        partyA: { type: "string", minLength: 2 },
        partyB: { type: "string", minLength: 2 },
        contractType: { type: "string", enum: ["rent", "sale", "management"] },
      },
      additionalProperties: true,
    },
    receiptSchema: { specVersion: "receipt.canon.v1" },
    trustRequirements: {
      minTrustScore: 60,
      requiresPoU: true,
    },
    defaultAgent: "J_360",
  },
  "realestate.release_commission": {
    action: "realestate.release_commission",
    version: "1.0.0",
    tier: "HIGH",
    txIdRequired: true,
    inputSchema: {
      type: "object",
      required: ["dealId", "brokerId", "amountCents"],
      properties: {
        dealId: { type: "string", minLength: 1 },
        brokerId: { type: "string", minLength: 1 },
        amountCents: { type: "integer", minimum: 1 },
      },
      additionalProperties: true,
    },
    receiptSchema: { specVersion: "receipt.canon.v1" },
    trustRequirements: {
      minTrustScore: 70,
      requiresPoU: true,
    },
    defaultAgent: "fin-nexus",
  },
};

const DiscoverySchema = z.object({
  domain: z.string().min(1).optional(),
  actions: z.array(z.string().min(1)).optional(),
});

const NegotiateSchema = z.object({
  domain: z.string().min(1).optional(),
  action: z.string().min(1),
  version: z.string().min(1).optional(),
});

const ExecuteSchema = z.object({
  domain: z.string().min(1).optional(),
  action: z.string().min(1),
  version: z.string().min(1).optional(),
  input: z.record(z.any()).optional(),
  prompt: z.string().min(1).optional(),
  metadata: z.record(z.any()).optional(),
  parentRunId: z.string().min(1).optional(),
});

function availableCatalog() {
  return Object.values(ACTION_CONTRACTS);
}

function normalizeActionName(action: string) {
  return action.trim().toLowerCase();
}

function createIntentSignature(params: { tenantId: string; workspaceId: string; runId: string }) {
  const secret = process.env.INTENT_SIGNATURE_SECRET;
  if (!secret) return null;
  const payload = `${params.tenantId}:${params.workspaceId}:${params.runId}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

async function resolveAllowedActions(req: TenantAwareRequest) {
  const tenantId = req.authContext!.tenantId;
  const workspaceId = req.authContext!.workspaceId;
  const dbPolicies = await req.prisma!.tenantActionPolicy.findMany({
    where: {
      tenantId,
      OR: [{ workspaceId }, { workspaceId: null }],
      allowed: true,
    },
    select: { actionName: true },
  });

  return resolveAllowedActionNames({
    tenantId,
    workspaceId,
    dbPolicies,
    catalogActions: Object.keys(ACTION_CONTRACTS),
  });
}

export function respondPolicyNotFound(req: TenantAwareRequest, res: Response) {
  req.logger?.warn(
    {
      event: "policy.not_found",
      tenantId: req.authContext?.tenantId ?? null,
      workspaceId: req.authContext?.workspaceId ?? null,
      reasonCode: "POLICY_NOT_FOUND",
    },
    "request.forbidden"
  );
  return res.status(403).json(buildPolicyNotFoundResponseBody());
}

export function createAgentsDiscoveryHandler(params?: {
  resolveAllowedActions?: typeof resolveAllowedActions;
}) {
  return async (req: Request, res: Response) => {
    const request = req as TenantAwareRequest;
    if (!request.authContext || !request.prisma) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }

    const parsed = DiscoverySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
      });
    }

    let allowed: Set<string>;
    try {
      allowed = await (params?.resolveAllowedActions ?? resolveAllowedActions)(request);
    } catch (error) {
      if (error instanceof PolicyNotFoundError) {
        return respondPolicyNotFound(request, res);
      }
      throw error;
    }
    const requested = new Set((parsed.data.actions ?? []).map(normalizeActionName));
    const actions = availableCatalog().filter((item) => {
      if (!allowed.has(item.action)) return false;
      if (requested.size > 0 && !requested.has(item.action)) return false;
      return true;
    });

    return res.json({
      ok: true,
      data: {
        protocolVersion: AGENT_PROTOCOL_VERSION,
        domain: parsed.data.domain ?? DEFAULT_DOMAIN,
        tenantId: request.authContext.tenantId,
        workspaceId: request.authContext.workspaceId,
        actions,
        discoveredAt: new Date().toISOString(),
      },
    });
  };
}

agentsRouter.post("/agents/discovery", createAgentsDiscoveryHandler());

agentsRouter.post("/agents/negotiate", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parsed = NegotiateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
    });
  }

  const actionName = normalizeActionName(parsed.data.action);
  const contract = ACTION_CONTRACTS[actionName];
  if (!contract) {
    return res.status(404).json({
      ok: false,
      error: { code: "ACTION_NOT_FOUND", message: `Action ${parsed.data.action} not found` },
    });
  }

  let allowed: Set<string>;
  try {
    allowed = await resolveAllowedActions(request);
  } catch (error) {
    if (error instanceof PolicyNotFoundError) {
      return respondPolicyNotFound(request, res);
    }
    throw error;
  }
  if (!allowed.has(actionName)) {
    return res.status(403).json({
      ok: false,
      error: { code: "ACTION_NOT_ALLOWED", message: `Action ${parsed.data.action} is not allowed for tenant` },
    });
  }

  if (parsed.data.version && parsed.data.version !== contract.version) {
    return res.status(409).json({
      ok: false,
      error: {
        code: "VERSION_NOT_NEGOTIABLE",
        message: `Requested ${parsed.data.version} but only ${contract.version} is available`,
      },
    });
  }

  return res.json({
    ok: true,
    data: {
      protocolVersion: AGENT_PROTOCOL_VERSION,
      domain: parsed.data.domain ?? DEFAULT_DOMAIN,
      contract,
      execution: {
        endpoint: "/api/agents/execute",
        method: "POST",
      },
      verification: {
        endpointTemplate: "/api/ledger/:txId",
        receiptSpecVersion: contract.receiptSchema.specVersion,
      },
      negotiatedAt: new Date().toISOString(),
    },
  });
});

agentsRouter.post("/agents/execute", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parsed = ExecuteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
    });
  }

  const actionName = normalizeActionName(parsed.data.action);
  const contract = ACTION_CONTRACTS[actionName];
  if (!contract) {
    return res.status(404).json({
      ok: false,
      error: { code: "ACTION_NOT_FOUND", message: `Action ${parsed.data.action} not found` },
    });
  }

  let allowed: Set<string>;
  try {
    allowed = await resolveAllowedActions(request);
  } catch (error) {
    if (error instanceof PolicyNotFoundError) {
      return respondPolicyNotFound(request, res);
    }
    throw error;
  }
  if (!allowed.has(actionName)) {
    return res.status(403).json({
      ok: false,
      error: { code: "ACTION_NOT_ALLOWED", message: `Action ${parsed.data.action} is not allowed for tenant` },
    });
  }

  if (parsed.data.version && parsed.data.version !== contract.version) {
    return res.status(409).json({
      ok: false,
      error: {
        code: "VERSION_NOT_NEGOTIABLE",
        message: `Requested ${parsed.data.version} but only ${contract.version} is available`,
      },
    });
  }

  const trust = await evaluateTrustScore(
    request.prisma,
    request.authContext.tenantId,
    request.authContext.workspaceId
  );
  if (!trustScoreAllowsExecution(trust)) {
    return res.status(403).json({
      ok: false,
      error: { code: "TRUST_BLOCKED", message: "Trust score too low" },
      trust,
    });
  }

  const executionInput = parsed.data.input ?? {};
  const defaultPrompt = `Execute ${actionName} with deterministic protocol contract ${contract.version}.`;
  const prompt = parsed.data.prompt?.trim() || defaultPrompt;
  const agent = contract.defaultAgent;
  const parentRunId = parsed.data.parentRunId?.trim() || null;
  if (parentRunId) {
    const parent = await request.prisma.run.findFirst({
      where: {
        id: parentRunId,
        tenantId: request.authContext.tenantId,
        workspaceId: request.authContext.workspaceId,
      },
      select: { id: true },
    });
    if (!parent) {
      return res.status(404).json({
        ok: false,
        error: { code: "PARENT_RUN_NOT_FOUND", message: `parentRunId ${parentRunId} not found in scope` },
      });
    }
  }
  const metadataBase = {
    ...(parsed.data.metadata ?? {}),
    protocol: AGENT_PROTOCOL_VERSION,
    domain: parsed.data.domain ?? DEFAULT_DOMAIN,
    action: actionName,
    tier: contract.tier,
    txIdRequired: contract.txIdRequired,
    contractVersion: contract.version,
    executionInput,
    ...(parentRunId ? { parentRunId } : {}),
  };
  const requestPayloadBase = { prompt, metadata: metadataBase };

  let run;
  try {
    run = await createRunRecord({
      prisma: request.prisma,
      tenantId: request.authContext.tenantId,
      workspaceId: request.authContext.workspaceId,
      userId: request.authContext.userId,
      agent,
      status: "pending",
      request: requestPayloadBase,
      traceId: null,
      finishedAt: null,
      requireCanonicalImobAction: metadataBase.domain === "imob",
    });
  } catch (error) {
    if (error instanceof WorkspaceAgentAssignmentError) {
      return res.status(403).json({
        ok: false,
        error: {
          code: error.reasonCode,
          reasonCode: error.reasonCode,
          message: error.message,
          context: error.context,
        },
      });
    }
    if (error instanceof RunActionValidationError) {
      return res.status(400).json({
        ok: false,
        error: {
          code: error.reasonCode,
          reasonCode: error.reasonCode,
          message: error.message,
          context: error.context,
        },
      });
    }
    throw error;
  }

  const intentSignature = createIntentSignature({
    tenantId: request.authContext.tenantId,
    workspaceId: request.authContext.workspaceId,
    runId: run.id,
  });
  const metadata = intentSignature
    ? { ...metadataBase, intentSignature }
    : metadataBase;
  if (intentSignature) {
    const preparedRequest = prepareRunRequestAction({
      request: { prompt, metadata },
      requireCanonicalImobAction: metadataBase.domain === "imob",
    });
    await request.prisma.run.update({
      where: {
        id: run.id,
        tenantId: request.authContext.tenantId,
        workspaceId: request.authContext.workspaceId,
      },
      data: {
        request: preparedRequest.request as Record<string, unknown>,
      },
    });
  }

  await emitRunEvent({
    prisma: request.prisma,
    runId: run.id,
    tenantId: request.authContext.tenantId,
    workspaceId: request.authContext.workspaceId,
    userId: request.authContext.userId,
    type: "run.requested",
    payload: {
      agent,
      metadata,
      protocolAction: actionName,
      parentRunId,
    },
  });

  await publishRun({
    runId: run.id,
    tenantId: request.authContext.tenantId,
    workspaceId: request.authContext.workspaceId,
    userId: request.authContext.userId,
    agent,
    prompt,
    metadata,
  });

  await emitRunEvent({
    prisma: request.prisma,
    runId: run.id,
    tenantId: request.authContext.tenantId,
    workspaceId: request.authContext.workspaceId,
    userId: request.authContext.userId,
    type: "run.enqueued",
    payload: {
      agent,
      metadata,
      protocolAction: actionName,
      parentRunId,
    },
  });

  return res.status(202).json({
    ok: true,
    data: {
      runId: run.id,
      status: "pending",
      action: actionName,
      version: contract.version,
      parentRunId,
      verify: {
        txId: contract.txIdRequired ? "required" : null,
        ledgerEndpointTemplate: "/api/ledger/:txId",
        runBundlePath: `/api/runs/${run.id}/bundle`,
      },
    },
  });
});

agentsRouter.get("/agents", async (_req, res) => {
  const req = _req as TenantAwareRequest;
  if (!req.authContext || !req.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const items = await listAgents(req.authContext.tenantId, req.authContext.workspaceId, req.prisma);
  return res.json({ items });
});

agentsRouter.get("/agents/:name", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const input = req.params.name;
  const resolved = resolveAgentId(input);
  const profile = await getAgentProfile(
    request.authContext.tenantId,
    request.authContext.workspaceId,
    resolved,
    request.prisma
  );

  if (!profile) {
    return res.status(404).json({ ok: false, error: { code: "AGENT_NOT_FOUND", message: `Agent ${input} was not found` } });
  }

  return res.json({ item: profile, resolvedAgentId: resolved });
});
