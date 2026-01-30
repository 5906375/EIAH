import { prismaGlobal } from "@repo/db";

export async function registerAction(def: {
  name: string;
  version: string;
  description?: string;
  schema?: any;
}) {
  return prismaGlobal.actionVersion.upsert({
    where: {
      unique_name_version: {
        name: def.name,
        version: def.version
      }
    },
    update: def,
    create: def
  });
}

export async function listActions() {
  return prismaGlobal.actionVersion.findMany({
    orderBy: [{ name: "asc" }, { version: "desc" }]
  });
}
