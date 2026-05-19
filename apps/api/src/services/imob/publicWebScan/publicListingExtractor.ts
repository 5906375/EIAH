import type { PublicWebManualListingInput } from "./publicWebScanTypes";

export function stripPublicListingPii(input: PublicWebManualListingInput): PublicWebManualListingInput {
  const {
    ownerName: _ownerName,
    phone: _phone,
    email: _email,
    whatsapp: _whatsapp,
    ...safe
  } = input;
  return safe;
}

export function extractManualPublicListings(input: PublicWebManualListingInput[]) {
  return input.map(stripPublicListingPii);
}
