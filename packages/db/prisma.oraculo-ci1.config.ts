import { defineConfig } from "@prisma/config";
// Schema-only validation/generation: no production URL or shadow fallback.
export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: { url: "postgresql://schema_only@127.0.0.1:1/oraculo_ci1_schema_only" },
});
