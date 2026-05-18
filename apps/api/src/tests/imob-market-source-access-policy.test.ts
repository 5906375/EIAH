import test from "node:test";
import assert from "node:assert/strict";

import { decideSourceAccess } from "../services/imob/marketScan/sourceAccessPolicyGate";
import type { MarketSourceRegistryEntry } from "../services/imob/marketScan/marketSourceRegistry";

test("source access gate allows authorized internal CRM with tenant/workspace scope", () => {
  const decision = decideSourceAccess({
    sourceId: "internal_crm",
    requestedMode: "internal_crm",
    operation: "market_scan_region",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.decision, "allowed_authorized");
  if (decision.allowed) {
    assert.equal(decision.accessMode, "internal_crm");
    assert.equal(decision.termsMode, "accepted");
    assert.equal(decision.piiPolicy, "mask");
  }
});

test("source access gate blocks before fetch when tenant or workspace scope is missing", () => {
  const missingTenant = decideSourceAccess({
    sourceId: "internal_crm",
    requestedMode: "internal_crm",
    operation: "market_scan_region",
    workspaceId: "workspace-A",
  });
  const missingWorkspace = decideSourceAccess({
    sourceId: "internal_crm",
    requestedMode: "internal_crm",
    operation: "market_scan_region",
    tenantId: "tenant-A",
  });

  assert.equal(missingTenant.allowed, false);
  assert.equal(missingTenant.reasonCode, "TENANT_SCOPE_REQUIRED");
  assert.equal(missingWorkspace.allowed, false);
  assert.equal(missingWorkspace.reasonCode, "WORKSPACE_SCOPE_REQUIRED");
});

test("source access gate blocks terms, operation and tenant credential failures fail-closed", () => {
  const registry: MarketSourceRegistryEntry[] = [
    {
      sourceId: "zap_feed",
      provider: "Grupo OLX",
      accessMode: "partner_feed",
      status: "enabled",
      termsAccepted: false,
      requiresTenantCredential: true,
      allowedOperations: ["compare_properties"],
      piiPolicy: "mask",
      rateLimitProfile: "standard",
      confidenceCap: 0.95,
    },
  ];

  const terms = decideSourceAccess({
    sourceId: "zap_feed",
    requestedMode: "partner_feed",
    operation: "market_scan_region",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    registry,
  });
  assert.equal(terms.allowed, false);
  assert.equal(terms.reasonCode, "SOURCE_TERMS_NOT_ACCEPTED");

  registry[0] = { ...registry[0]!, termsAccepted: true };
  const operation = decideSourceAccess({
    sourceId: "zap_feed",
    requestedMode: "partner_feed",
    operation: "market_scan_region",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    registry,
  });
  assert.equal(operation.allowed, false);
  assert.equal(operation.reasonCode, "OPERATION_NOT_ALLOWED");

  registry[0] = { ...registry[0]!, allowedOperations: ["market_scan_region"] };
  const credential = decideSourceAccess({
    sourceId: "zap_feed",
    requestedMode: "partner_feed",
    operation: "market_scan_region",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    registry,
  });
  assert.equal(credential.allowed, false);
  assert.equal(credential.reasonCode, "TENANT_CREDENTIAL_REQUIRED");
});

test("source access gate allows limited public web assisted and blocks risky collection", () => {
  const allowed = decideSourceAccess({
    sourceId: "public_web_assisted",
    requestedMode: "public_web_assisted",
    operation: "public_web_assisted_scan",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    requestedPages: 3,
    requestedResultsPerSource: 8,
  });

  assert.equal(allowed.allowed, true);
  assert.equal(allowed.decision, "allowed_public_assisted");
  if (allowed.allowed) {
    assert.equal(allowed.confidenceCap, 0.55);
    assert.equal(allowed.piiPolicy, "exclude");
    assert.equal(allowed.rateLimitProfile, "strict");
  }

  const login = decideSourceAccess({
    sourceId: "public_web_assisted",
    requestedMode: "public_web_assisted",
    operation: "public_web_assisted_scan",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    requiresLogin: true,
  });
  assert.equal(login.allowed, false);
  assert.equal(login.reasonCode, "LOGIN_REQUIRED_SOURCE");

  const pii = decideSourceAccess({
    sourceId: "public_web_assisted",
    requestedMode: "public_web_assisted",
    operation: "public_web_assisted_scan",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    collectsPii: true,
  });
  assert.equal(pii.allowed, false);
  assert.equal(pii.reasonCode, "PII_EXPOSURE_RISK");

  const bulk = decideSourceAccess({
    sourceId: "public_web_assisted",
    requestedMode: "public_web_assisted",
    operation: "public_web_assisted_scan",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    requestedPages: 11,
  });
  assert.equal(bulk.allowed, false);
  assert.equal(bulk.reasonCode, "BULK_SCRAPING_BLOCKED");
});

