import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/queue/*.ts", "src/llm/*.ts", "src/logging/*.ts", "src/services/*.ts"],
  outDir: "dist",
  format: ["esm"],
  target: "node20",
  sourcemap: true,
  clean: false,
  splitting: false,
  bundle: true,
  shims: false,
  dts: false,
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
    "zod",
  ],
});
