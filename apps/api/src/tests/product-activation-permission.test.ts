import assert from "node:assert/strict";
import test from "node:test";

import {
  canActivateProducts,
  DEFAULT_INVITATION_EXPIRY_HOURS,
  governProductActivationGrant,
  PRODUCT_ACTIVATION_PERMISSION,
} from "../services/workspaceResponsibility";

test("ativar produtos: Founder sempre; demais só com products.activate", () => {
  assert.equal(PRODUCT_ACTIVATION_PERMISSION, "products.activate");
  assert.equal(canActivateProducts({ selectedRoleKey: "founder", permissions: [] }), true);
  assert.equal(canActivateProducts({ selectedRoleKey: "Founder", permissions: [] }), true);
  assert.equal(canActivateProducts({ selectedRoleKey: "gestor", permissions: ["imob.chat.use", "workspace.manage_members"] }), false);
  assert.equal(canActivateProducts({ selectedRoleKey: "gestor", permissions: ["products.activate"] }), true);
  assert.equal(canActivateProducts({ selectedRoleKey: "corretor", permissions: ["imob.chat.use"] }), false);
  assert.equal(canActivateProducts(null), false, "sem perfil, nega");
});

test("ADR-011: ninguém dá o que não tem — quem não ativa não concede nem retira products.activate", () => {
  const key = PRODUCT_ACTIVATION_PERMISSION;
  assert.deepEqual(
    governProductActivationGrant({ actorCanActivate: true, requested: ["imob.chat.use", key] }),
    ["imob.chat.use", key],
    "quem ativa concede",
  );
  assert.deepEqual(
    governProductActivationGrant({ actorCanActivate: true, requested: ["imob.chat.use"], previous: [key] }),
    ["imob.chat.use"],
    "quem ativa retira",
  );
  assert.deepEqual(
    governProductActivationGrant({ actorCanActivate: false, requested: ["imob.chat.use", key], previous: [] }),
    ["imob.chat.use"],
    "quem não ativa não concede",
  );
  assert.deepEqual(
    governProductActivationGrant({ actorCanActivate: false, requested: ["imob.chat.use"], previous: [key] }),
    ["imob.chat.use", key],
    "quem não ativa não retira",
  );
});

test("ADR-011: convite (link para criar a senha) vale 72 horas", () => {
  assert.equal(DEFAULT_INVITATION_EXPIRY_HOURS, 72);
});
