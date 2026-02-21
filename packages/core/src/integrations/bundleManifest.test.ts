import test from "node:test";
import assert from "node:assert/strict";
import { buildToolContractAdapters, loadBundleManifestFromFile } from "./bundleManifest";

const manifestPath = new URL("../../../../contracts/bundles/nftdiarias.bundle.json", import.meta.url);

test("loads NFTDiarias bundle manifest", () => {
  const manifest = loadBundleManifestFromFile(manifestPath.pathname);
  assert.equal(manifest.bundleId, "nftdiarias.bundle");
  assert.equal(manifest.drivers.length >= 3, true);
});

test("builds tool contract adapters and keeps web3 disabled by feature-flag", () => {
  const previous = process.env.WEB3_EXECUTOR_ENABLED;
  process.env.WEB3_EXECUTOR_ENABLED = "false";

  try {
    const manifest = loadBundleManifestFromFile(manifestPath.pathname);
    const adapters = buildToolContractAdapters({
      manifest,
      tenantId: "tenant-A",
    });

    const web3Adapter = adapters.find((adapter) => adapter.name === "web3.anchor_receipt");
    assert.ok(web3Adapter);
    assert.equal(web3Adapter?.metadata.enabled, false);

    const ipfsAdapter = adapters.find((adapter) => adapter.name === "ipfs.pin_document");
    assert.ok(ipfsAdapter);
    assert.equal(ipfsAdapter?.metadata.enabled, true);
  } finally {
    if (previous == null) {
      delete process.env.WEB3_EXECUTOR_ENABLED;
    } else {
      process.env.WEB3_EXECUTOR_ENABLED = previous;
    }
  }
});
