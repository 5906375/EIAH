// Compatibility facade for legacy IMOB_CRM operational fallback behavior.
// The implementation lives in imobCrmLegacyResolverCompat.ts while the main runtime
// already runs through turn-engine, business-read and operational modules.

export {
  resolveImobCrmOperationalConsult,
  resolveImobCrmOperationalUpdate,
} from "./imobCrmLegacyResolverCompat";
