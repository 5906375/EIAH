import {
  ImobOperationalConsultContext,
  ImobOperationalResolverParams,
  ImobOperationalUpdateContext,
  OperationalResolution,
  ResolverHelpers,
} from "./imobCrmOperationalResolverShared";
import { resolveImobOwnerDelete } from "./imobCrmOperationalOwnerDelete";
import { resolveImobOwnerList } from "./imobCrmOperationalOwnerList";
import { resolveImobOwnerLookup } from "./imobCrmOperationalOwnerLookup";
import { resolveImobOwnerUpdate } from "./imobCrmOperationalOwnerUpdate";

export async function resolveImobOwnerOperationalUpdate(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  context: ImobOperationalUpdateContext,
): Promise<OperationalResolution | null> {
  return (
    await resolveImobOwnerUpdate(params, helpers, context)
    ?? await resolveImobOwnerDelete(params, helpers, context)
    ?? null
  );
}

export async function resolveImobOwnerOperationalConsult(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  context: ImobOperationalConsultContext,
): Promise<OperationalResolution | null> {
  return (
    await resolveImobOwnerList(params, helpers, context)
    ?? await resolveImobOwnerDelete(params, helpers, context)
    ?? await resolveImobOwnerLookup(params, helpers, context)
    ?? null
  );
}
