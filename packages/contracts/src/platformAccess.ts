import { z } from "zod";

/** Context domains and products supported by the existing core entry workflow. */
export const sessionDomainSchema = z.enum(["core", "imob", "logistica"]);
export type SessionDomain = z.infer<typeof sessionDomainSchema>;
export const activatableProductSchema = z.enum(["IMOB", "LOGISTICA"]);
export type ActivatableProductId = z.infer<typeof activatableProductSchema>;
/** Context reading only; never a grant for Oráculo execution or PRE-DUIMP actions. */
export const LOGISTICA_CONTEXT_SCOPE = "log.context.read" as const;
export type LogisticaContextAccess = {
  allowed: boolean;
  mode: "context_only";
  usage: "full" | "read_only" | "blocked";
  executionAllowed: false;
  externalTransmissionAllowed: false;
  reason: "available" | "installation_missing" | "installation_inactive" | "approval_required"
    | "revoked" | "membership_required" | "policy_denied" | "unavailable";
};
