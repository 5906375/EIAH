import test from "node:test";
import assert from "node:assert/strict";

import { resolveImobDashboardTab } from "./imobDashboardTabs";

test("resolveImobDashboardTab normalizes legacy equipe to funil", () => {
  assert.equal(resolveImobDashboardTab("equipe", "", false), "funil");
});

test("resolveImobDashboardTab keeps current tabs stable", () => {
  assert.equal(resolveImobDashboardTab("funil", "", false), "funil");
  assert.equal(resolveImobDashboardTab("casos", "", false), "casos");
});

test("resolveImobDashboardTab keeps legacy command center redirects", () => {
  assert.equal(resolveImobDashboardTab("processos", "", false), "casos");
  assert.equal(resolveImobDashboardTab("", "processos", false), "casos");
  assert.equal(resolveImobDashboardTab("operacional", "", false), "casos");
});
