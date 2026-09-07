import { defineConfig } from "@prisma/config";

// Config EXPERIMENTAL — aponta exclusivamente para o Postgres descartável do harness
// (container eiah-signalforward-poc-pg, porta 5544). Não referencia infraestrutura
// compartilhada, de staging ou produção.
export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: process.env.POC_DATABASE_URL!,
  },
});
