import test from "node:test";
import assert from "node:assert/strict";

import { routeMarketScanIntent } from "../services/imob/marketScan/marketScanIntentRouter";
import { resolveMarketScanModelTaskPolicy } from "../services/imob/marketScan/marketScanModelPolicy";

test("market scan router classifies governed region scan and requires run plus source gate", () => {
  const routed = routeMarketScanIntent("Analise apartamentos em Moema até R$ 900 mil");

  assert.equal(routed.missionType, "market_scan_region");
  assert.equal(routed.requiresMarketScanRun, true);
  assert.equal(routed.requiresSourceAccessGate, true);
  assert.equal(routed.blocked, false);
});

test("market scan router separates public web assisted scan from authorized scan", () => {
  const routed = routeMarketScanIntent("Veja ofertas públicas parecidas em Pinheiros na internet");

  assert.equal(routed.missionType, "public_web_assisted_scan");
  assert.equal(routed.requiresMarketScanRun, true);
  assert.equal(routed.requiresSourceAccessGate, true);
});

test("market scan model policy is task based and configurable by env", () => {
  const routerPolicy = resolveMarketScanModelTaskPolicy("intent_router");
  const analysisPolicy = resolveMarketScanModelTaskPolicy("market_analysis");

  assert.equal(routerPolicy.requiresStructuredOutput, true);
  assert.equal(routerPolicy.temperature, 0);
  assert.equal(routerPolicy.modelEnv, "IMOB_MARKET_SCAN_ROUTER_MODEL");
  assert.equal(analysisPolicy.requiresEvidence, true);
  assert.equal(analysisPolicy.providerEnv, "IMOB_MARKET_SCAN_ANALYSIS_PROVIDER");
});

