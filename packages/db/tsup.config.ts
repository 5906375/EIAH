import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/client.ts", "src/middleware/tenantGuard.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  bundle: false,
  outDir: "dist",
  external: [
    "@prisma/client",
    "@prisma/client-runtime-utils",
    "@prisma/adapter-pg",
    "pg"
  ],
});
