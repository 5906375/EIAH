// Diagnóstico: pilha de quem chama Redis#connect (ioredis) — o construtor chama connect() de forma síncrona.
import { createRequire } from "node:module";
Error.stackTraceLimit = 40;
const require = createRequire("/home/jusall/projects/EIAH_IMOB_ASSET_DESTINATION/package.json");
const ioredis = require("/home/jusall/projects/EIAH_IMOB_ASSET_DESTINATION/node_modules/.pnpm/ioredis@5.8.2/node_modules/ioredis");
const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
const orig = Redis.prototype.connect;
const created = [];
Redis.prototype.connect = function (...a) {
  created.push((this.options?.connectionName ?? "?") + " :: " + new Error("x").stack.split("\n").slice(2).filter((l) => !l.includes("node:") && !l.includes("ioredis")).map((l) => l.trim().replace("/home/jusall/projects/EIAH_IMOB_ASSET_DESTINATION", ".")).slice(0, 8).join(" | "));
  return orig.apply(this, a);
};
setTimeout(() => process.stderr.write("\n[IOREDIS-CONNECT] " + created.length + "\n" + created.map((s, i) => "#" + i + ": " + s).join("\n") + "\n"), 45000).unref();
