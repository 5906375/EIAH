import {
  ImobOperationalConsultContext,
  ImobOperationalResolverParams,
  ImobOperationalUpdateContext,
  OperationalResolution,
  ResolverHelpers,
} from "./imobCrmOperationalResolverShared";
import { resolveImobPropertyDelete } from "./imobCrmOperationalPropertyDelete";
import { resolveImobPropertyLookup } from "./imobCrmOperationalPropertyLookup";
import { resolveImobPropertyList } from "./imobCrmOperationalPropertyList";
import { resolveImobPropertyUpdate } from "./imobCrmOperationalPropertyUpdate";

export async function resolveImobPropertyOperationalUpdate(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  context: ImobOperationalUpdateContext,
): Promise<OperationalResolution | null> {
  return (
    await resolveImobPropertyUpdate(params, helpers, context)
    ?? await resolveImobPropertyDelete(params, helpers, context)
    ?? null
  );
}

export async function resolveImobPropertyOperationalConsult(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  context: ImobOperationalConsultContext,
): Promise<OperationalResolution | null> {
  const listResolution = await resolveImobPropertyList(params, helpers, context);
  if (listResolution) return listResolution;

  return (
    await resolveImobPropertyDelete(params, helpers, context)
    ?? await resolveImobPropertyLookup(params, helpers, context)
    ?? null
  );
}
