import assert from "node:assert/strict";
import test from "node:test";

import { canActivateProducts, PRODUCT_ACTIVATION_PERMISSION } from "../services/workspaceResponsibility";

test("ativar produtos: Founder sempre; demais só com products.activate", () => {
  assert.equal(PRODUCT_ACTIVATION_PERMISSION, "products.activate");
  assert.equal(canActivateProducts({ selectedRoleKey: "founder", permissions: [] }), true);
  assert.equal(canActivateProducts({ selectedRoleKey: "Founder", permissions: [] }), true);
  assert.equal(canActivateProducts({ selectedRoleKey: "gestor", permissions: ["imob.chat.use", "workspace.manage_members"] }), false);
  assert.equal(canActivateProducts({ selectedRoleKey: "gestor", permissions: ["products.activate"] }), true);
  assert.equal(canActivateProducts({ selectedRoleKey: "corretor", permissions: ["imob.chat.use"] }), false);
  assert.equal(canActivateProducts(null), false, "sem perfil, nega");
});
