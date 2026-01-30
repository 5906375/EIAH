type SqlTemplate = {
  strings: TemplateStringsArray;
  values: unknown[];
};

type RawValue = {
  raw: string;
};

export const Prisma = {
  JsonNull: { kind: "JsonNull" },
  DbNull: { kind: "DbNull" },
  sql(strings: TemplateStringsArray, ...values: unknown[]): SqlTemplate {
    return { strings, values };
  },
  raw(value: string): RawValue {
    return { raw: value };
  },
};

export class PrismaClient {}

export const prismaGlobal = {};

export function getPrismaForTenant() {
  return prismaGlobal;
}
