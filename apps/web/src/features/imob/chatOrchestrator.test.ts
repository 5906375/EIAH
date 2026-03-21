import test from "node:test";
import assert from "node:assert/strict";

import {
  IMOB_DRIVE_FOLDER_URL,
  buildImobActionPlan,
  buildImobDriveSearchUrl,
} from "./chatOrchestrator.ts";

test("imob search mode includes direct drive search and base folder sources", () => {
  const plan = buildImobActionPlan("buscar apartamentos para locação em São Paulo");

  assert.equal(plan.mode, "search");
  assert.equal(plan.action, "realestate.search_inventory");
  assert.ok(plan.search?.sources);
  assert.equal(plan.search?.sources?.length, 2);

  const driveSearch = plan.search?.sources?.find((source) => source.id === "drive-search");
  const driveFolder = plan.search?.sources?.find((source) => source.id === "drive-folder");

  assert.ok(driveSearch);
  assert.ok(driveFolder);
  assert.equal(driveFolder?.href, IMOB_DRIVE_FOLDER_URL);
  assert.match(driveSearch?.label ?? "", /Buscar no acervo IMOB/i);
  assert.match(driveSearch?.description ?? "", /Drive do IMOB/i);
  assert.equal(
    driveSearch?.href,
    buildImobDriveSearchUrl("buscar apartamentos para locação em São Paulo")
  );
});

test("drive search url is scoped to the IMOB folder and preserves the query", () => {
  const href = buildImobDriveSearchUrl("casa para venda em Santa Catarina");
  const decoded = decodeURIComponent(href);

  assert.match(href, /^https:\/\/drive\.google\.com\/drive\/search\?q=/);
  assert.match(decoded, /1rwqbWQmL2eiXYBY5UaPReubZ2sbQsBu3/);
  assert.match(decoded, /fullText contains 'casa para venda em Santa Catarina'/);
});
