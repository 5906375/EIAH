import fs from "node:fs";
import crypto from "node:crypto";

const CHECK = "check:manifest-integrity";
if ((process.env.MOCK_MANIFEST_INTEGRITY || "").toLowerCase() === "fail") {
  console.error(JSON.stringify({ ok: false, check: CHECK, message: "mock forced failure" }, null, 2));
  process.exit(1);
}

const file = process.env.E2E_MANIFEST_PATH || "ops/evidence/latest/high-e2e-manifest.json";
if (!fs.existsSync(file)) {
  console.error(JSON.stringify({ ok: false, check: CHECK, message: "manifest not found", file }, null, 2));
  process.exit(1);
}
const raw = fs.readFileSync(file, "utf8");
const data = JSON.parse(raw);
if (!data.bundleHash) {
  console.error(JSON.stringify({ ok: false, check: CHECK, message: "bundleHash missing", file }, null, 2));
  process.exit(1);
}
const hash = crypto.createHash("sha256").update(raw).digest("hex");
console.log(JSON.stringify({ ok: true, check: CHECK, file, contentSha256: hash, bundleHash: data.bundleHash }, null, 2));
