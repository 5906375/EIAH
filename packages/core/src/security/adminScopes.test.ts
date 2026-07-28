import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ADMIN_SCOPE_CATALOG,
  ADMIN_SCOPES,
  isAdminScope,
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
