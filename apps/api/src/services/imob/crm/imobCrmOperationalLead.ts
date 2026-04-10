import {
  ImobOperationalConsultContext,
  ImobOperationalResolverParams,
  ImobOperationalUpdateContext,
  OperationalResolution,
  ResolverHelpers,
} from "./imobCrmOperationalResolverShared";
import { resolveImobLeadList } from "./imobCrmOperationalLeadList";
import { resolveImobLeadLookup } from "./imobCrmOperationalLeadLookup";
import { resolveImobLeadUpdate } from "./imobCrmOperationalLeadUpdate";

export async function resolveImobLeadOperationalUpdate(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  context: ImobOperationalUpdateContext,
): Promise<OperationalResolution | null> {
  return resolveImobLeadUpdate(params, helpers, context);
}

export async function resolveImobLeadOperationalConsult(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  context: ImobOperationalConsultContext,
): Promise<OperationalResolution | null> {
  const listResolution = await resolveImobLeadList(params, helpers, context);
  if (listResolution) return listResolution;
  return resolveImobLeadLookup(params, helpers, context);
}
