/**
 * ESLint custom rule
 *
 * BLOQUEIA:
 *   import { prisma } from "@repo/db"
 *   import { PrismaClient } from "@repo/db"
 *   qualquer uso de "prisma.run.*" fora de req.prisma ou getPrismaForTenant()
 *
 * Motivo:
 *   garantir isolamento multi-tenant e impedir uso de client global.
 */

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Proíbe uso de prisma global ou PrismaClient do @repo/db em código tenantizado.",
    },
    messages: {
      noGlobalPrisma:
        "Uso proibido do prisma global. Use req.prisma ou getPrismaForTenant()",
    },
  },

  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value === "@repo/db") {
          for (const spec of node.specifiers) {
            if (
              spec.imported &&
              (spec.imported.name === "prisma" ||
                spec.imported.name === "PrismaClient")
            ) {
              context.report({
                node: spec,
                messageId: "noGlobalPrisma",
              });
            }
          }
        }
      },
    };
  },
};
