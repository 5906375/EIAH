import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveKpiRefreshState,
  shouldShowKpiPlaceholder,
  shouldShowKpiRefreshingHint,
} from "./kpiRefreshState";

test("KPI refresh state resolves first-load, refresh and stable modes", () => {
  const firstLoad = resolveKpiRefreshState({ loading: true, hasSnapshot: false });
  const refreshing = resolveKpiRefreshState({ loading: true, hasSnapshot: true });
  const stable = resolveKpiRefreshState({ loading: false, hasSnapshot: true });

  assert.equal(firstLoad, "loading-first");
  assert.equal(refreshing, "refreshing");
  assert.equal(stable, "stable");
});

test("KPI refresh state helpers preserve snapshot during window re-fetch", () => {
  const firstLoad = resolveKpiRefreshState({ loading: true, hasSnapshot: false });
  const refreshWithSnapshot = resolveKpiRefreshState({ loading: true, hasSnapshot: true });
  const failedRefreshStillWithSnapshot = resolveKpiRefreshState({ loading: false, hasSnapshot: true });

  assert.equal(shouldShowKpiPlaceholder(firstLoad), true);
  assert.equal(shouldShowKpiRefreshingHint(firstLoad), false);

  assert.equal(shouldShowKpiPlaceholder(refreshWithSnapshot), false);
  assert.equal(shouldShowKpiRefreshingHint(refreshWithSnapshot), true);

  assert.equal(shouldShowKpiPlaceholder(failedRefreshStillWithSnapshot), false);
  assert.equal(shouldShowKpiRefreshingHint(failedRefreshStillWithSnapshot), false);
});
