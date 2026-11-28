import assert from "node:assert/strict";
import test from "node:test";

import { FRONT_DOOR_PATH, resolvePlatformExperience } from "../services/experienceResolver";
import { resolvedExperienceSchema } from "../types/experienceResolverContract";

// ADR-010: o EIAH em /app/chat é a porta de entrada única; a superfície anterior fica no menu.

const base = {
  tenantId: "t1",
  workspaceId: "w1",
  activeDomain: "core" as const,
  availableDomains: ["core" as const],
  entitlements: { REAL_ESTATE_CORE: false, EXPORTS_ADDON: false, BILLING_INSIGHTS_ADDON: false },
  productInstallations: [] as Array<{ product: string; status: string }>,
};

const cases: Array<{ name: string; input: Parameters<typeof resolvePlatformExperience>[0]; previous: string }> = [
  { name: "founder", input: { ...base, roles: ["founder"] }, previous: "/app/economy" },
  { name: "tenant_admin", input: { ...base, roles: ["tenant_admin"] }, previous: "/app/economy" },
  { name: "service", input: { ...base, roles: ["service"] }, previous: "/app/runs" },
  { name: "membro", input: { ...base, roles: [] }, previous: "/self-service" },
  { name: "admin do workspace", input: { ...base, roles: ["admin"] }, previous: "/app/runs" },
  {
    name: "IMOB instalado",
    input: { ...base, roles: ["admin"], activeDomain: "imob", availableDomains: ["core", "imob"], productInstallations: [{ product: "IMOB", status: "active" }] },
    previous: "/app/chat?vertical=imob",
  },
  { name: "IMOB sem instalação", input: { ...base, roles: ["admin"], activeDomain: "imob" }, previous: "/app/runs" },
];

for (const { name, input, previous } of cases) {
  test(`entrada pelo front door: ${name}`, () => {
    const experience = resolvedExperienceSchema.parse(resolvePlatformExperience(input));
    assert.equal(experience.landingPath, FRONT_DOOR_PATH);
    assert.equal(experience.landingSurface, "chat");
    assert.equal(experience.primaryNavigation[0]?.path, FRONT_DOOR_PATH);
    assert.equal(experience.primaryNavigation.filter((item) => item.path === FRONT_DOOR_PATH).length, 1);
    const primary = experience.recommendedActions.filter((action) => action.priority === "primary");
    assert.deepEqual(primary.map((action) => action.path), [FRONT_DOOR_PATH], "uma só ação primária: o front door");
    assert.ok(
      experience.recommendedActions.some((action) => action.path === previous && action.priority === "secondary"),
      `a entrada anterior (${previous}) continua como ação secundária`,
    );
  });
}

test("experiência IMOB mantém hub operacional e não recomenda chat concorrente", () => {
  const experience = resolvePlatformExperience(cases.find((entry) => entry.name === "IMOB instalado")!.input);
  assert.ok(experience.primaryNavigation.some((item) => item.path === "/app/imob/dashboard"));
  assert.ok(experience.recommendedActions.some((item) => item.actionId === "continue_imob_chat"
    && item.surfaceId === "chat" && item.path === "/app/chat?vertical=imob"));
  assert.equal(experience.primaryNavigation.some((item) => item.path === "/app/imob/chat"), false);
  assert.equal(experience.recommendedActions.some((item) => item.path === "/app/imob/chat"), false);
});
