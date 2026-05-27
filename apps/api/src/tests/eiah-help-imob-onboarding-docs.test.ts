import test from "node:test";
import assert from "node:assert/strict";

import { buildImobOnboardingHelpDocs } from "../services/eiahImobOnboardingHelpDocs";

test("EIAH help knowledge derives IMOB onboarding docs from the runtime resolver", () => {
  const docs = buildImobOnboardingHelpDocs({
    sourcePath: "apps/web/src/pages/app/agents/index.tsx",
    sourceMtime: "2026-05-27T12:00:00.000Z",
  });

  assert.ok(docs.length >= 4);
  const general = docs.find((item) => item.id === "help.eiah.imob.onboarding.general");
  assert.ok(general);
  assert.equal(general?.status, "canonica");
  assert.match(general?.answer ?? "", /chat imob conduz/i);
  assert.match(general?.answer ?? "", /quero captar um apartamento de 2 quartos em itaja[ií] para loca[cç][aã]o/i);
  assert.ok(general?.sourceFiles.includes("apps/api/src/services/imob/orchestrator/imobOnboardingResolver.ts"));
});
