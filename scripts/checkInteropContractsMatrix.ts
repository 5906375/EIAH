import fs from "node:fs";

const CHECK = "check:interop-matrix";
const file = "contracts/interop-discovery.v1.baseline.json";
if (!fs.existsSync(file)) {
  console.error(JSON.stringify({ ok: false, check: CHECK, message: "interop matrix baseline missing", file }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, check: CHECK, file }, null, 2));
