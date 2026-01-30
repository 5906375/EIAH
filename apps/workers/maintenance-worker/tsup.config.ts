import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/services/memory.ts"],
  format: ["esm"],
  target: "node22",
  sourcemap: true,
  clean: true,
  splitting: false,
  bundle: false,
  noExternal: ["@eiah/core"],
  external: [
    "fs",
    "path",
    "os",
    "@prisma/client",
    "ioredis",
    "bullmq",
    "dotenv",
    "dotenv/config",
    "pino",
    "zod"
  ],
});
