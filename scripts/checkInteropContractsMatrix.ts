import fs from "node:fs";

const CHECK = "check:interop-matrix";
const required = [
  "contracts/interop-discovery.v1.baseline.json",
  "contracts/agent-protocol.v1.baseline.json",
  "contracts/agent-protocol.v1.schema.json",
  "contracts/examples/agent-protocol.v1.example.json",
];

const missing = required.filter((file) => !fs.existsSync(file));
if (missing.length > 0) {
  console.error(JSON.stringify({ ok: false, check: CHECK, message: "interop matrix baseline missing", missing }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, check: CHECK, files: required }, null, 2));
