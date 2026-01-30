import { defineConfig } from "@prisma/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL!,
    shadowDatabaseUrl:
      process.env.SHADOW_DATABASE_URL ||
      "postgresql://postgres:senha@eiah-postgres:5432/eiah_builder_shadow?template=template_pgvector",
  },
});
