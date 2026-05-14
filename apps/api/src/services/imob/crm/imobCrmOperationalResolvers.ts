import { resolveImobCaseOperationalConsult } from "./imobCrmOperationalCase";
import { resolveImobLeadOperationalConsult, resolveImobLeadOperationalUpdate } from "./imobCrmOperationalLead";
import { resolveImobOwnerOperationalConsult, resolveImobOwnerOperationalUpdate } from "./imobCrmOperationalOwner";
import { resolveImobPropertyOperationalConsult, resolveImobPropertyOperationalUpdate } from "./imobCrmOperationalProperty";
import {
  ImobOperationalConsultContext,
  ImobOperationalResolverParams,
  ResolverHelpers,
} from "./imobCrmOperationalResolverShared";
import {
  buildGovernedImobOperationalConsultContext,
  buildGovernedImobOperationalUpdateContext,
} from "./imobCrmGovernedOperationalContext";

export type { ImobOperationalResolverParams } from "./imobCrmOperationalResolverShared";

export async function resolveImobOperationalUpdateImpl(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
) {
  const crmResolved = await helpers.resolveImobCrmOperationalUpdate(params);
  if (crmResolved) return crmResolved;

  const context = buildGovernedImobOperationalUpdateContext(params, helpers);
  return (
    await resolveImobOwnerOperationalUpdate(params, helpers, context)
    ?? await resolveImobLeadOperationalUpdate(params, helpers, context)
    ?? await resolveImobPropertyOperationalUpdate(params, helpers, context)
    ?? null
  );
}

export async function resolveImobOperationalConsultImpl(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
) {
  const crmResolved = await helpers.resolveImobCrmOperationalConsult(params);
  if (crmResolved) return crmResolved;

  const context: ImobOperationalConsultContext = buildGovernedImobOperationalConsultContext(params, helpers);
  if (!context.hasOperationalTarget || !context.hasOperationalAction) {
    return null;
  }

  return (
    await resolveImobCaseOperationalConsult(params, helpers, context)
    ?? await resolveImobLeadOperationalConsult(params, helpers, context)
    ?? await resolveImobOwnerOperationalConsult(params, helpers, context)
    ?? await resolveImobPropertyOperationalConsult(params, helpers, context)
    ?? null
  );
}
