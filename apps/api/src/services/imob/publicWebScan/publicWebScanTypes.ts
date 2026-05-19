export type PublicWebManualListingInput = {
  sourceId: string;
  sourceUrlHash?: string | null;
  city: string;
  neighborhood?: string | null;
  goal: string;
  propertyType?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  garageSpots?: number | null;
  areaM2?: number | null;
  price?: number | null;
  condominium?: number | null;
  iptu?: number | null;
  title?: string | null;
  ownerName?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
};

export type PublicWebScanResult = {
  mode: "mock_manual";
  confidenceCap: number;
  disclosure: {
    coverage: "limited_public_web_sample";
    limitations: string[];
  };
  listings: PublicWebManualListingInput[];
  piiExcluded: true;
};

export type PublicWebScanSource = {
  listPublicListings(scope: {
    tenantId: string;
    workspaceId: string;
    city?: string | null;
    goal?: string | null;
    propertyType?: string | null;
  }): Promise<PublicWebManualListingInput[]> | PublicWebManualListingInput[];
};
