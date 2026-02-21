export * from "./dataAdapter";
export * from "./bundleManifest";
export * from "./legacyApiConnector";

import { callLegacyApi } from "./legacyApiConnector";
import { normalizeAndMaskResponse } from "./dataAdapter";

export type IntegrationRegistry = {
  legacyApi: {
    call: typeof callLegacyApi;
  };
  dataAdapter: {
    normalizeAndMask: typeof normalizeAndMaskResponse;
  };
};

export function registerIntegrations(): IntegrationRegistry {
  return {
    legacyApi: {
      call: callLegacyApi,
    },
    dataAdapter: {
      normalizeAndMask: normalizeAndMaskResponse,
    },
  };
}
