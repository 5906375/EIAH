import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ADMIN_SCOPE_CATALOG,
  ADMIN_SCOPES,
  COMMERCIAL_AUTHORITY_SCOPE_CATALOG,
  COMMERCIAL_AUTHORITY_SCOPES,
  isAdminScope,
  isCommercialAuthorityScope,
  isReservedAuthorityScopeName,
} from "./adminScopes.js";

const documentation = readFileSync(
  new URL("../../../../docs/ops/authorization-scopes-catalog.md", import.meta.url),
  "utf8",
);

test("keeps the ratified administrative scope names canonical and unique", () => {
  const scopes = Object.values(ADMIN_SCOPES);

  assert.deepEqual(scopes, ["actions.admin", "tools.admin"]);
  assert.equal(new Set(scopes).size, scopes.length);
  assert.equal(isAdminScope("actions.admin"), true);
  assert.equal(isAdminScope("tools.admin"), true);
  assert.equal(isAdminScope("governance:calibrate"), false);
});

test("requires ratification metadata on every administrative scope", () => {
  for (const definition of ADMIN_SCOPE_CATALOG) {
    assert.equal(definition.status, "ratified");
    assert.equal(definition.approver, "Carlos Alberto Merlo");
    assert.equal(definition.ratifiedAt, "2026-07-28");
    assert.equal(definition.decisionRef, "AUTHZ-SCOPE-0/2026-07-28");
    assert.ok(definition.routes.length > 0);
  }
});

test("keeps the documentation synchronized with the canonical source", () => {
  assert.match(
    documentation,
    /`packages\/core\/src\/security\/adminScopes\.ts`/,
  );

  for (const definition of ADMIN_SCOPE_CATALOG) {
    assert.match(documentation, new RegExp(`\\\`${definition.scope}\\\``));
    for (const route of definition.routes) {
      assert.ok(
        documentation.includes(`\`${route}\``),
        `missing documented route: ${route}`,
      );
    }
  }
});

test("adopts marketplace.subscribe as a distinct commercial scope with no default grant and no claimed formal ratification", () => {
  assert.deepEqual(Object.values(COMMERCIAL_AUTHORITY_SCOPES), ["marketplace.subscribe"]);
  assert.equal(isCommercialAuthorityScope("marketplace.subscribe"), true);
  assert.equal(isAdminScope("marketplace.subscribe"), false);
  assert.equal(isCommercialAuthorityScope("actions.admin"), false);
  assert.deepEqual(Object.values(ADMIN_SCOPES), ["actions.admin", "tools.admin"]);

  for (const definition of COMMERCIAL_AUTHORITY_SCOPE_CATALOG) {
    assert.equal(definition.status, "adopted_pending_formal_ratification");
    assert.equal(definition.formalRatification, "pending");
    assert.equal(definition.defaultGrant, "none");
    assert.equal(definition.productDecisionBy, "Carlos Alberto Merlo");
    assert.equal(definition.decisionRef, "AUTHZ-SCOPE-1/2026-10-12");
    assert.equal("ratifiedAt" in definition, false, "nenhuma data de ratificação formal é afirmada");
    assert.equal("approver" in definition, false);
    assert.ok(definition.routes.length > 0);
    assert.match(documentation, new RegExp(`\\\`${definition.scope}\\\``));
    for (const route of definition.routes) {
      assert.ok(documentation.includes(`\`${route}\``), `missing documented route: ${route}`);
    }
  }
});

test("reserves every canonical scope name against Marketplace item names", () => {
  for (const name of ["actions.admin", "tools.admin", "marketplace.subscribe", "  Marketplace.Subscribe  ", "ACTIONS.ADMIN"]) {
    assert.equal(isReservedAuthorityScopeName(name), true, name);
  }
  for (const name of ["mkt", "marketplace", "marketplace.subscribe.extra", "", "   ", null, undefined, 42]) {
    assert.equal(isReservedAuthorityScopeName(name), false, String(name));
  }
});
